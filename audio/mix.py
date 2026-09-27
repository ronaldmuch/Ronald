"""Mezcla final: música + efectos alineados a los cues exportados del timeline de video.

Uso: python3 audio/mix.py  →  build/audio_mix.wav (+ stems en build/stems/)
"""
import json
import os
import sys
import time
import numpy as np
from scipy.io import wavfile

sys.path.insert(0, os.path.dirname(__file__))
from dsp import *
import music
import sfx

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
BUILD = os.path.join(ROOT, 'build')


def balance(x, p):
    p = float(np.clip(p, -1, 1))
    th = (p + 1) * np.pi / 4
    return np.stack([x[0] * np.cos(th) * np.sqrt(2), x[1] * np.sin(th) * np.sqrt(2)])


def lookahead_limiter(x, ceiling_db=-1.0, look=0.004, rel=0.08):
    c = db(ceiling_db)
    pk = np.max(np.abs(x), axis=0)
    need = np.minimum(1.0, c / (pk + 1e-12))
    la = int(look * SR)
    # mínimo en ventana (lookahead) y suavizado de relajación
    from scipy.ndimage import minimum_filter1d
    g = minimum_filter1d(need, size=2 * la + 1, origin=0)
    g = np.concatenate([g[la:], np.ones(la)])
    blk = 32; nb = (len(g) + blk - 1) // blk
    gb = np.array([g[i * blk:(i + 1) * blk].min() for i in range(nb)])
    out = np.empty(nb); v = 1.0; cr = np.exp(-blk / (rel * SR))
    for i in range(nb):
        v = gb[i] if gb[i] < v else cr * v + (1 - cr) * gb[i]
        out[i] = v
    gs = np.repeat(out, blk)[:len(g)]
    return x * gs


def main():
    t0 = time.time()
    cues = json.load(open(os.path.join(BUILD, 'cues.json')))
    total = cues['total']
    n = n_of(total)
    shots = {s['id']: s for s in cues['shots']}

    # ── música ──
    bus = music.build(total)
    hall = make_ir(2.6, 2.4, 7000, 0.02, seed=11, damp=3000)
    plate = make_ir(1.4, 1.2, 9000, 0.008, seed=12, damp=5000)
    room = make_ir(0.6, 0.45, 8000, 0.004, seed=13, damp=4000)
    drums = compress(bus['drums'], -16, 3.0, 0.003, 0.12, 3)
    drums = reverb(drums, room, 0.10)
    bass_ = eq(bus['bass'], 'lowshelf', 90, 0.7, 2.0)
    keys = reverb(eq(bus['keys'], 'highshelf', 6000, 0.7, -2.0), plate, 0.22)
    lead = reverb(bus['lead'], hall, 0.28)
    pads = reverb(bus['pad'], hall, 0.35)
    fxm = reverb(bus['fx'], hall, 0.2)
    clock = reverb(bus['clock'], room, 0.25)
    mus = drums * 0.9 + bass_ * 0.8 + keys * 0.8 + lead * 0.8 + pads * 0.65 + fxm * 0.8
    mus = eq(mus, 'peak', 260, 0.9, -2.5)
    mus = lp(mus, 14000, 2)
    # automatización por sección (dB), anclada al horario real de las tomas
    S = lambda k: shots[k]['start']
    E_ = lambda k: shots[k]['end']
    pts = [(0, -11), (S('02') - 0.05, -9), (S('06'), -6), (S('10') + 1.2, -3), (S('11'), -4), (E_('11') - 0.6, -7),
           (S('12'), 0), (S('14b') - 0.15, 0), (S('14b') + 0.2, -9), (S('15') - 0.2, -9), (S('15') + 0.05, -1),
           (S('17'), 0), (S('24') + 3.0, 0), (S('25') + 0.2, -6), (S('26'), -5), (S('26') + 2.5, -2),
           (S('27'), -1.5), (S('28') - 0.3, 1.0), (S('28') + 0.4, 0), (total, 0)]
    tx = np.array([q[0] for q in pts]); gx = np.array([q[1] for q in pts])
    auto = db(np.interp(np.arange(n) / SR, tx, gx))
    mus = mus * auto + clock * db(np.interp(np.arange(n) / SR, [0, S('02'), S('10') + 1.2, total], [-4, -2, 0, 0])) * 0.9

    # ── efectos ──
    fxbus = np.zeros((2, n)); amb = np.zeros((2, n)); voc = np.zeros((2, n))
    missing = set()
    for c in cues['cues']:
        x = sfx.make(c['name'], c)
        if x is None:
            missing.add(c['name']); continue
        x = balance(x, c.get('pan', 0.0)) if c.get('pan') else x
        g = c.get('gain', 1.0)
        tgt = amb if c['name'].endswith('_amb') or c['name'] in ('room_night', 'engine', 'wind') else (voc if c['name'] in ('breath_tired', 'sigh', 'yawn', 'startle', 'surprise_gasp', 'breath_relief', 'sleep_breath', 'effort', 'mm_happy', 'sip') else fxbus)
        place(tgt, x, c['t'], g)
    if missing:
        print('SFX sin definir:', sorted(missing))
    fxbus = reverb(fxbus, room, 0.12)
    fxbus = reverb(fxbus, hall, 0.06, dry=1.0)
    voc = reverb(eq(voc, 'hp', 120), room, 0.15)
    amb = amb * 0.8
    sfx_all = fxbus * 1.0 + voc * 0.9 + amb * 0.7

    # ── ducking: la música cede ante los efectos importantes ──
    env = smooth_env(fxbus + voc, 0.01, 0.25)
    duck = 1 - 0.38 * np.clip(env / 0.35, 0, 1)
    mus = mus * duck

    # ── silencio del congelado (toma 10) → golpe grave en el corte a 11 ──
    s10 = shots['10']; s11 = shots['11']
    f0, f1 = s10['start'] + 1.28 + 0.01, s11['start'] - 0.004
    i0, i1 = int(f0 * SR), int(f1 * SR)
    ramp = int(0.006 * SR)
    gate = np.ones(n)
    gate[i0:i1] = 0.0
    gate[i0 - ramp:i0] = np.linspace(1, 0, ramp)
    mus = mus * gate
    amb = amb * gate
    sfx_all = sfx_all * np.where(np.arange(n) < i0 - int(0.3 * SR), 1.0, gate)  # deja pasar el freeze_hit

    mix = mus * db(-3.0) + sfx_all * db(-1.5)
    # cola final
    fo = int(1.1 * SR)
    mix[:, -fo:] *= np.linspace(1, 0, fo) ** 1.5

    # ── master ──
    mix = hp(mix, 28, 2)
    mix = eq(mix, 'highshelf', 10000, 0.7, -3.5)
    mix = eq(mix, 'peak', 3200, 1.0, 1.0)
    mix = compress(mix, -14, 2.0, 0.01, 0.2, 2.0)
    # loudness aproximada (RMS de las partes activas) → ~ -15 dBFS RMS
    act = np.max(np.abs(mix), axis=0) > 1e-3
    rms = np.sqrt(np.mean(mix[:, act] ** 2))
    mix *= db(-16.5) / (rms + 1e-12)
    mix = lookahead_limiter(mix, -1.0)
    mix = softclip(mix * 0.98, 1.05) * 0.98
    os.makedirs(os.path.join(BUILD, 'stems'), exist_ok=True)
    wavfile.write(os.path.join(BUILD, 'audio_mix.wav'), SR, mix.T.astype(np.float32))
    for k, v in (('music', mus), ('sfx', sfx_all)):
        wavfile.write(os.path.join(BUILD, 'stems', f'{k}.wav'), SR, (v.T / (np.max(np.abs(v)) + 1e-9) * 0.9).astype(np.float32))
    print(f'audio {total:.2f} s listo en {time.time() - t0:.1f} s; pico {20*np.log10(np.max(np.abs(mix))):.2f} dBFS; rms {20*np.log10(np.sqrt(np.mean(mix[:, act]**2))):.1f} dBFS')


if __name__ == '__main__':
    main()
