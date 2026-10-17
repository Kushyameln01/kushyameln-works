"""Independent deterministic packed-stereo inputs. No production JS is imported."""
import hashlib, json, math, pathlib, struct, subprocess, wave
from PIL import Image, ImageDraw, ImageFont

ROOT = pathlib.Path(__file__).resolve().parents[2]
DEST = ROOT / 'docs/vr180-studio/fixtures'
DEST.mkdir(parents=True, exist_ok=True)
TMP = ROOT / 'development/vr180/evidence/fixtures'
TMP.mkdir(parents=True, exist_ok=True)
RATE, FPS, SECONDS = 48000, 30, 2
wav = TMP / 'sync.wav'
with wave.open(str(wav), 'wb') as out:
    out.setparams((1, 2, RATE, 0, 'NONE', 'not compressed'))
    out.writeframes(b''.join(struct.pack('<h', int(9000*math.sin(2*math.pi*880*n/RATE)))
                            if .45 <= n/RATE < .55 or 1.45 <= n/RATE < 1.55 else b'\0\0'
                            for n in range(RATE*SECONDS)))

def eye(index, frame, fov):
    w, h = (256 if fov == 180 else 512), 256
    im = Image.new('RGB', (w, h), ('#18365b' if index == 0 else '#174833'))
    d = ImageDraw.Draw(im)
    for x in range(0, w, 32): d.line((x,0,x,h), fill='#6d8999')
    for y in range(0, h, 32): d.line((0,y,w,y), fill='#6d8999')
    center = w//2
    d.line((center,0,center,h), fill='yellow', width=3)
    d.line((0,h//2,w,h//2), fill='white', width=2)
    d.text((center-28,35), f'{"LEFT" if index==0 else "RIGHT"}', fill='white')
    d.text((center-38,55), f't={frame/FPS:04.2f}', fill='white')
    d.text((center-30,75), 'FRONT 0', fill='yellow')
    if fov == 360:
        d.rectangle((0,0,127,h-1), fill='#481832')
        d.rectangle((384,0,511,h-1), fill='#481832')
        d.text((20,40), 'BACK', fill='white')
    x = center - 80 + (frame*3)%150 + index*3
    d.rectangle((x,170,x+15,185), fill='orange')
    if 14 <= frame <= 16 or 44 <= frame <= 46:
        d.rectangle((center-15,100,center+15,130), fill='red')
    return im

records=[]
for name, fov, layout in [('stereo180-sbs',180,'sbs'),('stereo180-tb',180,'tb'),('stereo360-tb',360,'tb')]:
    a=eye(0,0,fov); w,h=a.size
    size=(2*w,h) if layout=='sbs' else (w,2*h)
    target=DEST/(name+'.mp4')
    cmd=['ffmpeg','-hide_banner','-loglevel','error','-y','-f','rawvideo','-pixel_format','rgb24','-video_size',f'{size[0]}x{size[1]}','-framerate',str(FPS),'-i','pipe:0','-i',str(wav),'-map','0:v:0','-map','1:a:0','-c:v','libx264','-crf','18','-pix_fmt','yuv420p','-bf','2','-c:a','aac','-b:a','96k','-movflags','+faststart',str(target)]
    p=subprocess.Popen(cmd,stdin=subprocess.PIPE)
    for n in range(FPS*SECONDS):
        im=Image.new('RGB',size)
        im.paste(eye(0,n,fov),(0,0)); im.paste(eye(1,n,fov),(w,0) if layout=='sbs' else (0,h))
        p.stdin.write(im.tobytes())
    p.stdin.close()
    if p.wait(): raise RuntimeError('fixture encoding failed')
    data=target.read_bytes()
    records.append({'name':target.name,'layout':layout,'fov':fov,'width':size[0],'height':size[1], 'frames':FPS*SECONDS,'duration':SECONDS,'bytes':len(data),'sha256':hashlib.sha256(data).hexdigest()})
(DEST/'manifest.json').write_text(json.dumps({'generator':'tools/vr180/make-fixtures.py','source':'synthetic; no user media','expected':{'leftLabel':'LEFT','rightLabel':'RIGHT','front':'yellow center','audioBeepIntervals':[[.45,.55],[1.45,1.55]],'redFrameIndices':[14,15,16,44,45,46]},'files':records},indent=2)+'\n')
print(json.dumps(records,indent=2))
