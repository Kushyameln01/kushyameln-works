#!/usr/bin/env python3
"""Validate exact reviewed public inventory and export to a NEW isolated directory."""
import argparse
import hashlib
import json
import os
import re
import shutil
import tempfile
import unicodedata
from pathlib import Path, PurePosixPath
from html.parser import HTMLParser
from urllib.parse import urlsplit, unquote

ROOT = Path(__file__).resolve().parents[1]
REGISTRY = ROOT / 'security/public-files.json'


def safe_path(value):
    if not isinstance(value, str) or not value or '\\' in value or any(c in value for c in '%:?#'):
        raise ValueError(f'Unsafe registry path: {value!r}')
    if unicodedata.normalize('NFC', value) != value or any(ord(c) < 32 or ord(c) == 127 for c in value) or value.startswith('/') or any(x in ('', '.', '..') for x in value.split('/')):
        raise ValueError(f'Unsafe registry path: {value!r}')
    return value


def approved(registry=REGISTRY):
    obj = json.loads(Path(registry).read_text())
    if obj.get('version') != 1 or obj.get('target') != 'github-pages' or not isinstance(obj.get('files'), list):
        raise ValueError('Invalid registry schema')
    paths = [safe_path(x) for x in obj['files']]
    keys = [unicodedata.normalize('NFC', x).casefold() for x in paths]
    if len(set(keys)) != len(keys):
        raise ValueError('Duplicate/colliding registry paths')
    for a in keys:
        if any(b.startswith(a + '/') for b in keys):
            raise ValueError('File/directory collision')
    if 'index.html' not in paths or '.nojekyll' not in paths:
        raise ValueError('Registry lacks publication entry points')
    return set(paths)


def inventory(source):
    source = Path(source).absolute()
    if any(p.is_symlink() for p in [source, *source.parents]):
        raise ValueError('Symlink source/ancestor forbidden')
    if not source.is_dir():
        raise ValueError('Source must be a directory')
    files = set()
    for base, dirs, names in os.walk(source, followlinks=False):
        for name in dirs + names:
            p = Path(base) / name
            if p.is_symlink():
                raise ValueError('Symlink forbidden: ' + str(p))
            if not p.is_dir() and not p.is_file():
                raise ValueError('Special file forbidden: ' + str(p))
            if p.is_file():
                files.add(safe_path(p.relative_to(source).as_posix()))
    return files


def check_references(root):
    root = Path(root).resolve()
    def check(page, value):
        u = urlsplit(value)
        if u.scheme or u.netloc or not u.path:
            return
        path = unquote(u.path)
        if '\\' in path or '\x00' in path:
            raise ValueError('Unsafe reference: ' + value)
        target = (root / path.lstrip('/')) if path.startswith('/') else page.parent / path
        target = target.resolve()
        if not target.is_relative_to(root) or not target.exists() or (target.is_dir() and not (target/'index.html').is_file()):
            raise ValueError(f'Broken/escaping reference in {page.relative_to(root)}: {value}')
    class Links(HTMLParser):
        def handle_starttag(self, tag, attrs):
            for key, value in attrs:
                if key in ('href', 'src') and value:
                    check(self.page, value)
    for p in root.rglob('*'):
        if p.suffix == '.html':
            parser = Links(); parser.page = p; parser.feed(p.read_text())
        elif p.suffix in ('.mjs', '.js', '.css'):
            text = p.read_text()
            patterns = [r'''(?:from\s*|import\s*\(|import\s+|new\s+URL\s*\(|fetch\s*\()\s*['"]([^'"]+)['"]''', r'''url\(\s*['"]?([^'"\s)]+)''']
            for pattern in (patterns[1:] if p.suffix == '.css' else patterns[:1]):
                for value in re.findall(pattern, text):
                    check(p, value)


def digest(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def export(source, output, registry=REGISTRY):
    source, output = Path(source).absolute(), Path(output).absolute()
    registry_hash = digest(registry)
    allowed = approved(registry)
    actual = inventory(source)
    expected_dirs = {str(parent) for name in allowed for parent in PurePosixPath(name).parents if str(parent) != '.'}
    actual_dirs = {p.relative_to(source).as_posix() for p in source.rglob('*') if p.is_dir()}
    if actual_dirs != expected_dirs:
        raise ValueError('Unapproved/missing directory structure')
    if actual != allowed:
        raise ValueError(f'Inventory mismatch; unknown={sorted(actual-allowed)} missing={sorted(allowed-actual)}')
    source_hashes = {name: digest(source/name) for name in sorted(allowed)}
    if output.exists() or output.is_symlink():
        raise ValueError('Output must not exist; existing publication is never overwritten')
    if source == output or source in output.parents or output in source.parents:
        raise ValueError('Source/output overlap')
    if any(p.is_symlink() for p in output.parents):
        raise ValueError('Symlink output ancestor forbidden')
    output.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix='.pages-stage-', dir=output.parent) as temp:
        staged = Path(temp)/'public'; staged.mkdir()
        for name in sorted(allowed):
            src, dst = source/name, staged/name
            if src.is_symlink() or any(p.is_symlink() for p in src.parents):
                raise ValueError('Source changed to symlink during export')
            dst.parent.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(src, dst)
            if digest(dst) != source_hashes[name]:
                raise ValueError('Source changed during copy: ' + name)
        for page in staged.rglob('*.html'):
            prefix = '../' * (len(page.relative_to(staged).parts)-1) or './'
            page.write_text(re.sub(r'''((?:href|src)=["'])/(?!/)''', lambda m: m[1]+prefix, page.read_text()))
        if inventory(staged) != allowed:
            raise ValueError('Staged inventory mismatch')
        check_references(staged)
        if inventory(source) != allowed or any(digest(source/name) != value for name, value in source_hashes.items()):
            raise ValueError('Source changed during export')
        if {p.relative_to(source).as_posix() for p in source.rglob('*') if p.is_dir()} != expected_dirs:
            raise ValueError('Source directories changed during export')
        if digest(registry) != registry_hash:
            raise ValueError('Registry changed during export')
        # Rename within one filesystem. Never expose a partially validated tree.
        if output.exists():
            raise ValueError('Output appeared during export')
        staged.rename(output)
    return output


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('source', type=Path)
    parser.add_argument('--output', type=Path, required=True)
    args = parser.parse_args()
    try:
        print('Validated export: ' + str(export(args.source, args.output)))
    except (ValueError, OSError) as e:
        raise SystemExit(str(e))
