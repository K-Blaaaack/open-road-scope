"""Simulated ELM327 device with physically-plausible waveforms and fault injection.

Used for development without a real vehicle. Values are synthesized from a
virtual driving cycle so gauges actually move.
"""

from __future__ import annotations

import math
import random
import time
from typing import Any

from .device import Device, DeviceError

_SIM_VIN = "SIMELM327TEST0001"

_SUPPORTED_PIDS = {
    "SPEED",
    "RPM",
    "COOLANT_TEMP",
    "ENGINE_LOAD",
    "MAF",
    "THROTTLE_POS",
    "FUEL_LEVEL",
    "INTAKE_TEMP",
    "INTAKE_PRESSURE",
    "FUEL_RATE",
    "BAROMETRIC_PRESSURE",
    "AMBIANT_AIR_TEMP",
    "VOLTAGE",
    "RUN_TIME",
    "TIMING_ADVANCE",
    "DISTANCE_SINCE_DTC_CLEAR",
}


class SimDevice(Device):
    """Virtual vehicle. Driving cycle: accel 0-40s, cruise 40-80s, decel 80-120s."""

    def __init__(self, fault: bool = False, drop_every: float | None = None):
        self._fault = fault
        self._drop_every = drop_every  # seconds; sim drop -> disconnect window
        self._start = time.monotonic()
        self._connected = False
        self._dtc: list[str] = []
        self._vin = _SIM_VIN
        random.seed(7)

    def connect(self) -> bool:
        self._start = time.monotonic()
        self._connected = True
        self._dtc = ["P0301", "P0420"] if random.random() < 0.5 else []
        return True

    def is_connected(self) -> bool:
        if not self._connected:
            return False
        if self._drop_every:
            t = self.elapsed()
            window = min(3.0, self._drop_every * 0.5)
            # disconnect window at the end of every period
            phase = t % self._drop_every
            if phase >= self._drop_every - window:
                return False
        return True

    def elapsed(self) -> float:
        return time.monotonic() - self._start

    def _cycle(self, t: float) -> tuple[float, float]:
        """Return (pedal 0..1, engine_on) for the driving cycle."""
        phase = t % 120.0
        if phase < 40:
            pedal = phase / 40.0  # accel ramp
        elif phase < 80:
            pedal = 1.0 - 0.15 * (phase - 40) / 40.0  # cruise, slight settle
        elif phase < 105:
            pedal = max(0.0, 1.0 - (phase - 80) / 25.0)  # decel
        else:
            pedal = 0.0  # idle
        if t < 5.0:
            pedal = min(pedal, 0.2)  # cold start
        engine_on = t < 115.0
        return pedal, engine_on

    def _value(self, pid: str) -> float | None:
        t = self.elapsed()
        if not self.is_connected():
            return None
        if self._fault and random.random() < 0.05:
            return None  # simulate lost frame / timeout
        pedal, engine_on = self._cycle(t)
        noise = lambda amp: random.uniform(-amp, amp)  # noqa: E731
        speed = pedal * 130.0 + noise(1.0)
        if pid == "SPEED":
            return max(0.0, speed)
        if pid == "RPM":
            base = 750.0 + speed * 9.0
            shift = 120.0 * math.sin(t * math.pi / 5.0) if 100 < speed < 118 else 0.0
            return base + shift + noise(40.0) if engine_on else 0.0
        if pid == "COOLANT_TEMP":
            warmup = 20.0 + 68.0 * min(1.0, t / 120.0)
            return warmup + noise(0.5) if engine_on else warmup
        if pid == "ENGINE_LOAD":
            return 12.0 + pedal * 78.0 + noise(3.0)
        if pid == "MAF":
            return 1.5 + pedal * 42.0 + noise(0.8)
        if pid == "THROTTLE_POS":
            # 节气门随油门开度，怠速时保持小幅抖动且不低于 0
            return max(0.0, pedal * 82.0 + noise(1.5))
        if pid == "FUEL_LEVEL":
            return max(0.0, 62.0 - t / 360.0 + noise(0.2))
        if pid == "INTAKE_TEMP":
            return 24.0 + 9.0 * math.sin(t / 60.0) + noise(0.5)
        if pid == "INTAKE_PRESSURE":
            return 28.0 + pedal * 45.0 + noise(1.0)
        if pid == "FUEL_RATE":
            return 0.7 + pedal * 6.5 + noise(0.2) if engine_on else 0.0
        if pid == "BAROMETRIC_PRESSURE":
            # 缓慢气压漂移，模拟天气变化
            return 101.3 + 0.6 * math.sin(t / 240.0) + noise(0.05)
        if pid == "AMBIANT_AIR_TEMP":
            # 缓慢昼夜温度漂移
            return 24.0 + 4.0 * math.sin(t / 480.0 + 1.0) + noise(0.1)
        if pid == "VOLTAGE":
            # 电压随转速与负荷波动（充电控制 + 纹波）
            if engine_on:
                return 14.2 - pedal * 0.5 + 0.15 * math.sin(t * 4.0) + noise(0.03)
            return 12.6 - min(0.3, t * 0.0001) + noise(0.03)
        if pid == "RUN_TIME":
            return round(t, 1)
        if pid == "TIMING_ADVANCE":
            return 4.0 + pedal * 22.0 + noise(1.0)
        if pid == "DISTANCE_SINCE_DTC_CLEAR":
            return speed * t / 3600.0
        return None

    def query_pid(self, pid: str) -> float | None:
        if pid not in _SUPPORTED_PIDS:
            return None
        return self._value(pid)

    def query_command(self, cmd: str) -> Any:
        if not self.is_connected():
            raise DeviceError("not connected")
        if cmd == "GET_DTC":
            return list(self._dtc)
        if cmd == "CLEAR_DTC":
            self._dtc = []
            return True
        if cmd == "VIN":
            return _SIM_VIN
        raise DeviceError(f"unknown command: {cmd}")

    def protocol_name(self) -> str | None:
        return "ISO 15765-4 (CAN 11/500)"

    def elm_version(self) -> str | None:
        return "SIM v1.0"

    def mode(self) -> str:
        return "sim"

    def close(self) -> None:
        self._connected = False
