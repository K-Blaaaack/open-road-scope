import time

import pytest

from obd_sidecar.scheduler import (
    DEFAULT_INTERVAL_MS,
    MAX_INTERVAL_MS,
    MIN_INTERVAL_MS,
    Scheduler,
    clamp_interval,
)


class FakeDevice:
    """Deterministic device for scheduler tests."""

    def __init__(self):
        self.connected = True
        self.queries = []

    def is_connected(self):
        return self.connected

    def query_pid(self, pid):
        self.queries.append(pid)
        return 100.0

    def connect(self):
        self.connected = True
        return True

    def query_command(self, cmd):
        return None

    def protocol_name(self):
        return None

    def elm_version(self):
        return None

    def mode(self):
        return "fake"

    def close(self):
        pass


def test_scheduler_merges_due_pids_into_one_frame():
    device = FakeDevice()
    frames = []
    sched = Scheduler(device, on_data=lambda v, ts: frames.append((v, ts)), tick=0.01)
    sched.start()
    sched.subscribe(["RPM", "SPEED"], 50)
    sched.subscribe(["COOLANT_TEMP"], 50)
    time.sleep(0.25)
    sched.stop()

    assert frames, "expected at least one data frame"
    latest = frames[-1][0]
    assert set(latest.keys()) == {"RPM", "SPEED", "COOLANT_TEMP"}
    assert latest["RPM"] == 100.0


def test_scheduler_respects_interval_buckets():
    device = FakeDevice()
    frames = []
    sched = Scheduler(device, on_data=lambda v, ts: frames.append(v), tick=0.01)
    sched.start()
    sched.subscribe(["RPM"], 1000)  # slow
    sched.subscribe(["SPEED"], MIN_INTERVAL_MS)  # fast（下限 100ms）
    time.sleep(0.45)
    sched.stop()

    rpm_count = sum(1 for f in frames if "RPM" in f)
    speed_count = sum(1 for f in frames if "SPEED" in f)
    assert speed_count > rpm_count * 3, f"expected SPEED to outpace RPM: {rpm_count}/{speed_count}"


def test_scheduler_skips_when_disconnected():
    device = FakeDevice()
    device.connected = False
    frames = []
    sched = Scheduler(device, on_data=lambda v, ts: frames.append(v), tick=0.01)
    sched.start()
    sched.subscribe(["RPM"], 50)
    time.sleep(0.15)
    sched.stop()
    assert not frames
    assert device.queries == []


def test_clamp_interval_applies_standard_bounds():
    """读取间隔按标准上下限夹取，非法值回退默认值。"""
    assert clamp_interval(10) == MIN_INTERVAL_MS
    assert clamp_interval(0) == MIN_INTERVAL_MS
    assert clamp_interval(5000) == MAX_INTERVAL_MS
    assert clamp_interval(300) == 300
    assert clamp_interval("250") == 250
    assert clamp_interval(None) == DEFAULT_INTERVAL_MS
    assert clamp_interval("abc") == DEFAULT_INTERVAL_MS


def test_clamp_interval_handles_nonfinite_and_aligns_step():
    """Infinity/NaN 不抛异常；有效值按 50ms 步进、以 0 为锚点对齐。"""
    assert clamp_interval(float("inf")) == DEFAULT_INTERVAL_MS
    assert clamp_interval(float("-inf")) == DEFAULT_INTERVAL_MS
    assert clamp_interval(float("nan")) == DEFAULT_INTERVAL_MS
    assert clamp_interval(260) == 250
    assert clamp_interval(999.9) == 1000


def test_subscription_stores_clamped_interval_in_seconds():
    """订阅内部把夹取后的毫秒值换算成秒。"""
    sched = Scheduler(FakeDevice())
    first = sched.subscribe(["RPM"], 5000)
    assert sched._subs[first].interval == MAX_INTERVAL_MS / 1000.0  # noqa: SLF001
    second = sched.subscribe(["SPEED"], 10)
    assert sched._subs[second].interval == MIN_INTERVAL_MS / 1000.0  # noqa: SLF001


def test_subscribe_ids_never_reused_after_unsubscribe():
    """subId 单调递增、删除后不复用，避免渲染层旧 id 前移越界。"""
    sched = Scheduler(FakeDevice())
    first = sched.subscribe(["RPM"], 100)
    second = sched.subscribe(["SPEED"], 100)
    assert (first, second) == (0, 1)
    assert sched.unsubscribe(first) is True
    third = sched.subscribe(["COOLANT_TEMP"], 100)
    assert third == 2


def test_unsubscribe_unknown_id_returns_false():
    """调度层对未知 subId 返回 False，交由上层报错。"""
    sched = Scheduler(FakeDevice())
    sched.subscribe(["RPM"], 100)
    assert sched.unsubscribe(999) is False
    assert sched.unsubscribe(-1) is False


def test_unsubscribe_unknown_id_raises_unknown_subid():
    """main.py 对未知 subId 抛错，由 _dispatch 转成 ok=false + error=unknown subId。"""
    from obd_sidecar.device import DeviceError
    from obd_sidecar.main import SidecarApp

    app = SidecarApp(mode="sim", port=None, fault=False, drop=None)
    app._scheduler = Scheduler(FakeDevice())  # noqa: SLF001
    app._scheduler.subscribe(["RPM"], 100)
    with pytest.raises(DeviceError, match="unknown subId"):
        app._m_unsubscribe({"subId": 999})


def test_scheduler_dedups_shared_pid_per_cycle():
    """同一 PID 出现在多个订阅时，每周期只查询一次。"""
    device = FakeDevice()
    sched = Scheduler(device)
    sched.subscribe(["SPEED"], MIN_INTERVAL_MS)
    sched.subscribe(["SPEED"], MIN_INTERVAL_MS)
    time.sleep(0.15)
    sched._tick_once()  # noqa: SLF001
    assert device.queries.count("SPEED") == 1
