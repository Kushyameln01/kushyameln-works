from pathlib import Path
from PIL import Image
p=Path(__file__).with_name('rect-32x16.png')
assert not p.exists()
w,h=32,16
image=Image.new('RGB',(w,h))
image.putdata([((x*17+y*3)%256,(y*17+x*5)%256,(x*9+y*11)%256) for y in range(h) for x in range(w)])
image.save(p,format='PNG')
