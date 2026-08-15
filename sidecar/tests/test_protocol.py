import io
import json

from obd_sidecar.protocol import make_event, make_response, recv_line, send


def test_recv_line_parses_json(capsys):
    stream = io.StringIO('{"id":1,"method":"ping"}\n\n')
    msg = recv_line(stream)
    assert msg == {"id": 1, "method": "ping"}


def test_recv_line_eof_returns_none():
    assert recv_line(io.StringIO("")) is None


def test_recv_line_skips_blank():
    stream = io.StringIO("\n   \n{}")
    assert recv_line(stream) == {}


def test_make_response_ok():
    msg = make_response(3, result={"a": 1})
    assert msg == {"id": 3, "ok": True, "result": {"a": 1}}


def test_make_response_error():
    msg = make_response(3, error="boom")
    assert msg == {"id": 3, "ok": False, "error": "boom"}
    assert "result" not in msg


def test_make_event():
    assert make_event("data", {"x": 1}) == {"event": "data", "params": {"x": 1}}


def test_send_writes_json_line(capsys):
    send({"event": "data", "params": {"RPM": 1234.5}})
    captured = capsys.readouterr()
    parsed = json.loads(captured.out.strip())
    assert parsed["params"]["RPM"] == 1234.5
    assert "\n" not in captured.out.strip("\n")
