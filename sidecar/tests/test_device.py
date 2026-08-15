from types import SimpleNamespace

from obd_sidecar.device import RealDevice, _classify_port


def make_port(name, hwid="", description="", vid=None):
    return SimpleNamespace(device=name, hwid=hwid, description=description, vid=vid)


def test_classify_usb():
    assert _classify_port(make_port("/dev/ttyUSB0", "USB VID:PID=1a86:7523", "USB Serial")) == "usb"
    assert _classify_port(make_port("/dev/ttyACM0", "USB VID:PID=0483:5740")) == "usb"
    assert _classify_port(make_port("COM3", "USB VID:PID=0403:6001")) == "usb"
    assert _classify_port(make_port("COM4", "FTDI", "FTDI FT232R", vid=1027)) == "usb"


def test_classify_bluetooth():
    assert _classify_port(make_port("/dev/rfcomm0", "Bluetooth")) == "bluetooth"
    assert _classify_port(make_port("/dev/tty.BluetoothSerial-1")) == "bluetooth"
    assert _classify_port(make_port("COM7", "", "Bluetooth Serial Port")) == "bluetooth"


def test_classify_other():
    assert _classify_port(make_port("/dev/ttyS0", "PNP0501")) == "other"


def test_resolve_network_port():
    dev = RealDevice(port="192.168.0.10:35000")
    assert dev._resolve_port() == "socket://192.168.0.10:35000"


def test_resolve_keeps_serial_paths():
    assert RealDevice(port="/dev/ttyUSB0")._resolve_port() == "/dev/ttyUSB0"
    assert RealDevice(port="COM3")._resolve_port() == "COM3"
    assert RealDevice(port="socket://192.168.0.10:35000")._resolve_port() == "socket://192.168.0.10:35000"
    assert RealDevice(port=None)._resolve_port() is None
