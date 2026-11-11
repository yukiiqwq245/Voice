"""Local-only server for Pitchee Web and its optional original inference core."""
from __future__ import annotations

import argparse
import ctypes
import hashlib
import json
import os
from pathlib import Path
import subprocess
import tempfile
import threading
import wave
import webbrowser
from http import HTTPStatus
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlsplit

ROOT = Path(__file__).resolve().parent
WEB = ROOT / 'web'
MODELS = ROOT / 'core' / 'models'
ENGINE = ROOT / 'engine' / 'bin' / ('pitchee_cli.exe' if os.name == 'nt' else 'pitchee_cli')
MAX_WAV_BYTES = 24 * 1024 * 1024
MODEL_NAMES = ('ECAPA', 'ECAPAFrontend', 'VFPHead', 'SwiftF0', 'Naturalness', 'SileroVAD')
ANALYSIS_LOCK = threading.Lock()


def restore_split_assets(root: Path = ROOT):
    """Reassemble large bundled runtime files once, with integrity checks."""
    root = root.resolve()
    manifest_path = root / 'split-assets.json'
    if not manifest_path.exists():
        return
    manifest = json.loads(manifest_path.read_text(encoding='utf-8'))
    if manifest.get('version') != 1 or not isinstance(manifest.get('files'), list):
        raise ValueError('无效的运行文件清单。')

    def inside(relative):
        path = (root / relative).resolve()
        if not path.is_relative_to(root):
            raise ValueError('运行文件路径超出项目目录。')
        return path

    for entry in manifest['files']:
        target = inside(entry['path'])
        expected_hash = entry['sha256']
        expected_size = entry['size']
        if target.exists():
            digest = hashlib.sha256()
            with target.open('rb') as src:
                for block in iter(lambda: src.read(1024 * 1024), b''):
                    digest.update(block)
            if target.stat().st_size != expected_size or digest.hexdigest() != expected_hash:
                raise ValueError(f'现有运行文件校验失败，未覆盖：{entry["path"]}')
            continue
        target.parent.mkdir(parents=True, exist_ok=True)
        temporary = None
        try:
            digest, length = hashlib.sha256(), 0
            with tempfile.NamedTemporaryFile(prefix='.pitchee-asset-', dir=target.parent, delete=False) as out:
                temporary = Path(out.name)
                for part in entry['parts']:
                    with inside(part).open('rb') as src:
                        for block in iter(lambda: src.read(1024 * 1024), b''):
                            out.write(block)
                            digest.update(block)
                            length += len(block)
            if length != expected_size or digest.hexdigest() != expected_hash:
                raise ValueError(f'运行文件分片不完整或已损坏：{entry["path"]}')
            if target.exists():
                raise FileExistsError(f'还原时文件已出现，未覆盖：{entry["path"]}')
            temporary.rename(target)
            temporary = None
            print(f'已还原运行文件：{entry["path"]}', flush=True)
        finally:
            if temporary is not None:
                temporary.unlink(missing_ok=True)


def engine_ready():
    return ENGINE.is_file() and all((MODELS / f'{name}.ncnn.{ext}').is_file() for name in MODEL_NAMES for ext in ('param', 'bin'))


def short_path(path: Path) -> str:
    """The original CLI uses the Windows narrow-character C runtime for argv."""
    value = str(path)
    if os.name != 'nt':
        return value
    get_short_path = ctypes.windll.kernel32.GetShortPathNameW
    get_short_path.argtypes = (ctypes.c_wchar_p, ctypes.c_wchar_p, ctypes.c_uint32)
    get_short_path.restype = ctypes.c_uint32
    needed = get_short_path(value, None, 0)
    if not needed:
        return value
    out = ctypes.create_unicode_buffer(needed + 1)
    return out.value if get_short_path(value, out, len(out)) else value


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(WEB), **kwargs)

    def is_local_host(self):
        return self.headers.get('Host', '') in (f'127.0.0.1:{self.server.server_port}', f'localhost:{self.server.server_port}')

    def end_headers(self):
        self.send_header('X-Content-Type-Options', 'nosniff')
        self.send_header('Referrer-Policy', 'no-referrer')
        self.send_header('Cache-Control', 'no-store')
        self.send_header('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; media-src 'self' blob:; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'")
        super().end_headers()

    def send_json(self, status, payload):
        body = json.dumps(payload, ensure_ascii=False, allow_nan=False).encode('utf-8')
        self.send_response(status)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        if not self.is_local_host():
            self.send_error(HTTPStatus.FORBIDDEN)
            return
        if urlsplit(self.path).path == '/api/status':
            self.send_json(HTTPStatus.OK, {'engine_available': engine_ready()})
            return
        super().do_GET()

    def do_POST(self):
        endpoint = urlsplit(self.path).path
        if not self.is_local_host() or endpoint not in ('/api/analyze', '/api/voice-health'):
            self.send_error(HTTPStatus.FORBIDDEN)
            return
        expected_origin = f"http://{self.headers.get('Host')}"
        if self.headers.get('Origin') != expected_origin or self.headers.get('X-Pitchee-Request') != '1':
            self.send_json(HTTPStatus.FORBIDDEN, {'error': '仅允许本机页面发起分析。'})
            return
        if not engine_ready():
            self.send_json(HTTPStatus.SERVICE_UNAVAILABLE, {'error': '原版分析核心尚未安装。'})
            return
        profile = self.headers.get('X-Pitchee-Profile', 'feminization')
        if profile not in ('feminization', 'masculinization'):
            self.send_json(HTTPStatus.BAD_REQUEST, {'error': '无效的分析方向。'})
            return
        try:
            length = int(self.headers.get('Content-Length', '0'))
        except ValueError:
            length = 0
        if self.headers.get_content_type() != 'audio/wav' or not 44 <= length <= MAX_WAV_BYTES:
            self.send_json(HTTPStatus.BAD_REQUEST, {'error': '录音格式或大小不受支持。'})
            return
        if not ANALYSIS_LOCK.acquire(blocking=False):
            self.send_json(HTTPStatus.CONFLICT, {'error': '另一段录音仍在分析，请稍后重试。'})
            return
        try:
            with tempfile.TemporaryDirectory(prefix='pitchee_web_') as temp:
                audio_path = Path(temp) / 'recording.wav'
                with audio_path.open('wb') as f:
                    remaining = length
                    while remaining:
                        chunk = self.rfile.read(min(65536, remaining))
                        if not chunk:
                            raise ValueError('录音传输中断。')
                        f.write(chunk)
                        remaining -= len(chunk)
                with wave.open(str(audio_path), 'rb') as audio:
                    duration = audio.getnframes() / audio.getframerate()
                    if audio.getnchannels() != 1 or audio.getsampwidth() != 2 or not 5 <= duration <= 60.2:
                        raise ValueError('需要 5–60 秒的单声道 PCM 录音。')
                env = os.environ.copy()
                env.update({'PITCHEE_BACKEND': 'ncnn', 'PITCHEE_VAD_BACKEND': 'ncnn'})
                env.pop('PITCHEE_CLI_PROGRESS', None)
                env['PATH'] = str(ENGINE.parent) + os.pathsep + env.get('PATH', '')
                cli_args = ([short_path(ENGINE), short_path(MODELS), 'voice-health', short_path(audio_path)]
                            if endpoint == '/api/voice-health'
                            else [short_path(ENGINE), short_path(MODELS), short_path(audio_path), profile])
                proc = subprocess.run(cli_args,
                                      capture_output=True, timeout=300, env=env, check=False)
                if proc.returncode:
                    detail = proc.stderr.decode('utf-8', errors='replace')[-1200:].strip()
                    if 'detected no speech' in detail.lower():
                        detail = '没有检测到清晰的人声，请在安静的环境中重新录制。'
                    self.send_json(HTTPStatus.UNPROCESSABLE_ENTITY, {'error': '原版分析未完成：' + (detail or '请检查模型和运行库。')})
                    return
                if endpoint == '/api/voice-health':
                    lines = proc.stdout.decode('utf-8').splitlines()
                    values = dict(line.split(':', 1) for line in lines if ':' in line)
                    result = {'health_score': float(values['health_score'].strip())}
                else:
                    result = json.loads(proc.stdout.decode('utf-8'))
                self.send_json(HTTPStatus.OK, result)
        except (ValueError, KeyError, wave.Error, json.JSONDecodeError) as exc:
            self.send_json(HTTPStatus.BAD_REQUEST, {'error': str(exc) or '无法读取录音或分析结果。'})
        except subprocess.TimeoutExpired:
            self.send_json(HTTPStatus.GATEWAY_TIMEOUT, {'error': '模型分析超时，请尝试更短的录音。'})
        except OSError as exc:
            self.send_json(HTTPStatus.INTERNAL_SERVER_ERROR, {'error': '无法运行本地分析核心：' + str(exc)})
        finally:
            ANALYSIS_LOCK.release()


def main():
    parser = argparse.ArgumentParser(description='Run the local Pitchee Web application')
    parser.add_argument('--port', type=int, default=8765)
    parser.add_argument('--no-browser', action='store_true')
    args = parser.parse_args()
    restore_split_assets()
    with ThreadingHTTPServer(('127.0.0.1', args.port), Handler) as server:
        url = f'http://127.0.0.1:{server.server_port}/'
        print(f'Pitchee Web: {url}', flush=True)
        print('关闭此窗口即可退出。录音不会发送到互联网。', flush=True)
        if not args.no_browser:
            threading.Timer(0.5, lambda: webbrowser.open(url)).start()
        try:
            server.serve_forever()
        except KeyboardInterrupt:
            pass


if __name__ == '__main__':
    main()
