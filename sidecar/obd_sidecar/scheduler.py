"""Tiered polling scheduler: groups subscriptions by interval, merges due reads
into single data events."""

from __future__ import annotations

import logging
import math
import threading
import time
from typing import Callable

from .device import Device

logger = logging.getLogger("sidecar.scheduler")

DEFAULT_TICK = 0.05  # 50ms scheduler tick

# 读取间隔的合法范围（ms），与渲染进程 shared/obd.ts 的 READ_INTERVAL_* 保持一致：
# 下限受 ELM327 单条 PID 请求往返耗时限制，再小只会让请求排队、数据反而滞后；
# 上限保证仪表仍具备实时意义。
MIN_INTERVAL_MS = 100
MAX_INTERVAL_MS = 2000
DEFAULT_INTERVAL_MS = 200
# 读取间隔调节步进（ms），与渲染进程 shared/obd.ts 的 READ_INTERVAL_STEP 保持一致。
# 步进以 MIN_INTERVAL_MS 为锚点对齐（等价于 input type=range 的 min + k*step），
# 这样渲染进程回写滑块值时不会被拽到相邻格。
INTERVAL_STEP_MS = 50


def clamp_interval(interval: object) -> int:
    """把外部传入的读取间隔规整到合法区间。

    与渲染进程 shared/obd.ts 的 clampReadInterval 保持完全一致：布尔、空串、非数值
    与非有限数值（Infinity/NaN）都回退默认值，其余按 50ms 步进、以 MIN_INTERVAL_MS
    为锚点对齐，再夹到合法区间。半个步进向正无穷取整，等价于 JS 的
    Math.round((n - MIN) / 50) * 50 + MIN，避免 Python round 银行家舍入与渲染进程不一致。

    @param interval - 渲染进程或 RPC 传入的间隔（ms），可能是数值、字符串或 None。
    @returns 落在 [MIN_INTERVAL_MS, MAX_INTERVAL_MS] 内、且为 50ms 整数倍的毫秒值；
        非法或非有限值回退 DEFAULT_INTERVAL_MS。
    """
    try:
        # 布尔在 JS 中会被 Number(true)=1，但这里按「非数值输入」回退默认值，保持一致
        if isinstance(interval, bool):
            return DEFAULT_INTERVAL_MS
        if isinstance(interval, (int, float)):
            n = float(interval)
        elif isinstance(interval, str) and interval.strip() != "":
            n = float(interval.strip())
        else:
            return DEFAULT_INTERVAL_MS
    except (TypeError, ValueError, OverflowError):
        # 非数值字符串 / None / 无法转为浮点的大整数，统一回退默认值
        return DEFAULT_INTERVAL_MS
    if not math.isfinite(n):
        # json 解析出的 Infinity/NaN 走到这里：非有限值回退默认值，避免 int() 抛异常
        return DEFAULT_INTERVAL_MS
    # 与渲染进程同锚点（MIN_INTERVAL_MS）对齐，半个步进向正无穷取整
    steps = math.floor((n - MIN_INTERVAL_MS) / INTERVAL_STEP_MS + 0.5)
    stepped = MIN_INTERVAL_MS + steps * INTERVAL_STEP_MS
    return max(MIN_INTERVAL_MS, min(MAX_INTERVAL_MS, stepped))


class Subscription:
    __slots__ = ("pids", "interval", "due")

    def __init__(self, pids: list[str], interval: int):
        # 同一订阅内 PID 去重，保持传入顺序稳定（dict 自 3.7 起保序）
        self.pids = list(dict.fromkeys(pids))
        self.interval = clamp_interval(interval) / 1000.0
        self.due: dict[str, float] = {p: 0.0 for p in self.pids}


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
        # 订阅表用 dict[int, Subscription]：subId 由单调递增计数器生成，只增不复用。
        # 若用列表下标当 id，删除中间项会导致后续 id 前移、渲染层旧 id 越界，
        # unsubscribe 静默 no-op 造成订阅永久泄漏。
        self._subs: dict[int, Subscription] = {}
        self._next_id = 0
        self._lock = threading.Lock()
        self._stop = threading.Event()
        self._thread: threading.Thread | None = None

    def subscribe(self, pids: list[str], interval: int) -> int:
        """新增订阅并返回唯一 subId（单调递增、只增不复用）。

        @param pids - 要周期读取的 PID 列表，内部会去重并保持顺序。
        @param interval - 读取间隔（ms），内部夹取后换算成秒。
        @returns 本次订阅的 subId，供 unsubscribe 使用。
        """
        with self._lock:
            sub_id = self._next_id
            self._next_id += 1
            self._subs[sub_id] = Subscription(pids, interval)
            return sub_id

    def unsubscribe(self, sub_id: int) -> bool:
        """按 subId 删除订阅；未知 id 返回 False 交由上层报错。

        @param sub_id - subscribe 返回的订阅 id。
        @returns 已知 id 且删除成功返回 True；未知 id 返回 False。
        """
        with self._lock:
            if sub_id not in self._subs:
                return False
            del self._subs[sub_id]
            return True

    def active_pids(self) -> list[str]:
        """返回当前所有订阅覆盖的 PID（去重、保持首次出现顺序）。

        @returns 去重后的 PID 列表。
        """
        pids: list[str] = []
        with self._lock:
            for sub in self._subs.values():
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
        seen: set[str] = set()
        with self._lock:
            for sub in self._subs.values():
                for pid in sub.pids:
                    if now - sub.due[pid] >= sub.interval:
                        sub.due[pid] = now
                        # 同一周期内同一 PID 只入队一次：多个订阅共享 PID 时去重，
                        # 避免每周期串行查 N 次（seen 保持稳定顺序，即首次出现顺序）。
                        if pid not in seen:
                            seen.add(pid)
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
