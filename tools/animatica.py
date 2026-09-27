# Animática de "3.2 Ecosistema Urbby — V2": cuadros exportados de Figma + las cámaras A→B(→C) de la
# "GUÍA DE CÁMARA" de cada escena, cortados al beat (129 BPM, WE ON GO). Sirve para validar ritmo y
# emoción antes de programar las escenas en el motor.
#
#   python3 tools/animatica.py [--song ruta/a/we_on_go.mp3] [--offset 0.0] [--out build/animatica_v2.mp4]
#
# Sin --song se genera una pista de clic (compás, beat y golpe en cada corte) para sentir el tempo.
import argparse, json, math, os, subprocess, sys
import numpy as np
from PIL import Image, ImageDraw, ImageFont
import imageio_ffmpeg

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, 'assets', 'animatica_v2')
BPM = 129
BEAT = 60 / BPM
FPS = 30
OW, OH = 1280, 720
SR = 48000
TAIL = 0.8                                   # fundido a negro al final
MATCH_CUTS = {'09', '19'}                    # escenas que entran con match cut (flash de 2 cuadros)

ap = argparse.ArgumentParser()
ap.add_argument('--song'); ap.add_argument('--offset', type=float, default=0.0)
ap.add_argument('--out', default=os.path.join(ROOT, 'build', 'animatica_v2.mp4'))
ap.add_argument('--no-hud', action='store_true')
args = ap.parse_args()

plan = json.load(open(os.path.join(SRC, 'plan.json')))
ids = sorted(plan)
for i in ids:
    plan[i]['start'] = plan[i]['b0'] * BEAT
    plan[i]['dur'] = plan[i]['beats'] * BEAT
    plan[i]['img'] = Image.open(os.path.join(SRC, f'{i}.png')).convert('RGB')
TOTAL = plan[ids[-1]]['start'] + plan[ids[-1]]['dur'] + TAIL

def ease_io(p): return 4 * p ** 3 if p < 0.5 else 1 - (-2 * p + 2) ** 3 / 2
def ease_expo(p): return 1 if p >= 1 else 1 - 2 ** (-10 * p)
def ease_in(p): return p ** 3

def cam_at(keys, t):
    """keys: [[t, x, y, w, h], ...] en el espacio 1920×1080 → rect de cámara en t."""
    if t <= keys[0][0]: return keys[0][1:]
    for a, b in zip(keys, keys[1:]):
        if t <= b[0]:
            span = b[0] - a[0]
            mv = min(span, 2 * BEAT)               # el movimiento termina justo en el beat marcado
            p = (t - (b[0] - mv)) / mv if mv > 0 else 1
            p = min(1, max(0, p))
            wa, wb = a[3], b[3]
            e = ease_expo(p) if wb > wa * 1.05 else ease_in(p) if wb < wa * 0.6 else ease_io(p)  # pull-out / snap / normal
            # zoom en escala logarítmica (movimiento óptico)
            w = math.exp(math.log(wa) + (math.log(wb) - math.log(wa)) * e)
            q = 0 if abs(wb - wa) < 1e-6 else (1 / w - 1 / wa) / (1 / wb - 1 / wa)
            q = e if abs(wb - wa) < 1e-6 else min(1, max(0, q))
            cx = (a[1] + a[3] / 2) + ((b[1] + b[3] / 2) - (a[1] + a[3] / 2)) * q
            cy = (a[2] + a[4] / 2) + ((b[2] + b[4] / 2) - (a[2] + a[4] / 2)) * q
            h = w * 9 / 16
            return [cx - w / 2, cy - h / 2, w, h]
    return keys[-1][1:]

def drift(t, seed):
    return (math.sin(t * 0.9 + seed) * 6 + math.sin(t * 2.3 + seed * 2) * 3,
            math.cos(t * 0.7 + seed) * 4 + math.sin(t * 1.9 + seed * 3) * 2)

try:
    FONT = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf', 18)
except OSError:
    FONT = ImageFont.load_default()

def render(t):
    sc = next((i for i in ids if plan[i]['start'] <= t < plan[i]['start'] + plan[i]['dur']), None)
    if sc is None:
        sc = ids[-1]
    d = plan[sc]; ts = t - d['start']
    x, y, w, h = cam_at(d['keys'], min(ts, d['dur']))
    # hold final: push-in muy lento para que el cuadro nunca quede muerto
    last = d['keys'][-1][0]
    if ts > last:
        k = 1 - 0.03 * min(1, (ts - last) / max(0.5, d['dur'] - last))
        cx, cy = x + w / 2, y + h / 2; w *= k; h *= k; x, y = cx - w / 2, cy - h / 2
    dx, dy = drift(t, int(sc))
    x += dx; y += dy
    w = min(w, 1920); h = w * 9 / 16
    x = min(max(x, 0), 1920 - w); y = min(max(y, 0), 1080 - h)
    img = d['img']; s = img.width / 1920
    fr = img.transform((OW, OH), Image.EXTENT, (x * s, y * s, (x + w) * s, (y + h) * s), Image.BICUBIC)
    a = np.asarray(fr).astype(np.float32)
    # flash de match cut (2 cuadros) y fundido final
    if sc in MATCH_CUTS and ts < 2 / FPS: a = a * 0.2 + 255 * 0.8
    end = plan[ids[-1]]['start'] + plan[ids[-1]]['dur']
    if t > end - 0.5: a *= max(0, 1 - (t - (end - 0.5)) / (0.5 + TAIL))
    fr = Image.fromarray(np.clip(a, 0, 255).astype(np.uint8))
    if not args.no_hud:
        b = t / BEAT
        dr = ImageDraw.Draw(fr)
        txt = f'{sc}  compás {int(b // 4) + 1}.{int(b % 4) + 1}  {t:05.2f}s'
        dr.rectangle([12, OH - 40, 12 + 12 * len(txt) + 16, OH - 12], fill=(1, 15, 51))
        dr.text((20, OH - 36), txt, font=FONT, fill=(34, 211, 238))
    return fr

def click_track():
    n = int(TOTAL * SR); out = np.zeros(n, np.float32)
    def add(t, sig):
        i = int(t * SR); j = min(n, i + len(sig)); out[i:j] += sig[:j - i]
    tt = np.arange(int(0.25 * SR)) / SR
    kick = np.sin(2 * np.pi * (50 + 90 * np.exp(-tt * 30)) * tt) * np.exp(-tt * 9) * 0.9
    tick = np.sin(2 * np.pi * 1800 * tt) * np.exp(-tt * 60) * 0.25
    hat = np.random.default_rng(1).standard_normal(len(tt)).astype(np.float32) * np.exp(-tt * 90) * 0.12
    boom = (np.sin(2 * np.pi * 38 * tt) * np.exp(-tt * 5) + np.random.default_rng(2).standard_normal(len(tt)) * np.exp(-tt * 25) * 0.3) * 0.8
    nb = int((TOTAL - TAIL) / BEAT)
    for b in range(nb):
        t = b * BEAT
        add(t, kick if b % 4 == 0 else tick)
        if b >= 32: add(t + BEAT / 2, hat)          # Acto 2: entra el groove
    for i in ids:
        if plan[i]['b0'] in (32, 96, 112): add(plan[i]['start'], boom)
    return np.clip(out, -1, 1)

def main():
    os.makedirs(os.path.dirname(args.out), exist_ok=True)
    ff = imageio_ffmpeg.get_ffmpeg_exe()
    vtmp = args.out + '.video.mp4'
    p = subprocess.Popen([ff, '-y', '-loglevel', 'error', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-s', f'{OW}x{OH}', '-r', str(FPS), '-i', '-',
                          '-c:v', 'libx264', '-preset', 'medium', '-crf', '20', '-pix_fmt', 'yuv420p', vtmp], stdin=subprocess.PIPE)
    nf = int(round(TOTAL * FPS))
    for f in range(nf):
        p.stdin.write(render(f / FPS).tobytes())
        if f % 150 == 0: print(f'  cuadro {f}/{nf}', file=sys.stderr)
    p.stdin.close(); p.wait()
    if args.song:
        audio = ['-ss', str(args.offset), '-i', args.song]
    else:
        import wave
        wav = args.out + '.click.wav'
        a = (click_track() * 32767).astype(np.int16)
        with wave.open(wav, 'wb') as w:
            w.setnchannels(1); w.setsampwidth(2); w.setframerate(SR); w.writeframes(a.tobytes())
        audio = ['-i', wav]
    subprocess.run([ff, '-y', '-loglevel', 'error', '-i', vtmp, *audio, '-map', '0:v', '-map', '1:a', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k',
                    '-af', f'afade=t=out:st={TOTAL - TAIL}:d={TAIL}', '-t', f'{TOTAL:.3f}', args.out], check=True)
    os.remove(vtmp)
    if not args.song: os.remove(wav)
    print(f'{args.out}  ({TOTAL:.2f}s, {nf} cuadros)')

main()
