#!/usr/bin/env python3
"""Record the exact Ubuntu oracle package and installed executable identity."""
import argparse,hashlib,json,subprocess
from pathlib import Path

def run(args):
    p=subprocess.run(args,check=True,capture_output=True,timeout=20)
    if len(p.stdout)+len(p.stderr)>65536:raise ValueError('Toolchain output exceeds bound')
    return p.stdout.decode('utf-8','strict')

def main():
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('--output',type=Path,required=True);a=p.parse_args()
    expected='7:6.1.1-3ubuntu5'
    installed=run(['dpkg-query','-W','-f=${Version}','ffmpeg'])
    if installed!=expected:raise ValueError('The reviewed Ubuntu ffmpeg package version differs')
    result={'schema':'vr180-ffmpeg-toolchain-v1','source':'Ubuntu 24.04 official signed APT distribution package; exact ffmpeg version installed by the scoped workflow',
      'packageVersion':installed,'files':{},'aptPolicy':run(['apt-cache','policy','ffmpeg']),
      'linkedPackages':run(['dpkg-query','-W','-f=${binary:Package}\t${Version}\n','ffmpeg','libavcodec60','libavformat60','libavutil58','libavfilter9','libswscale7','libswresample4'])}
    for name in ('ffmpeg','ffprobe'):
        binary=Path('/usr/bin')/name
        result['files'][name]={'path':str(binary),'sha256':hashlib.sha256(binary.read_bytes()).hexdigest(),
          'versionFirstLine':run([str(binary),'-version']).splitlines()[0],'linkedLibraries':run(['ldd',str(binary)])}
    a.output.parent.mkdir(parents=True,exist_ok=True)
    with a.output.open('x') as f:json.dump(result,f,indent=2);f.write('\n')
    print(json.dumps({'status':'RECORDED','packageVersion':installed,'manifestSHA256':hashlib.sha256(a.output.read_bytes()).hexdigest()}))

if __name__=='__main__':main()
