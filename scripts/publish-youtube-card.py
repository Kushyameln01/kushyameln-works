"""Create one reviewed YouTube Player Card and add its exact path to the Pages registry."""
import bisect
from html import escape
import json
from pathlib import Path
import re
import subprocess
import sys
from urllib.request import urlopen


def video_title(video_id):
    endpoint = f'https://www.youtube.com/oembed?url=https://youtu.be/{video_id}&format=json'
    try:
        with urlopen(endpoint, timeout=5) as response:
            title = json.load(response).get('title')
        if isinstance(title, str) and title.strip():
            return title.strip()
    except (OSError, ValueError):
        pass
    return f'YouTube · {video_id}'


def publish(video_id):
    if not re.fullmatch(r'[A-Za-z0-9_-]{11}', video_id):
        raise ValueError('Invalid YouTube video ID')
    root = Path(__file__).resolve().parents[1]
    route = f'youtube-player-card/v/{video_id}/index.html'
    destination = root / 'docs' / route
    if not destination.exists():
        template = (root / 'docs/youtube-player-card/card-template.html').read_text(encoding='utf-8')
        fields = {'VIDEO_ID': video_id, 'TITLE': escape(video_title(video_id))}
        page = re.sub(r'__(VIDEO_ID|TITLE)__', lambda match: fields[match[1]], template)
        destination.parent.mkdir(parents=True, exist_ok=True)
        destination.write_text(page, encoding='utf-8')
    registry = root / 'security/public-files.json'
    manifest = json.loads(registry.read_text(encoding='utf-8'))
    existing = [path for path in manifest['files'] if path.casefold() == route.casefold()]
    if existing and existing != [route]:
        raise ValueError('A conflicting card path already exists in the Pages registry')
    if route not in manifest['files']:
        bisect.insort(manifest['files'], route)
        registry.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')


def check_staged(video_id):
    """Compare the committed baseline with the exact bytes staged for publication."""
    route = f'youtube-player-card/v/{video_id}/index.html'
    card = f'docs/{route}'
    registry = 'security/public-files.json'
    def git(*args):
        return subprocess.check_output(['git', *args], encoding='utf-8')
    paths = git('diff', '--cached', '--name-only', '-z').split('\0')
    if any(path and path not in (card, registry) for path in paths):
        raise ValueError('The staged commit includes an unrelated path')
    expected = json.loads(git('show', f'HEAD:{registry}'))
    if route not in expected['files']:
        bisect.insort(expected['files'], route)
    if json.loads(git('show', f':{registry}')) != expected:
        raise ValueError('The registry change exceeds the requested card')
    markup = git('show', f':{card}')
    if ('name="twitter:card" content="player"' not in markup or
            f'name="twitter:player" content="https://www.youtube.com/embed/{video_id}"' not in markup):
        raise ValueError('The staged card does not point to the requested YouTube player')


if __name__ == '__main__':
    if sys.argv[1] == '--check-staged':
        check_staged(sys.argv[2])
    else:
        publish(sys.argv[1])
