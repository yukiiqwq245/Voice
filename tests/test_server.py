import io
import sys
from email.message import Message
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from server import Handler  # noqa: E402


def handler(method, path, host, origin=None):
    h = object.__new__(Handler)
    h.server = SimpleNamespace(server_port=8765)
    h.client_address = ('127.0.0.1', 1111)
    h.request_version = 'HTTP/1.1'
    h.requestline = f'{method} {path} HTTP/1.1'
    h.command = method
    h.path = path
    h.headers = Message()
    h.headers['Host'] = host
    if origin:
        h.headers['Origin'] = origin
    h.wfile = io.BytesIO()
    h.rfile = io.BytesIO()
    h.log_message = lambda *args: None
    return h


def test_status_and_origin_guards():
    local = handler('GET', '/api/status', '127.0.0.1:8765')
    with patch('server.engine_ready', return_value=False):
        local.do_GET()
    assert b'200 OK' in local.wfile.getvalue()
    assert b'"engine_available": false' in local.wfile.getvalue()
    rebinding = handler('GET', '/api/status', 'example.com:8765')
    rebinding.do_GET()
    assert b'403 Forbidden' in rebinding.wfile.getvalue()
    foreign = handler('POST', '/api/analyze', '127.0.0.1:8765', 'https://example.com')
    foreign.do_POST()
    assert b'403 Forbidden' in foreign.wfile.getvalue()


if __name__ == '__main__':
    test_status_and_origin_guards()
    print('Local server guards passed.')
