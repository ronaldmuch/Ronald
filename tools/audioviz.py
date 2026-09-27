# Espectrograma + niveles de la mezcla con las marcas de cada toma: python3 tools/audioviz.py salida.png [t0 t1]
import sys, json
import numpy as np
from scipy.io import wavfile
from scipy import signal
from PIL import Image, ImageDraw
out = sys.argv[1]
t0 = float(sys.argv[2]) if len(sys.argv) > 2 else 0
sr, x = wavfile.read('build/audio_mix.wav'); x = x.astype(np.float32)
_, mu = wavfile.read('build/stems/music.wav'); _, fx = wavfile.read('build/stems/sfx.wav')
t1 = float(sys.argv[3]) if len(sys.argv) > 3 else len(x) / sr
seg = lambda a: a[int(t0 * sr):int(t1 * sr)]
m = seg(x).mean(1)
f, tt, S = signal.spectrogram(m, sr, nperseg=2048, noverlap=1536)
S = 10 * np.log10(S + 1e-12)
W, H = 1800, 900
# eje de frecuencia logarítmico 40 Hz – 16 kHz
fl = np.geomspace(40, 16000, 360)
idx = np.clip(np.searchsorted(f, fl), 0, len(f) - 1)
img = S[idx][::-1]
img = np.clip((img + 110) / 80, 0, 1)
col = (np.stack([img ** 0.7, img ** 1.6, 0.3 + 0.7 * img ** 3], -1) * 255).astype(np.uint8)
spec = Image.fromarray(col).resize((W, 520))
canvas = Image.new('RGB', (W, H), 'black'); canvas.paste(spec, (0, 0))
d = ImageDraw.Draw(canvas)
def lvl(a, y0, h, color):
    a = seg(a); a = a if a.ndim == 1 else np.max(np.abs(a), 1)
    hop = max(1, len(a) // W)
    for i in range(W):
        s = a[i * hop:(i + 1) * hop]
        if len(s) == 0: continue
        v = 20 * np.log10(np.sqrt(np.mean(s ** 2)) + 1e-9); p = 20 * np.log10(np.max(np.abs(s)) + 1e-9)
        yv = y0 + h - int(np.clip((v + 60) / 60, 0, 1) * h); yp = y0 + h - int(np.clip((p + 60) / 60, 0, 1) * h)
        d.line([(i, y0 + h), (i, yv)], fill=color); d.point((i, yp), fill='white')
lvl(x, 530, 110, (90, 200, 255)); lvl(mu, 650, 110, (255, 170, 60)); lvl(fx, 770, 110, (120, 255, 120))
d.text((4, 532), 'MEZCLA', fill='white'); d.text((4, 652), 'MÚSICA', fill='white'); d.text((4, 772), 'EFECTOS', fill='white')
cues = json.load(open('build/cues.json'))
for s in cues['shots']:
    if t0 <= s['start'] <= t1:
        X = int((s['start'] - t0) / (t1 - t0) * W)
        d.line([(X, 0), (X, H)], fill=(255, 255, 0)); d.text((X + 2, 2), s['id'], fill='yellow')
for k in range(int(t0), int(t1) + 1, 5):
    X = int((k - t0) / (t1 - t0) * W); d.text((X, H - 12), f'{k}s', fill='gray')
canvas.save(out)
