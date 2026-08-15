"""Tiered polling scheduler: groups subscriptions by interval, merges due reads
into single data events."""

from __future__ import annotations

import logging
import threading
import time
from typing import Callable

from .device import Device

logger = logging.getLogger("sidecar.scheduler")

DEFAULT_TICK = 0.05  # 50ms scheduler tick


class Subscription:
    __slots__ = ("pids", "interval", "due")

    def __init__(self, pids: list[str], interval: int):
        self.pids = list(pids)
        self.interval = max(50, interval) / 1000.0
        self.due: dict[str, float] = {p: 0.0 for p in pids}


class Scheduler:
    """Polls subscriptions on background thread, pushes merged frames via callback.

    Callback signature: on_data(values: dict[str, float], ts: int)
    """

    def __init__(
        self,
        device: Device,
        on_data: Callable[[dict[str, float], int], None] | None = None,
        on_log: Callable[[str], None] | None = None,
        tick: float = DEFAULT_TICK,
    ):
        self._device = device
        self._on_data = on_data
        self._on_log = on_log
        self._tick = tick
        self._subs: list[Subscription] = []
        self._lock = threading.Lock()
        self._stop = threading.Event()
        self._thread: threading.Thread | None = None

    def subscribe(self, pids: list[str], interval: int) -> int:
        with self._lock:
            self._subs.append(Subscription(pids, interval))
            return len(self._subs) - 1

    def unsubscribe(self, index: int) -> None:
        with self._lock:
            if 0 <= index < len(self._subs):
                del self._subs[index]

    def clear(self) -> None:
        with self._lock:
            self._subs.clear()

    def active_pids(self) -> list[str]:
        pids: list[str] = []
        with self._lock:
            for sub in self._subs:
                for p in sub.pids:
                    if p not in pids:
                        pids.append(p)
        return pids

    def start(self) -> None:
        if self._thread and self._thread.is_alive():
            return
        self._stop.clear()
        self._thread = threading.Thread(target=self._loop, name="obd-scheduler", daemon=True)
        self._thread.start()

    def stop(self) -> None:
        self._stop.set()
        if self._thread:
            self._thread.join(timeout=1.0)
            self._thread = None

    def _loop(self) -> None:
        while not self._stop.is_set():
            cycle_start = time.monotonic()
            self._tick_once()
            elapsed = time.monotonic() - cycle_start
            self._stop.wait(max(0.0, self._tick - elapsed))

    def _tick_once(self) -> None:
        now = time.monotonic()
        due: list[str] = []
        with self._lock:
            for sub in self._subs:
                for pid in sub.pids:
                    if now - sub.due[pid] >= sub.interval:
                        sub.due[pid] = now
                        due.append(pid)
        if not due:
            return
        if not self._device.is_connected():
            return
        values: dict[str, float] = {}
        failures = 0
        for pid in due:
            try:
                value = self._device.query_pid(pid)
            except Exception as e:  # noqa: BLE001
                logger.warning("query %s raised: %s", pid, e)
                value = None
            if value is None:
                failures += 1
                continue
            values[pid] = round(value, 4)
        if self._on_data and values:
            self._on_data(values, int(time.time() * 1000))
        if failures and self._on_log:
            self._on_log(f"{failures}/{len(due)} pids unreadable this cycle")
