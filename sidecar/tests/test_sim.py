import time

from obd_sidecar.sim import SimDevice


def test_sim_connect_and_pids():
    dev = SimDevice()
    assert dev.connect() is True
    assert dev.is_connected()
    rpm = dev.query_pid("RPM")
    assert rpm is not None and rpm > 0
    speed = dev.query_pid("SPEED")
    assert speed is not None and speed >= 0


def test_sim_unsupported_pid_returns_none():
    dev = SimDevice()
    dev.connect()
    assert dev.query_pid("NOT_A_PID") is None


def test_sim_dtc_flow():
    dev = SimDevice()
    dev.connect()
    dtc = dev.query_command("GET_DTC")
    assert isinstance(dtc, list)
    assert dev.query_command("CLEAR_DTC") is True
    assert dev.query_command("GET_DTC") == []


def test_sim_vin():
    dev = SimDevice()
    dev.connect()
    assert dev.query_command("VIN") == "SIMELM327TEST0001"


def test_sim_meta():
    dev = SimDevice()
    dev.connect()
    assert dev.mode() == "sim"
    assert dev.protocol_name()
    assert dev.elm_version()


def test_sim_drop_injects_disconnect():
    dev = SimDevice(drop_every=0.15)
    dev.connect()
    assert dev.is_connected()
    disconnected = False
    for _ in range(400):
        if not dev.is_connected():
            disconnected = True
            break
        time.sleep(0.001)
    assert disconnected, "expected periodic disconnect window"
