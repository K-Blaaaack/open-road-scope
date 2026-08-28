"""串口枚举与分类。

单独成模块（不引入 python-obd）：一次性枚举串口时无需加载整个 OBD 栈，
连接前的「刷新串口」也就不必先把 sidecar 跑成常驻进程。
"""

from __future__ import annotations

import re
import time

import serial.tools.list_ports

# 蓝牙串口特征：Linux/macOS 的 rfcomm 节点，以及 Windows 各蓝牙栈的硬件 ID 前缀
# （微软 BTHENUM/BTHMODEM、Broadcom BTWSERIAL、东芝 TOSRFCOMM）与中英文描述关键词。
# Windows 蓝牙 SPP 口的描述为「Standard Serial over Bluetooth link」/「蓝牙链接上的标准串行」。
_BLUETOOTH_TOKENS = (
    "bluetooth",
    "蓝牙",
    "rfcomm",
    "bthenum",
    "bthmodem",
    "bthport",
    "btwserial",
    "tosrfcomm",
)

# USB 串口特征：设备节点名、USB 硬件 ID，以及常见 USB-串口桥接芯片
_USB_TOKENS = (
    "usb",
    "ttyacm",
    "ch340",
    "ch341",
    "cp210",
    "ftdi",
    "pl2303",
    "prolific",
)


def _clean(value: str | None) -> str:
    """归一化 pyserial 字段：未知信息统一成空串（pyserial 会填 "n/a"）"""
    text = (value or "").strip()
    return "" if text.lower() in ("", "n/a") else text


def _classify_port(p) -> str:
    """按设备名/硬件信息将串口分为 usb / bluetooth / other"""
    haystack = " ".join(
        (
            _clean(getattr(p, "device", "")),
            _clean(getattr(p, "hwid", "")),
            _clean(getattr(p, "description", "")),
        )
    ).lower()
    if any(token in haystack for token in _BLUETOOTH_TOKENS):
        return "bluetooth"
    if any(token in haystack for token in _USB_TOKENS) or getattr(p, "vid", None) is not None:
        return "usb"
    return "other"


def _natural_key(name: str) -> tuple[str, int]:
    """自然序键：让 COM2 排在 COM10 之前"""
    match = re.search(r"(\d+)$", name)
    if match is None:
        return (name.lower(), -1)
    return (name[: match.start()].lower(), int(match.group(1)))


# 排序优先级：Linux 上常有几十个空置的 /dev/ttyS*（归为 other），
# 真正的适配器排在前面，下拉框的默认选中项才有意义
_TYPE_ORDER = {"usb": 0, "bluetooth": 1, "other": 2}


def list_serial_ports() -> list[dict[str, str]]:
    """枚举串口并按类型分类，供连接页分组展示"""
    ports = [
        {
            "name": p.device,
            "description": _clean(getattr(p, "description", "")),
            "hwid": _clean(getattr(p, "hwid", "")),
            "type": _classify_port(p),
        }
        for p in serial.tools.list_ports.comports()
        if p.device
    ]
    ports.sort(key=lambda item: (_TYPE_ORDER.get(item["type"], 3), _natural_key(item["name"])))
    return ports


def wait_for_port(port: str, timeout: float = 10.0) -> bool:
    """阻塞直到指定串口出现（适配器上电存在竞态）"""
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        if any(p["name"] == port for p in list_serial_ports()):
            return True
        time.sleep(0.5)
    return False
