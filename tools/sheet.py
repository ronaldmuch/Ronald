# Hoja de contactos de una carpeta de PNG: python3 tools/sheet.py <carpeta> <salida.png> [columnas]
import sys, glob
from PIL import Image, ImageDraw
d, out = sys.argv[1], sys.argv[2]
cols = int(sys.argv[3]) if len(sys.argv) > 3 else 3
fs = sorted(glob.glob(d + '/*.png'))
W, H = 640, 360
rows = (len(fs) + cols - 1) // cols
sheet = Image.new('RGB', (W * cols, H * rows), 'black')
dr = ImageDraw.Draw(sheet)
for i, f in enumerate(fs):
    im = Image.open(f).convert('RGB').resize((W, H))
    x, y = (i % cols) * W, (i // cols) * H
    sheet.paste(im, (x, y))
    dr.rectangle([x, y, x + 120, y + 22], fill='black')
    dr.text((x + 6, y + 5), f.split('/')[-1][1:-4], fill='yellow')
sheet.save(out)
