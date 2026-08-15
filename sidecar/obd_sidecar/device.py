"""Real OBD device backed by python-obd (ELM327 over USB/Bluetooth SPP)."""

from __future__ import annotations

import logging
import time
from abc import ABC, abstractmethod
from typing import Any

import obd
import serial.tools.list_ports

logger = logging.getLogger("sidecar.real")


class DeviceError(Exception):
    pass


class Device(ABC):
    """Minimal OBD device interface used by the scheduler."""

    @abstractmethod
    def connect(self) -> bool:
        """Establish connection. Returns True on success."""

    @abstractmethod
    def is_connected(self) -> bool:
        ...

    @abstractmethod
    def query_pid(self, pid: str) -> float | None:
        """Query a periodic PID, returns physical-unit value or None on failure."""

    @abstractmethod
    def query_command(self, cmd: str) -> Any:
        """Query a one-shot command (GET_DTC/CLEAR_DTC/VIN)."""

    @abstractmethod
    def protocol_name(self) -> str | None:
        ...

    @abstractmethod
    def elm_version(self) -> str | None:
        ...

    @abstractmethod
    def mode(self) -> str:
        """'sim' or 'real'"""

    @abstractmethod
    def close(self) -> None:
        ...


# python-obd 输出默认单位即物理单位（km/h, °C, ...），直接取 magnitude
_PID_TO_CMD = {
    "SPEED": "SPEED",
    "RPM": "RPM",
    "COOLANT_TEMP": "COOLANT_TEMP",
    "ENGINE_LOAD": "ENGINE_LOAD",
    "MAF": "MAF",
    "THROTTLE_POS": "THROTTLE_POS",
    "FUEL_LEVEL": "FUEL_LEVEL",
    "INTAKE_TEMP": "INTAKE_TEMP",
    "INTAKE_PRESSURE": "INTAKE_PRESSURE",
    "FUEL_RATE": "FUEL_RATE",
    "BAROMETRIC_PRESSURE": "BAROMETRIC_PRESSURE",
    "AMBIANT_AIR_TEMP": "AMBIANT_AIR_TEMP",
    "RUN_TIME": "RUN_TIME",
    "TIMING_ADVANCE": "TIMING_ADVANCE",
    "DISTANCE_SINCE_DTC_CLEAR": "DISTANCE_SINCE_DTC_CLEAR",
}


def _classify_port(p) -> str:
    """按设备名/硬件信息将串口分为 usb / bluetooth / other"""
    name = (p.device or "").lower()
    hwid = (p.hwid or "").lower()
    desc = (p.description or "").lower()
    if (
        "rfcomm" in name
        or "bluetooth" in name
        or "bluetooth" in hwid
        or "bt" in hwid
        or "bluetooth" in desc
        or name.startswith("tty.bt")
        or name.startswith("tty.bluetooth")
    ):
        return "bluetooth"
    if (
        "usb" in name
        or "usb" in hwid
        or "ttyusb" in name
        or "ttyacm" in name
        or "tty.usb" in name
        or p.vid is not None
    ):
        return "usb"
    return "other"


def list_serial_ports() -> list[dict[str, str]]:
    """枚举串口并按类型分类，供连接页分组展示"""
    return [
        {
            "name": p.device,
            "description": p.description or "",
            "type": _classify_port(p),
        }
        for p in serial.tools.list_ports.comports()
    ]


class RealDevice(Device):
    def __init__(self, port: str | None = None, baudrate: int | None = None, fast: bool = True):
        self._port = port
        self._baudrate = baudrate
        self._fast = fast
        self._conn: obd.OBD | None = None

    def _resolve_port(self) -> str | None:
        """将 host:port 形式的网络串口（RJ45 OBD）转为 pyserial 的 socket:// URL"""
        port = self._port
        if not port or "://" in port:
            return port
        # Windows 盘符/COM 口与类 Unix 设备路径不当作网络串口
        if port.startswith(("/", "\\")) or port.lower().startswith("com"):
            return port
        if ":" in port:
            host, _, port_no = port.rpartition(":")
            if host and port_no.isdigit():
                return f"socket://{host}:{port_no}"
        return port

    def connect(self) -> bool:
        self.close()
        try:
            port = self._resolve_port()
            logger.info("connecting to %s", port or "auto-scan")
            self._conn = obd.OBD(
                portstr=port,
                baudrate=self._baudrate,
                fast=self._fast,
                timeout=0.3,
            )
        except Exception as e:  # noqa: BLE001 - python-obd raises broadly
            logger.warning("connect failed: %s", e)
            self._conn = None
            return False
        if not self._conn.is_connected():
            logger.warning("no connection to vehicle")
            self._conn = None
            return False
        return True

    def is_connected(self) -> bool:
        return self._conn is not None and self._conn.is_connected()

    def _get_cmd(self, pid: str):
        name = _PID_TO_CMD.get(pid)
        if name is None:
            return None
        return getattr(obd.commands, name, None)

    def query_pid(self, pid: str) -> float | None:
        if not self.is_connected():
            return None
        cmd = self._get_cmd(pid)
        if cmd is None:
            return None
        try:
            resp = self._conn.query(cmd)
        except Exception as e:  # noqa: BLE001
            logger.warning("query %s failed: %s", pid, e)
            return None
        if resp is None or resp.is_null():
            return None
        value = resp.value
        if value is None:
            return None
        try:
            return float(value.magnitude)
        except Exception:  # noqa: BLE001
            return None

    def query_command(self, cmd: str) -> Any:
        if not self.is_connected():
            raise DeviceError("not connected")
        obd_cmd = getattr(obd.commands, cmd, None)
        if obd_cmd is None:
            raise DeviceError(f"unknown command: {cmd}")
        resp = self._conn.query(obd_cmd)
        if resp is None or resp.is_null():
            return None
        value = resp.value
        if cmd == "GET_DTC":
            return [str(code) for code in (value or [])]
        if cmd == "CLEAR_DTC":
            return bool(value)
        if cmd == "VIN":
            return str(value)
        return None

    def protocol_name(self) -> str | None:
        return self._conn.protocol_name() if self._conn else None

    def elm_version(self) -> str | None:
        if not self._conn or not self._conn.interface:
            return None
        try:
            return self._conn.interface.version
        except Exception:  # noqa: BLE001
            return None

    def mode(self) -> str:
        return "real"

    def close(self) -> None:
        if self._conn is not None:
            try:
                self._conn.close()
            except Exception:  # noqa: BLE001
                pass
            self._conn = None


def wait_for_port(port: str, timeout: float = 10.0) -> bool:
    """Block until the given port appears (handles adapter power-up race)."""
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        if any(p["name"] == port for p in list_serial_ports()):
            return True
        time.sleep(0.5)
    return False
