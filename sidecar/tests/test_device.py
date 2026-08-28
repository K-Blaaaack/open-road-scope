from obd_sidecar.device import RealDevice


def test_resolve_network_port():
    dev = RealDevice(port="192.168.0.10:35000")
    assert dev._resolve_port() == "socket://192.168.0.10:35000"


def test_resolve_keeps_serial_paths():
    assert RealDevice(port="/dev/ttyUSB0")._resolve_port() == "/dev/ttyUSB0"
    assert RealDevice(port="COM3")._resolve_port() == "COM3"
    assert RealDevice(port="socket://192.168.0.10:35000")._resolve_port() == "socket://192.168.0.10:35000"
    assert RealDevice(port=None)._resolve_port() is None
