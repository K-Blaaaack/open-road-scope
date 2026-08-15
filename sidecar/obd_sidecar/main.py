"""OBD sidecar entrypoint: stdio JSON-Lines RPC loop + connection lifecycle.

Usage:
  python -m sidecar.main [--sim] [--port /dev/ttyUSB0] [--fault] [--drop N]
"""

from __future__ import annotations

import argparse
import logging
import sys
import threading
import time

from . import protocol as p
from .device import Device, DeviceError, list_serial_ports
from .scheduler import Scheduler
from .sim import SimDevice

logger = logging.getLogger("sidecar.main")

SUPPORTED_METHODS = ("subscribe", "unsubscribe", "query", "status", "ping", "list_ports")


class SidecarApp:
    def __init__(self, mode: str, port: str | None, fault: bool, drop: float | None):
        self._mode = mode
        self._port = port
        self._fault = fault
        self._drop = drop
        self._state = "idle"
        self._message = ""
        self._scheduler: Scheduler | None = None
        self._stop = threading.Event()
        self._lock = threading.Lock()
        self._device: Device | None = None

    # ---------- lifecycle ----------

    def run(self) -> None:
        self._make_device()
        monitor = threading.Thread(target=self._monitor, name="conn-monitor", daemon=True)
        monitor.start()
        self._emit_status()
        try:
            while not self._stop.is_set():
                msg = p.recv_line(sys.stdin)
                if msg is None:
                    logger.info("stdin EOF, exiting")
                    break
                try:
                    self._dispatch(msg)
                except Exception as e:  # noqa: BLE001
                    logger.exception("dispatch failed")
                    req_id = msg.get("id")
                    if req_id is not None:
                        p.send(p.make_response(req_id, error=f"internal error: {e}"))
        finally:
            self._stop.set()
            self._cleanup()

    def shutdown(self) -> None:
        self._stop.set()

    def _cleanup(self) -> None:
        if self._scheduler:
            self._scheduler.stop()
        if self._device:
            self._device.close()

    def _make_device(self) -> None:
        if self._mode == "sim":
            self._device = SimDevice(fault=self._fault, drop_every=self._drop)
        else:
            from .device import RealDevice

            self._device = RealDevice(port=self._port)
        self._scheduler = Scheduler(self._device, on_data=self._on_data, on_log=self._on_log)
        self._scheduler.start()

    # ---------- connection monitor ----------

    def _monitor(self) -> None:
        backoff = 1.0
        while not self._stop.is_set():
            if not self._device.is_connected():
                if self._state == "connected":
                    self._set_state("error", message="connection lost, reconnecting...")
                self._set_state("connecting", message="connecting to OBD adapter...")
                ok = self._try_connect()
                if ok:
                    backoff = 1.0
                    self._set_state("connected", message="")
                    self._emit_status()
                else:
                    self._set_state("error", message="connect failed")
                    self._stop.wait(backoff)
                    backoff = min(backoff * 2, 15.0)
            else:
                if self._state != "connected":
                    self._set_state("connected", message="")
                    self._emit_status()
                backoff = 1.0
                self._stop.wait(1.0)

    def _try_connect(self) -> bool:
        try:
            return self._device.connect()
        except Exception as e:  # noqa: BLE001
            logger.warning("connect raised: %s", e)
            return False

    # ---------- scheduler callbacks ----------

    def _on_data(self, values: dict[str, float], ts: int) -> None:
        p.send(p.make_event("data", {"values": values, "ts": ts}))

    def _on_log(self, message: str) -> None:
        p.send(p.make_event("log", {"message": message}))

    # ---------- rpc dispatch ----------

    def _dispatch(self, msg: dict) -> None:
        req_id = msg.get("id")
        method = msg.get("method")
        if req_id is None or method not in SUPPORTED_METHODS:
            if req_id is not None:
                p.send(p.make_response(req_id, error=f"unknown method: {method}"))
            return
        handler = getattr(self, f"_m_{method}")
        try:
            result = handler(msg.get("params") or {})
            p.send(p.make_response(req_id, result=result))
        except Exception as e:  # noqa: BLE001
            p.send(p.make_response(req_id, error=str(e)))

    def _m_subscribe(self, params: dict) -> dict:
        pids = params.get("pids") or []
        interval = int(params.get("interval", 500))
        if not pids:
            raise DeviceError("pids required")
        index = self._scheduler.subscribe(pids, interval)
        return {"subId": index, "pids": pids, "interval": interval}

    def _m_unsubscribe(self, params: dict) -> dict:
        self._scheduler.unsubscribe(int(params.get("subId", -1)))
        return {"ok": True}

    def _m_query(self, params: dict) -> dict:
        cmd = params.get("cmd")
        if not cmd:
            raise DeviceError("cmd required")
        value = self._device.query_command(cmd)
        return {"cmd": cmd, "result": value}

    def _m_status(self, _params: dict) -> dict:
        return self._status_payload()

    def _m_ping(self, _params: dict) -> dict:
        return {"pong": True, "state": self._state}

    def _m_list_ports(self, _params: dict) -> dict:
        return {"ports": list_serial_ports()}

    # ---------- helpers ----------

    def _set_state(self, state: str, message: str = "") -> None:
        with self._lock:
            changed = state != self._state or message != self._message
            self._state = state
            self._message = message
        if changed:
            self._emit_status()

    def _status_payload(self) -> dict:
        device = self._device
        return {
            "state": self._state,
            "mode": device.mode() if device else "unknown",
            "protocol": device.protocol_name() if device else None,
            "port": self._port,
            "elmVersion": device.elm_version() if device else None,
            "message": self._message,
        }

    def _emit_status(self) -> None:
        p.send(p.make_event("status", self._status_payload()))


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(prog="obd-sidecar")
    parser.add_argument("--sim", action="store_true", help="use simulated ELM327 device")
    parser.add_argument("--port", type=str, default=None, help="serial port for real device")
    parser.add_argument("--fault", action="store_true", help="sim: inject random frame failures")
    parser.add_argument("--drop", type=float, default=None, help="sim: disconnect every N seconds")
    parser.add_argument("--verbose", action="store_true", help="debug logging to stderr")
    return parser.parse_args(argv)


def main(argv: list[str] | None = None) -> int:
    args = parse_args(argv)
    logging.basicConfig(
        stream=sys.stderr,
        level=logging.DEBUG if args.verbose else logging.WARNING,
        format="%(asctime)s %(name)s %(levelname)s %(message)s",
    )
    mode = "sim" if args.sim else "real"
    app = SidecarApp(mode=mode, port=args.port, fault=args.fault, drop=args.drop)
    try:
        app.run()
    except KeyboardInterrupt:
        app.shutdown()
    return 0


if __name__ == "__main__":
    sys.exit(main())
