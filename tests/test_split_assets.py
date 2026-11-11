import hashlib
import json
from pathlib import Path
import sys
import tempfile

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from server import restore_split_assets  # noqa: E402


def prepare(root):
    root = Path(root)
    (root / 'parts').mkdir()
    (root / 'parts' / 'a').write_bytes(b'hello ')
    (root / 'parts' / 'b').write_bytes(b'world')
    manifest = {'version': 1, 'files': [{'path': 'output/model.bin', 'size': 11,
        'sha256': hashlib.sha256(b'hello world').hexdigest(), 'parts': ['parts/a', 'parts/b']}]}
    (root / 'split-assets.json').write_text(json.dumps(manifest), encoding='utf-8')
    return root


def test_restore_and_existing_file_protection():
    with tempfile.TemporaryDirectory(dir=Path.cwd()) as directory:
        root = prepare(directory)
        restore_split_assets(root)
        target = root / 'output' / 'model.bin'
        assert target.read_bytes() == b'hello world'
        restore_split_assets(root)
        target.write_bytes(b'user file')
        try:
            restore_split_assets(root)
            raise AssertionError('Expected a checksum failure')
        except ValueError:
            assert target.read_bytes() == b'user file'


def test_bad_part_is_not_installed():
    with tempfile.TemporaryDirectory(dir=Path.cwd()) as directory:
        root = prepare(directory)
        (root / 'parts' / 'b').write_bytes(b'invalid')
        try:
            restore_split_assets(root)
            raise AssertionError('Expected a checksum failure')
        except ValueError:
            assert not (root / 'output' / 'model.bin').exists()
            assert not list((root / 'output').glob('.pitchee-asset-*'))


if __name__ == '__main__':
    test_restore_and_existing_file_protection()
    test_bad_part_is_not_installed()
    print('Split asset restoration checks passed.')
