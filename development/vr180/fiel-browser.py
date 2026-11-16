#!/usr/bin/env python3
"""Bounded VR180 fiel browser regression using repository synthetic media.

Runs the real UI and Worker, recovers MP4 downloads, and checks copy preservation
independently. Optional --origin targets an already deployed docs root. No user
media or OS save dialog is used. Does not certify interlaced decoding or VR use.
"""
import argparse
import base64
import functools
import hashlib
import http.server
import json
from pathlib import Path
import struct
import subprocess
import threading
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[2]

def digest(data):
    return hashlib.sha256(data).hexdigest()

def boxes(data, start=0, end=None):
    end = len(data) if end is None else end
    result = []
    while start < end:
        size, kind = struct.unpack_from('>I4s', data, start)
        header = 8
        if size == 1:
            size = struct.unpack_from('>Q', data, start + 8)[0]
            header = 16
        assert size >= header and start + size <= end
        result.append({'kind': kind.decode('latin1'), 'start': start,
                       'payload': start + header, 'end': start + size})
        start += size
    assert start == end
    return result

def find(data, path):
    nodes = boxes(data)
    for index, kind in enumerate(path):
        matching = [node for node in nodes if node['kind'] == kind]
        assert matching, path
        node = matching[0]
        if index == len(path) - 1:
            return node
        prefix = 8 if kind == 'stsd' else 78 if kind == 'avc1' else 0
        nodes = boxes(data, node['payload'] + prefix, node['end'])
    raise AssertionError('empty path')

VIDEO = ['moov', 'trak', 'mdia', 'minf', 'stbl', 'stsd', 'avc1']

def with_fiel(data, fields, detail):
    # Replace the front moov by same-size free and append its edited replacement;
    # all existing mdat byte positions and stco/co64 offsets remain unchanged.
    nodes = [find(data, VIDEO[:index]) for index in range(1, len(VIDEO) + 1)]
    moov, entry = nodes[0], nodes[-1]
    edited = bytearray(data[moov['start']:moov['end']])
    insert = entry['end'] - moov['start']
    edited[insert:insert] = struct.pack('>I4sBB', 10, b'fiel', fields, detail)
    for node in nodes:
        at = node['start'] - moov['start']
        size = struct.unpack_from('>I', edited, at)[0]
        struct.pack_into('>I', edited, at, size + 10)
    original = bytearray(data)
    original[moov['start'] + 4:moov['start'] + 8] = b'free'
    return bytes(original + edited)

def raw_box(data, node):
    return data[node['start']:node['end']]

def verify_copy(source, output):
    src_mdats = [node for node in boxes(source) if node['kind'] == 'mdat']
    dst_mdats = [node for node in boxes(output) if node['kind'] == 'mdat']
    assert len(src_mdats) == len(dst_mdats)
    for src, dst in zip(src_mdats, dst_mdats):
        assert src['start'] == dst['start']
        assert raw_box(source, src) == raw_box(output, dst)
    # Every video/audio sample table is identical except stsd (which gains VR).
    src_moov, dst_moov = find(source, ['moov']), find(output, ['moov'])
    src_tracks = [n for n in boxes(source, src_moov['payload'], src_moov['end']) if n['kind'] == 'trak']
    dst_tracks = [n for n in boxes(output, dst_moov['payload'], dst_moov['end']) if n['kind'] == 'trak']
    assert len(src_tracks) == len(dst_tracks)
    tables = []
    for index, (src, dst) in enumerate(zip(src_tracks, dst_tracks)):
        def descend(data, node, path):
            for kind in path:
                node = next(n for n in boxes(data, node['payload'], node['end']) if n['kind'] == kind)
            return node
        a = descend(source, src, ['mdia', 'minf', 'stbl'])
        b = descend(output, dst, ['mdia', 'minf', 'stbl'])
        source_tables = [n for n in boxes(source, a['payload'], a['end']) if n['kind'] != 'stsd']
        output_tables = [n for n in boxes(output, b['payload'], b['end']) if n['kind'] != 'stsd']
        assert [n['kind'] for n in source_tables] == [n['kind'] for n in output_tables]
        for x, y in zip(source_tables, output_tables):
            assert raw_box(source, x) == raw_box(output, y)
            tables.append(f"track{index + 1}/{x['kind']}")
    assert raw_box(source, find(source, VIDEO + ['fiel'])) == raw_box(output, find(output, VIDEO + ['fiel']))
    for kind in ['avcC', 'pasp']:
        src_entry, dst_entry = find(source, VIDEO), find(output, VIDEO)
        before = [n for n in boxes(source, src_entry['payload'] + 78, src_entry['end']) if n['kind'] == kind]
        after = [n for n in boxes(output, dst_entry['payload'] + 78, dst_entry['end']) if n['kind'] == kind]
        assert len(before) == len(after)
        assert [raw_box(source, n) for n in before] == [raw_box(output, n) for n in after]
    st3d = find(output, VIDEO + ['st3d'])
    assert output[st3d['payload']:st3d['end']] == bytes([0, 0, 0, 0, 2])
    equi = find(output, VIDEO + ['sv3d', 'proj', 'equi'])
    assert output[equi['payload']:equi['end']] == struct.pack('>IIIII', 0, 0, 0, 0x40000000, 0x40000000)
    return {'mdatBytesAndOffsetsEqual': True, 'sampleTablesEqual': tables,
            'fielEqual': True, 'avcCEqual': True, 'paspEqual': True,
            'sbsCropped180Metadata': True}

def baseline_check(source_path, revision):
    code = subprocess.check_output(['git', 'show', f'{revision}:docs/shared/vr180/mp4.mjs'], cwd=ROOT).decode()
    for name in ['open-ended-mdat.mjs', 'container-metadata.mjs']:
        code = code.replace(f"'./{name}'", repr((ROOT / 'docs/shared/vr180' / name).as_uri()))
    url = 'data:text/javascript;base64,' + base64.b64encode(code.encode()).decode()
    js = """const {inspectMp4}=await import(process.argv[1]);
const {readFile}=await import('node:fs/promises');
try { console.log(JSON.stringify({status:'unexpected-pass',info:await inspectMp4(new Blob([await readFile(process.argv[2])]))})); }
catch(error) {console.log(JSON.stringify({status:'rejected',error:error.message}));}"""
    result = json.loads(subprocess.check_output(['node', '--input-type=module', '-e', js, url, str(source_path)]))
    assert result['status'] == 'rejected' and 'unsupported fiel box in avc1' in result['error'], result
    return result

class QuietHandler(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *_args):
        pass

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--origin', help='Docs root, e.g. https://host/kushyameln-works')
    parser.add_argument('--output', type=Path, required=True)
    parser.add_argument('--baseline', default='80c542f15d7724d3a919804b5338a8d8b0b0d9bc')
    parser.add_argument('--browser', default='/usr/bin/chromium')
    args = parser.parse_args()
    args.output.mkdir(parents=True, exist_ok=False)
    baseline = (ROOT / 'docs/vr180-studio/fixtures/stereo180-sbs.mp4').read_bytes()
    sources = {}
    for label, fields, detail in [('progressive', 1, 0), ('interlaced', 2, 9)]:
        path = args.output / f'{label}-input.mp4'
        path.write_bytes(with_fiel(baseline, fields, detail))
        sources[label] = path.resolve()
    report = {'sourceCommit': subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=ROOT, text=True).strip(),
              'status': 'running', 'originalUserInputTested': False, 'scope': 'synthetic avc1/fiel regression',
              'candidateSourceSha256': {name: digest((ROOT / name).read_bytes()) for name in [
                  'docs/shared/vr180/mp4.mjs', 'docs/shared/vr180/worker.mjs', 'docs/vr180-studio/app.mjs']},
              'baseline': baseline_check(sources['progressive'], args.baseline), 'cases': {}}
    server = None
    if not args.origin:
        server = http.server.ThreadingHTTPServer(('127.0.0.1', 0), functools.partial(QuietHandler, directory=ROOT / 'docs'))
        threading.Thread(target=server.serve_forever, daemon=True).start()
        origin = f'http://127.0.0.1:{server.server_port}'
    else:
        origin = args.origin.rstrip('/')
    report['origin'] = origin
    try:
        with sync_playwright() as playwright:
            browser = playwright.chromium.launch(executable_path=args.browser, headless=True)
            report['browserVersion'] = browser.version
            try:
                for label, input_path in sources.items():
                    context = browser.new_context(accept_downloads=True)
                    context.route('**/*googletagmanager.com/**', lambda route: route.abort())
                    context.route('**/*google-analytics.com/**', lambda route: route.abort())
                    page = context.new_page()
                    errors = []
                    page.on('pageerror', lambda error: errors.append(str(error)))
                    page.goto(origin + '/vr180-studio/', wait_until='domcontentloaded')
                    page.locator('#file').set_input_files(str(input_path))
                    page.wait_for_function("() => {try{const r=JSON.parse(document.getElementById('diagnostics').textContent);return r.width || r.status==='failed';}catch{return false;}}")
                    info = json.loads(page.locator('#diagnostics').text_content())
                    assert info.get('videoCodec') == 'avc1', info
                    if label == 'interlaced':
                        assert info['transcodeSafe'] is False and any('Interlaced' in x for x in info['transcodeIssues'])
                    else:
                        assert info['transcodeSafe'] is True, info
                    page.check('#confirmed')
                    page.wait_for_function("!document.getElementById('run').disabled")
                    page.click('#run')
                    page.wait_for_function("() => {try{const r=JSON.parse(document.getElementById('diagnostics').textContent);return r.output || r.status==='failed';}catch{return false;}}", timeout=60000)
                    receipt = json.loads(page.locator('#diagnostics').text_content())
                    assert receipt['status'] == 'prepared', receipt
                    output_path = args.output / f'{label}-copy.mp4'
                    with page.expect_download() as download:
                        page.click('#download')
                    download.value.save_as(output_path)
                    assert download.value.failure() is None
                    receipt = json.loads(page.locator('#diagnostics').text_content())
                    (args.output / f'{label}-copy-receipt.json').write_text(json.dumps(receipt, ensure_ascii=False, indent=2))
                    source_bytes, output_bytes = input_path.read_bytes(), output_path.read_bytes()
                    assert receipt['input']['sha256'] == digest(source_bytes)
                    assert receipt['output']['sha256'] == digest(output_bytes)
                    assert receipt['output']['bytes'] == len(output_bytes)
                    checks = verify_copy(source_bytes, output_bytes)
                    report['cases'][label] = {'inputBytes': len(source_bytes), 'inputSha256': digest(source_bytes),
                        'outputBytes': len(output_bytes), 'outputSha256': digest(output_bytes),
                        'operationId': receipt['operationId'], 'inputRevision': receipt['inputRevision'],
                        'build': receipt['build'], 'inspect': info, 'copyChecks': checks,
                        'downloadRecovered': True, 'receiptSaveCompleted': receipt['saveCompleted'],
                        'pageErrors': errors}
                    # The runtime gate is checked without attempting interlaced decode.
                    page.select_option('#mode', 'convert')
                    page.select_option('#size', '256')
                    if label == 'interlaced':
                        assert page.locator('#run').is_disabled()
                        report['cases'][label]['conversionBlockedInUI'] = True
                    else:
                        page.wait_for_function("!document.getElementById('run').disabled")
                        page.click('#run')
                        page.wait_for_function("() => {try{const r=JSON.parse(document.getElementById('diagnostics').textContent);return r.output || r.status==='failed';}catch{return false;}}", timeout=90000)
                        converted = json.loads(page.locator('#diagnostics').text_content())
                        (args.output / 'progressive-convert-receipt.json').write_text(json.dumps(converted, ensure_ascii=False, indent=2))
                        report['cases'][label]['conversionStatus'] = converted['status']
                        if converted['status'] == 'prepared':
                            conversion_path = args.output / 'progressive-convert.mp4'
                            with page.expect_download() as download:
                                page.click('#download')
                            download.value.save_as(conversion_path)
                            assert download.value.failure() is None
                            assert digest(conversion_path.read_bytes()) == converted['output']['sha256']
                            subprocess.run(['python', str(ROOT / 'tools/vr180/verify-conversion.py'), str(input_path), str(conversion_path),
                                '--layout', 'sbs', '--fov', '180', '--eye-size', '256', '--report', str(args.output / 'conversion-verification.json')], check=True)
                            report['cases'][label]['conversionIndependentVerification'] = 'passed'
                        else:
                            report['cases'][label]['conversionError'] = converted.get('error')
                    if page.locator('#clear').is_enabled():
                        page.click('#clear')
                        page.wait_for_function("document.getElementById('clear').disabled")
                    context.close()
                report['status'] = ('passed' if report['cases']['progressive'].get('conversionIndependentVerification') == 'passed'
                                    else 'copy-passed-conversion-failed')
            finally:
                browser.close()
    except Exception as error:
        report['status'] = 'blocked-or-failed'
        report['error'] = {'type': type(error).__name__, 'message': str(error)}
        raise
    finally:
        if server:
            server.shutdown()
            server.server_close()
        (args.output / 'browser-verification.json').write_text(json.dumps(report, ensure_ascii=False, indent=2))
    print(json.dumps({'status': report['status'], 'browserVersion': report['browserVersion'], 'cases': list(report['cases']), 'output': str(args.output)}, ensure_ascii=False))

if __name__ == '__main__':
    main()
