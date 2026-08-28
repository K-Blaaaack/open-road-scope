from types import SimpleNamespace

from obd_sidecar.ports import _classify_port, _natural_key, list_serial_ports


def make_port(name, hwid="", description="", vid=None):
    return SimpleNamespace(device=name, hwid=hwid, description=description, vid=vid)


def test_classify_usb():
    assert _classify_port(make_port("/dev/ttyUSB0", "USB VID:PID=1a86:7523", "USB Serial")) == "usb"
    assert _classify_port(make_port("/dev/ttyACM0", "USB VID:PID=0483:5740")) == "usb"
    assert _classify_port(make_port("COM3", "USB VID:PID=0403:6001")) == "usb"
    assert _classify_port(make_port("COM4", "FTDI", "FTDI FT232R", vid=1027)) == "usb"
    assert _classify_port(make_port("COM5", "", "USB-SERIAL CH340")) == "usb"


def test_classify_bluetooth():
    assert _classify_port(make_port("/dev/rfcomm0", "Bluetooth")) == "bluetooth"
    assert _classify_port(make_port("/dev/tty.BluetoothSerial-1")) == "bluetooth"
    assert _classify_port(make_port("COM7", "", "Bluetooth Serial Port")) == "bluetooth"


def test_classify_windows_bluetooth_spp():
    """Windows 蓝牙 SPP 口的硬件 ID 前缀是 BTHENUM，描述里不一定带 bluetooth 字样"""
    port = make_port(
        "COM5",
        r"BTHENUM\{00001101-0000-1000-8000-00805F9B34FB}_LOCALMFG&0002\7&2A4B0E1D&0&001122334455",
        "标准蓝牙链接上的串行端口",
    )
    assert _classify_port(port) == "bluetooth"
    assert _classify_port(make_port("COM9", r"BTHMODEM\0", "n/a")) == "bluetooth"


def test_classify_other():
    assert _classify_port(make_port("/dev/ttyS0", "PNP0501")) == "other"
    assert _classify_port(make_port("COM1", r"ACPI\PNP0501\1", "通信端口")) == "other"


def test_natural_key_orders_com_ports_numerically():
    names = ["COM10", "COM2", "COM1"]
    assert sorted(names, key=_natural_key) == ["COM1", "COM2", "COM10"]


def test_list_serial_ports_normalizes_and_sorts(monkeypatch):
    fake = [
        make_port("/dev/ttyS10", "n/a", "n/a"),
        make_port("/dev/ttyS2", "n/a", "n/a"),
        make_port("/dev/ttyUSB0", "USB VID:PID=1a86:7523", "USB-SERIAL CH340"),
    ]
    monkeypatch.setattr("serial.tools.list_ports.comports", lambda: fake)
    result = list_serial_ports()
    # USB 适配器排在空置的 /dev/ttyS* 之前，同类内按自然序
    assert [p["name"] for p in result] == ["/dev/ttyUSB0", "/dev/ttyS2", "/dev/ttyS10"]
    assert result[0]["type"] == "usb"
    # pyserial 的 "n/a" 占位应归一化成空串，避免界面显示「/dev/ttyS2（n/a）」
    assert result[1] == {"name": "/dev/ttyS2", "description": "", "hwid": "", "type": "other"}
