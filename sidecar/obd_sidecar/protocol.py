"""JSON Lines RPC framing over stdio (zero third-party deps)."""

from __future__ import annotations

import json
import sys
from typing import Any


def send(msg: dict[str, Any]) -> None:
    """Write one JSON message line to stdout, thread-safe (TextIOWrapper lock)."""
    line = json.dumps(msg, ensure_ascii=False, separators=(",", ":"))
    sys.stdout.write(line + "\n")
    sys.stdout.flush()


def recv_line(stream) -> dict[str, Any] | None:
    """Read one message from the given stream. Returns None on EOF."""
    while True:
        line = stream.readline()
        if not line:
            return None
        line = line.strip()
        if line:
            return json.loads(line)


def make_response(req_id: int, result: Any = None, error: str | None = None) -> dict[str, Any]:
    msg: dict[str, Any] = {"id": req_id, "ok": error is None}
    if error is not None:
        msg["error"] = error
    else:
        msg["result"] = result
    return msg


def make_event(kind: str, params: Any) -> dict[str, Any]:
    return {"event": kind, "params": params}
