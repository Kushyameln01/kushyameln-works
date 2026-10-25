#!/usr/bin/env python3
"""Rebuild the revision-2 bundled Template from the unchanged source package.

Only the two exact parameter values below and their Clip CRC32 bindings change.
No archive member is extracted to disk. --check compares without writing.
"""
import argparse
import hashlib
import io
import json
import re
import tarfile
import zlib
from pathlib import Path

SOURCE_SHA256 = '9b22ae3d088ceef597b9ac98015da917599842ab3f9932859c658ddd34c99c09'
VALUE_REMAP = {'v2/Parameter': 'Decode/Parameter', 'Smooth/Parameter': 'v2/Parameter'}
MOTION = re.compile(r'^    m_Motion: \{fileID: (-?\d+), guid: ([0-9a-f]{32}), type: 2\}$', re.M)


def revised_text(text, clip=False):
    hashes = {}
    if clip:
        attributes = re.findall(r'^    attribute: (.+)$', text, re.M)
        bindings = re.findall(r'^      attribute: (\d+)$', text, re.M)
        assert bindings and len(attributes) == 2 * len(bindings)
        assert attributes[:len(bindings)] == attributes[len(bindings):]
        assert [str(zlib.crc32(value.encode())) for value in attributes[:len(bindings)]] == bindings
        for value in attributes[:len(bindings)]:
            old = str(zlib.crc32(value.encode()))
            new = str(zlib.crc32(VALUE_REMAP.get(value, value).encode()))
            assert old not in hashes or hashes[old] == new
            hashes[old] = new
    # One lookup against each original value, not successive text replacements.
    text = re.sub(r'^([ \t]+[A-Za-z_][A-Za-z0-9_]*: )(v2/Parameter|Smooth/Parameter)$',
                  lambda match: match[1] + VALUE_REMAP[match[2]], text, flags=re.M)
    if clip:
        section = re.compile(r'^  m_ClipBindingConstant:\n[\s\S]*?(?=^  [A-Za-z_])', re.M)
        assert len(section.findall(text)) == 1
        text = section.sub(lambda match: re.sub(
            r'^(      attribute: )(\d+)$',
            lambda binding: binding[1] + hashes[binding[2]], match[0], flags=re.M), text)
        attributes = re.findall(r'^    attribute: (.+)$', text, re.M)
        bindings = re.findall(r'^      attribute: (\d+)$', text, re.M)
        assert [str(zlib.crc32(value.encode())) for value in attributes[:len(bindings)]] == bindings
    return text


def extract_template(source):
    raw = source.read_bytes()
    assert hashlib.sha256(raw).hexdigest() == SOURCE_SHA256, 'Unexpected source unitypackage SHA-256'
    members = {}
    with tarfile.open(fileobj=io.BytesIO(raw), mode='r:gz') as archive:
        for member in archive:
            assert member.isdir() or member.isfile(), 'Links and special members are not allowed'
            assert re.fullmatch(r'[0-9a-f]{32}/?|[0-9a-f]{32}/(?:asset|asset.meta|pathname|preview.png)', member.name)
            if member.isfile():
                assert member.name not in members, 'Duplicate package member'
                members[member.name] = archive.extractfile(member).read()
    assets = {}
    for member in sorted(members):
        if not member.endswith('/pathname'):
            continue
        guid = member.split('/')[0]
        meta = members[guid + '/asset.meta'].decode('utf-8')
        assert re.search(r'^guid: ' + guid + r'$', meta, re.M)
        if guid + '/asset' in members:
            text = members[guid + '/asset'].decode('utf-8')
            objects = re.findall(r'^--- !u!(\d+) &(-?\d+)$', text, re.M)
            if objects and objects[0][0] in {'206', '74'}:
                kind, file_id = objects[0]
                assert len(objects) == 1 and file_id == ('20600000' if kind == '206' else '7400000')
                assets[guid] = {'kind': kind, 'text': text}
    trees = {guid: asset for guid, asset in assets.items() if asset['kind'] == '206'}
    assert len(trees) == 16
    referenced_clips = set()
    for tree in trees.values():
        for file_id, guid in MOTION.findall(tree['text']):
            dependency = assets[guid]
            assert file_id == ('20600000' if dependency['kind'] == '206' else '7400000')
            if dependency['kind'] == '74':
                referenced_clips.add(guid)
    assert len(referenced_clips) == 20
    return {
        'schemaVersion': 1,
        'sourceSha256': SOURCE_SHA256,
        'templateRevision': 2,
        'valueRemap': VALUE_REMAP,
        'trees': [{'guid': guid, 'text': revised_text(tree['text'])} for guid, tree in sorted(trees.items())],
        'clips': [{'guid': guid, 'text': revised_text(assets[guid]['text'], clip=True)} for guid in sorted(referenced_clips)],
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('original', type=Path)
    parser.add_argument('--output', type=Path, default=Path(__file__).resolve().parents[2] / 'docs/parameter-template/template.json')
    parser.add_argument('--check', action='store_true')
    args = parser.parse_args()
    payload = json.dumps(extract_template(args.original), ensure_ascii=False, separators=(',', ':')).encode('utf-8')
    if args.check:
        assert args.output.read_bytes() == payload, 'Bundled Template differs from revision-2 extraction'
        print('PASS: bundled Template matches source-derived revision 2; 16 Trees and 20 Clips')
    else:
        args.output.write_bytes(payload)
        print('WROTE: revision-2 Template; source package unchanged; 16 Trees and 20 Clips')


if __name__ == '__main__':
    main()
