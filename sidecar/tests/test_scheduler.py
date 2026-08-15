import time

from obd_sidecar.scheduler import Scheduler


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
    sched.subscribe(["RPM"], 500)  # slow
    sched.subscribe(["SPEED"], 50)  # fast
    time.sleep(0.3)
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
