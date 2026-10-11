#!/usr/bin/env python3
"""Copy a reviewed Sites dist directory into this repository's docs directory."""
import argparse
import re
import shutil
import tempfile
from pathlib import Path
from html.parser import HTMLParser
from urllib.parse import urlsplit, unquote

parser = argparse.ArgumentParser()
parser.add_argument('source', type=Path, help='Reviewed static distribution directory')
args = parser.parse_args()
source = args.source.resolve()
destination = Path(__file__).resolve().parents[1] / 'docs'
if not (source / 'index.html').is_file():
    raise SystemExit('Source must contain index.html')
if source == destination or source in destination.parents or destination in source.parents:
    raise SystemExit('Source and destination must be separate directories')
if any(p.is_symlink() for p in source.rglob('*')):
    raise SystemExit('Symlinks are not supported')

with tempfile.TemporaryDirectory() as temp:
    staged = Path(temp) / 'docs'
    shutil.copytree(source, staged)
    for page in staged.rglob('*.html'):
        prefix = '../' * (len(page.relative_to(staged).parts) - 1) or './'
        original = page.read_text()
        portable = re.sub(r'''((?:href|src)=["'])/(?!/)''', lambda m: m[1] + prefix, original)
        page.write_text(portable)
    (staged / '.nojekyll').touch()
    errors = []
    class Links(HTMLParser):
        def handle_starttag(self, tag, attrs):
            for key, value in attrs:
                if key not in ('href', 'src') or not value:
                    continue
                u = urlsplit(value)
                if u.scheme or u.netloc or not u.path:
                    continue
                target = (self.page.parent / unquote(u.path)).resolve()
                if not target.is_relative_to(staged) or not target.exists():
                    errors.append(f'{self.page.relative_to(staged)}: {value}')
    for page in staged.rglob('*.html'):
        check = Links()
        check.page = page
        check.feed(page.read_text())
    if errors:
        raise SystemExit('\n'.join(errors))
    if destination.exists():
        shutil.rmtree(destination)
    shutil.copytree(staged, destination)
print('Updated docs; review git diff before committing and publishing.')
