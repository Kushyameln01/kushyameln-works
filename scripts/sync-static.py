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
REFERENCE_EXCEPTIONS = ROOT / 'security/reference-exceptions.json'


def javascript_references(source):
    """Extract literal references outside data/comments, not full JS semantics.

    Template expressions are scanned; constructed URLs still require review.
    Regex literals in expression-start positions are skipped as data.
    """
    size = len(source)
    def quoted(index):
        quote = source[index]; index += 1; value = []
        while index < size:
            char = source[index]; index += 1
            if char == quote: return ''.join(value), index
            if char != '\\': value.append(char); continue
            if index == size: break
            char = source[index]; index += 1
            if char in '\r\n':
                if char == '\r' and index < size and source[index] == '\n': index += 1
                continue
            if char in ('x', 'u'):
                if char == 'u' and index < size and source[index] == '{':
                    end = source.find('}', index + 1)
                    if end < 0: raise ValueError('Invalid JS string escape')
                    digits = source[index + 1:end]; index = end + 1
                else:
                    count = 2 if char == 'x' else 4
                    digits = source[index:index + count]; index += count
                    if len(digits) != count: raise ValueError('Invalid JS string escape')
                try: value.append(chr(int(digits, 16)))
                except (ValueError, OverflowError): raise ValueError('Invalid JS string escape')
            else: value.append({'n':'\n','r':'\r','t':'\t','b':'\b','f':'\f','v':'\v','0':'\0'}.get(char, char))
        raise ValueError('Unterminated JS string')

    def scan(index=0, expression=False):
        tokens = []; braces = 0
        while index < size:
            char = source[index]
            if char.isspace(): index += 1; continue
            if source.startswith('//', index):
                end = source.find('\n', index + 2); index = size if end < 0 else end + 1; continue
            if source.startswith('/*', index):
                end = source.find('*/', index + 2)
                if end < 0: raise ValueError('Unterminated JS comment')
                index = end + 2; continue
            if char in ('"', "'"):
                value, index = quoted(index); tokens.append(('string', value)); continue
            if char == '`':
                index += 1
                while index < size:
                    if source[index] == '\\': index += 2; continue
                    if source[index] == '`': index += 1; break
                    if source.startswith('${', index):
                        inner, index = scan(index + 2, True)
                        tokens.extend([('punct', ';'), *inner, ('punct', ';')]); continue
                    index += 1
                tokens.append(('template', '')); continue
            previous = tokens[-1][1] if tokens else None
            if char == '/' and (previous is None or previous in ('=', '(', '[', '{', ',', ':', ';', '!', '?', '&', '|', 'return', 'throw', 'case', 'yield', 'await')):
                index += 1; in_class = False
                while index < size:
                    char = source[index]; index += 1
                    if char == '\\': index += 1; continue
                    if char == '[': in_class = True
                    elif char == ']': in_class = False
                    elif char == '/' and not in_class: break
                while index < size and source[index].isalpha(): index += 1
                tokens.append(('regex', '')); continue
            if char.isalpha() or char in '_$':
                start = index; index += 1
                while index < size and (source[index].isalnum() or source[index] in '_$'): index += 1
                tokens.append(('identifier', source[start:index])); continue
            if expression and char == '}' and braces == 0: return tokens, index + 1
            if char == '{': braces += 1
            elif char == '}': braces -= 1
            tokens.append(('punct', char)); index += 1
        return tokens, index

    tokens, _ = scan()
    for index, (kind, value) in enumerate(tokens):
        if kind != 'identifier': continue
        tail = tokens[index + 1:index + 5]
        if value in ('import', 'from') and (index == 0 or tokens[index - 1][1] != '.'):
            if tail and tail[0][0] == 'string': yield 'import', tail[0][1]
            elif value == 'import' and len(tail) > 1 and tail[0][1] == '(' and tail[1][0] == 'string': yield 'import', tail[1][1]
        elif value == 'new' and len(tail) > 2 and tail[0] == ('identifier', 'URL') and tail[1][1] == '(' and tail[2][0] == 'string':
            yield 'url', tail[2][1]
        elif value == 'fetch' and len(tail) > 1 and tail[0][1] == '(' and tail[1][0] == 'string':
            yield 'fetch', tail[1][1]


def reference_exceptions():
    obj = json.loads(REFERENCE_EXCEPTIONS.read_text())
    if obj.get('version') != 1 or not isinstance(obj.get('exceptions'), list): raise ValueError('Invalid reference exception schema')
    for entry in obj['exceptions']:
        safe_path(entry.get('file'))
        if not re.fullmatch('[a-f0-9]{64}', entry.get('sha256', '')) or not entry.get('reason'): raise ValueError('Invalid pinned reference exception')
        node_dependencies = ('module', 'worker_threads', 'node:module', 'node:worker_threads', 'node:crypto', 'node:child_process', 'node:fs/promises', 'node:path', 'node:url')
        if not isinstance(entry.get('specifiers'), list) or not entry['specifiers'] or any(value not in node_dependencies for value in entry['specifiers']): raise ValueError('Reference exception is not a reviewed Node dependency')
    return obj['exceptions']


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


def check_references(root, exceptions=None):
    root = Path(root).resolve()
    exceptions = reference_exceptions() if exceptions is None else exceptions
    def check(page, value, kind=None):
        if kind == 'import':
            for entry in exceptions:
                if page.relative_to(root).as_posix() == entry['file'] and value in entry['specifiers']:
                    if digest(page) != entry['sha256']: raise ValueError('Pinned vendor reference hash mismatch: ' + entry['file'])
                    return
            if value.startswith('node:'): raise ValueError('Unreviewed Node-only import: ' + value)
        u = urlsplit(value)
        if u.scheme or u.netloc or not u.path:
            return
        path = unquote(u.path)
        if '\\' in path or '\x00' in path:
            raise ValueError('Unsafe reference: ' + value)
        target = (root / path.lstrip('/')) if path.startswith('/') else page.parent / path
        target = target.resolve()
        # new URL constructs an asset/base URL and can legitimately name a
        # directory (Emscripten uses new URL('.', import.meta.url)). A page link,
        # import or fetch still needs a real entry point if it names a directory.
        if not target.is_relative_to(root) or not target.exists() or (target.is_dir() and kind != 'url' and not (target/'index.html').is_file()):
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
            if p.suffix == '.css':
                for value in re.findall(r"""url\(\s*['"]?([^'"\s)]+)""", text): check(p, value)
            else:
                for kind, value in javascript_references(text): check(p, value, kind)


def digest(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def export(source, output, registry=REGISTRY):
    source, output = Path(source).absolute(), Path(output).absolute()
    registry_hash = digest(registry)
    exception_hash = digest(REFERENCE_EXCEPTIONS)
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
        if digest(REFERENCE_EXCEPTIONS) != exception_hash:
            raise ValueError('Reference exceptions changed during export')
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
