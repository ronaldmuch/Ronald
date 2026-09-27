"""Efectos de sonido sintetizados. Cada generador devuelve estéreo (2, n) con pico ~0.7."""
import numpy as np
from dsp import *
from instruments import kick, snare, crash, bell, marimba, sub_hit, hat, reverse_cymbal


def _t(n):
    return np.arange(n) / SR


def addat(x, y, i=0):
    """Suma y dentro de x a partir de la muestra i, recortando lo que sobre."""
    if i >= x.shape[-1]:
        return x
    m = min(y.shape[-1], x.shape[-1] - i)
    x[..., i:i + m] += y[..., :m]
    return x


def norm(x, pk=0.7):
    m = np.max(np.abs(x)) + 1e-9
    return x * pk / m


# ───────── bloques básicos ─────────
def whoosh(dur=0.4, f0=300, f1=3000, f2=None, q=1.2, pan0=0.0, pan1=0.0, seed=None, shape=1.6, bright=1.0):
    n = n_of(dur); t = _t(n); u = t / dur
    if f2 is None:
        fp = f0 * (f1 / f0) ** u
    else:  # sube y baja
        fp = np.where(u < 0.5, f0 * (f1 / f0) ** (u * 2), f1 * (f2 / f1) ** ((u - 0.5) * 2))
    nb = (n + 63) // 64
    x = sweep(noise(n, 'pink', seed), 'bp', 0, 0, q=q, fpath=fp[::64][:nb])
    x += sweep(noise(n, 'white', None if seed is None else seed + 1), 'bp', 0, 0, q=q * 1.5, fpath=(fp * 2.2)[::64][:nb]) * 0.25 * bright
    e = np.sin(np.pi * np.clip(u, 0, 1)) ** shape
    return norm(pan_move(x * e, pan0, pan1))


def blip(f0, f1, dur=0.08, wave='sine', decay=30):
    n = n_of(dur); t = _t(n); u = t / dur
    f = f0 * (f1 / f0) ** np.clip(u * 3, 0, 1)
    x = np.sin(phase_of(f)) if wave == 'sine' else square(f, None) * 0.5
    return x * np.exp(-t * decay) * (1 - np.exp(-t * 2000))


def click_(seed=None, f1=2000, f2=6000, dur=0.012, level=1.0):
    n = n_of(dur); t = _t(n)
    return bp(noise(n, seed=seed), f1, f2) * np.exp(-t * 600) * level


def thump(f=120, dur=0.12, decay=35):
    n = n_of(dur); t = _t(n)
    return np.sin(phase_of(f * (1 + 0.8 * np.exp(-t * 60)))) * np.exp(-t * decay)


def sparkle(dur=0.6, density=40, f_lo=3000, f_hi=9000, seed=None):
    n = n_of(dur); r = rng(seed); x = np.zeros((2, n))
    k = int(density * dur)
    for i in range(k):
        t0 = r.uniform(0, dur * 0.85)
        f = r.uniform(f_lo, f_hi)
        b = blip(f, f * r.uniform(1.0, 1.3), 0.06, decay=60) * r.uniform(0.3, 1.0) * (1 - t0 / dur)
        place(x, pan(b, r.uniform(-0.8, 0.8)), t0)
    return x


def ring(freqs, dur=1.2, decays=None, amps=None):
    n = n_of(dur); t = _t(n); x = np.zeros(n)
    for i, f in enumerate(freqs):
        d = decays[i] if decays else 3 + i
        a = amps[i] if amps else 1 / (i + 1)
        x += np.sin(phase_of(f, n)) * np.exp(-t * d) * a
    return x * (1 - np.exp(-t * 3000))


def voice(f0_path, formants, dur, breath=0.3, voiced=1.0, seed=None):
    """Voz muy simple (pulso glotal + formantes) para suspiros, bostezos, 'mm'."""
    n = n_of(dur)
    f0 = np.interp(np.linspace(0, 1, n), np.linspace(0, 1, len(f0_path)), f0_path)
    src = lp(saw(f0, None), 3000) * voiced + noise(n, 'pink', seed) * breath
    out = np.zeros(n)
    for f, bw, g in formants:
        out += reson(src, f, f / bw) * g
    return out


# ───────── teléfono / UI ─────────
def vibrate(dur=0.36, soft=False, seed=None):
    n = n_of(dur); t = _t(n)
    f = 168 + 4 * np.sin(2 * np.pi * 9 * t)
    motor = square(f, None, 0.42) * 0.6 + np.sin(phase_of(f * 2)) * 0.3
    motor *= 1 + 0.35 * np.sin(2 * np.pi * 31 * t)
    rattle = bp(noise(n, seed=seed), 900, 3500) * (np.sin(phase_of(f)) > 0.6) * 0.5
    x = motor + rattle
    x = lp(x, 1100 if soft else 1600, 4) + hp(rattle, 2500) * (0.0 if soft else 0.15)
    e = np.clip(t / 0.015, 0, 1) * np.clip((dur - t) / 0.03, 0, 1)
    return norm(st(x * e), 0.5 if soft else 0.7)


def notif(pitch=1.0, soft=False):
    x = np.zeros(n_of(0.6))
    for i, (f, t0) in enumerate([(1318.5, 0.0), (1760, 0.085)]):
        if soft and i == 1: continue
        tone = ring([f * pitch, f * pitch * 2.0, f * pitch * 3.01], 0.5, [9, 16, 26], [1, 0.25, 0.08])
        addat(x, tone, int(t0 * SR))
    if soft: x = lp(x, 3000)
    return norm(st(x), 0.6)


def msg_in(pitch=1.0):
    a = blip(700 * pitch, 1100 * pitch, 0.09, decay=35)
    b = ring([1480 * pitch, 2960 * pitch], 0.45, [10, 20], [1, 0.2])
    x = np.zeros(n_of(0.55)); addat(x, a * 0.6, 0); i = int(0.05 * SR); addat(x, b, i)
    return norm(st(x), 0.6)


def two_tone(f1, f2, gap=0.09, dec=10, dur=0.7):
    x = np.zeros(n_of(dur))
    for f, t0 in [(f1, 0), (f2, gap)]:
        tone = ring([f, f * 2.0, f * 3.0], dur - t0, [dec, dec * 2, dec * 3], [1, 0.2, 0.06])
        i = int(t0 * SR); addat(x, tone, i)
    return norm(st(x), 0.6)


def pop_(pitch=1.0, big=False):
    n = n_of(0.16); t = _t(n)
    f = (380 + 520 * np.clip(t / 0.05, 0, 1) ** 0.6) * pitch
    x = np.sin(phase_of(f)) * np.exp(-t * (22 if big else 34)) * (1 - np.exp(-t * 900))
    x += click_(dur=0.01, level=0.25)[:1] if False else 0
    c = click_(seed=int(pitch * 100), f1=1500, f2=5000, dur=0.008, level=0.3)
    addat(x, c, 0)
    if big:
        s = sparkle(0.4, 30, seed=3); y = st(x * 0.9); place(y, s * 0.25, 0.02) if y.shape[1] > 10 else None
        return norm(y, 0.7)
    return norm(st(x), 0.65)


def tap(kind='soft', seed=None):
    c = click_(seed=seed, f1=2500, f2=7000, dur=0.01, level=1.0)
    th = thump(210 if kind != 'firm' else 150, 0.08, 45)
    n = max(len(c), len(th)); x = np.zeros(n)
    addat(x, c, 0) * (0.6 if kind == 'soft' else 0.9); addat(x, th, 0) * (0.5 if kind == 'soft' else 0.9)
    if kind == 'pop':
        p = pop_(1.3)[0]; y = np.zeros(max(n, len(p))); y[:n] += x; addat(y, p * 0.7, 0); x = y
    return norm(st(x), 0.7)


def mouse_click(seed=None):
    x = np.zeros(n_of(0.06))
    for d, lv in [(0, 1.0), (0.045, 0.6)]:
        c = click_(seed=seed, f1=1800, f2=6500, dur=0.01, level=lv); i = int(d * SR); x[i:i + len(c)] += c
    return norm(st(x + 0), 0.6)


def keyboard(dur=0.8, seed=None, rate=(0.055, 0.11), soft=False):
    r = rng(seed); x = np.zeros((2, n_of(dur + 0.1)))
    t = 0.0
    while t < dur:
        lv = r.uniform(0.5, 1.0)
        c = click_(seed=r.integers(1e6), f1=r.uniform(1400, 2200), f2=r.uniform(4000, 7000), dur=0.018, level=lv)
        th = thump(r.uniform(180, 320), 0.05, 70) * 0.5 * lv
        k = np.zeros(max(len(c), len(th))); addat(k, c, 0); addat(k, th, 0)
        if soft: k = lp(k, 3500)
        place(x, pan(k, r.uniform(-0.25, 0.25)), t)
        t += r.uniform(*rate)
    return norm(x, 0.6)


def enter_key():
    c = click_(seed=7, f1=1000, f2=4000, dur=0.02, level=1.0)
    th = thump(140, 0.1, 40)
    x = np.zeros(len(th)); addat(x, c, 0); x += th * 0.8
    return norm(st(x), 0.7)


def swipe(dur=0.2, seed=None, soft=False):
    return whoosh(dur, 1200, 5500, None, q=0.9, seed=seed, bright=0.6) * (0.6 if soft else 1.0)


def error_():
    x = np.zeros(n_of(0.3))
    for f, t0 in [(196, 0), (147, 0.12)]:
        n = n_of(0.1); tt_ = _t(n)
        s = lp(square(f, n) * 0.5 + saw(f * 2, n) * 0.2, 1800) * np.exp(-tt_ * 12)
        i = int(t0 * SR); addat(x, s, i)
    return norm(st(x), 0.6)


def sigh(dur=0.9, deep=False, seed=None):
    f0 = [120, 112, 96] if not deep else [110, 100, 88]
    v = voice(f0, [(650, 120, 1.0), (1080, 150, 0.6), (2600, 300, 0.2)], dur, breath=0.9, voiced=0.12, seed=seed)
    n = len(v); t = _t(n); u = t / dur
    e = np.clip(u / 0.12, 0, 1) * np.exp(-np.clip(u - 0.3, 0, None) * 3.5)
    return norm(st(lp(v * e, 4000)), 0.6)


def inhale(dur=0.35, seed=None):
    n = n_of(dur); t = _t(n); u = t / dur
    x = voice([200, 210], [(1200, 400, 1.0), (2600, 500, 0.6)], dur, breath=1.0, voiced=0.0, seed=seed)
    e = u ** 1.4 * np.clip((1 - u) / 0.08, 0, 1)
    return norm(st(x * e), 0.6)


def yawn(dur=1.3, seed=None):
    f0 = np.concatenate([np.linspace(150, 185, 30), np.linspace(185, 118, 60), np.linspace(118, 100, 20)])
    n = n_of(dur); u = _t(n) / dur
    F1 = np.interp(u, [0, 0.35, 0.7, 1], [500, 780, 700, 420]); F2 = np.interp(u, [0, 0.35, 0.7, 1], [1500, 1250, 1100, 900])
    src = lp(saw(np.interp(np.linspace(0, 1, n), np.linspace(0, 1, len(f0)), f0), None), 2800) * 0.7 + noise(n, 'pink', seed) * 0.5
    nb = (n + 63) // 64
    y = sweep(src, 'bp', 0, 0, q=5, fpath=F1[::64][:nb]) + 0.55 * sweep(src, 'bp', 0, 0, q=7, fpath=F2[::64][:nb])
    e = np.clip(u / 0.15, 0, 1) * np.clip((1 - u) / 0.3, 0, 1)
    return norm(st(lp(y * e, 3500)), 0.55)


def hum_mm(dur=0.4):
    f0 = np.linspace(150, 215, 20)
    v = voice(f0, [(250, 60, 1.0), (2200, 300, 0.25), (3300, 400, 0.1)], dur, breath=0.05, voiced=1.0)
    n = len(v); u = _t(n) / dur
    e = np.clip(u / 0.08, 0, 1) * np.clip((1 - u) / 0.25, 0, 1)
    return norm(st(v * e), 0.55)


def effort(dur=0.25, seed=None):
    v = voice([150, 175, 140], [(600, 110, 1.0), (1150, 160, 0.6), (2500, 300, 0.2)], dur, breath=0.6, voiced=0.5, seed=seed)
    u = _t(len(v)) / dur
    return norm(st(v * np.clip(u / 0.05, 0, 1) * np.exp(-u * 4)), 0.55)


def sleep_breath(dur=2.2, seed=None):
    n = n_of(dur); t = _t(n)
    x = bp(noise(n, 'pink', seed), 250, 1400)
    e = (0.5 - 0.5 * np.cos(2 * np.pi * t / 2.0)) ** 2
    return norm(st(x * e), 0.4)


def sip(seed=None):
    n = n_of(0.35); t = _t(n)
    x = bp(noise(n, seed=seed), 700, 3500) * (0.5 + 0.5 * np.sin(2 * np.pi * 38 * t)) * np.sin(np.pi * t / 0.35)
    g = thump(300, 0.08, 40)
    y = np.zeros(n_of(0.5)); y[:n] += x; i = int(0.38 * SR); addat(y, g * 0.5, i)
    return norm(st(y), 0.5)


def drop_plip():
    return norm(st(blip(1100, 2600, 0.07, decay=45)), 0.4)


# ───────── transiciones / movimiento ─────────
def whip(dir_=1, seed=None):
    return whoosh(0.3, 260, 3200, 700, q=1.4, pan0=-0.7 * dir_, pan1=0.7 * dir_, seed=seed, shape=1.2)


def zoom_whoosh(seed=None):
    w = whoosh(0.5, 200, 6000, None, q=1.0, seed=seed, shape=0.8)
    n = w.shape[1]; u = np.linspace(0, 1, n)
    w *= u ** 1.5 * 1.5
    return norm(w, 0.7)


def shimmer(dur=0.9, seed=None):
    n = n_of(dur); t = _t(n)
    x = hp(noise(n, seed=seed), 6000) * np.exp(-t * 5) * 0.4
    b = ring([2093, 3136, 4186, 5274], dur, [5, 6, 7, 8], [1, 0.7, 0.5, 0.35]) * 0.5
    return norm(widen(x + b, 0.8) + sparkle(dur, 25, seed=seed) * 0.4, 0.6)


def flash_hit(seed=None):
    k = kick(0.8, 1.1, 0.35)
    s = shimmer(0.7, seed)
    y = np.zeros((2, s.shape[1])); place(y, st(k) * 0.6, 0); y += s * 0.6
    return norm(y, 0.7)


def ripple_(seed=None):
    b = blip(500, 1400, 0.25, decay=10)
    s = shimmer(0.6, seed)
    y = np.zeros((2, max(len(b), s.shape[1]))); place(y, st(b), 0); place(y, s * 0.5, 0.05)
    return norm(y, 0.6)


def soft_swell(dur=0.6, seed=None):
    r = reverse_cymbal(dur, seed=seed)
    return norm(lp(r, 5000), 0.5)


def whistle_fall(dur=0.33, seed=None):
    n = n_of(dur); t = _t(n); u = t / dur
    f = 1500 * (380 / 1500) ** u
    x = np.sin(phase_of(f)) * 0.5 + bp(noise(n, seed=seed), 800, 4000) * 0.4
    return norm(st(x * np.sin(np.pi * u) ** 0.8), 0.5)


# ───────── dinero / impactos ─────────
def register_thud(pitch=1.0, seed=None):
    n = n_of(1.1); t = _t(n)
    low = np.sin(phase_of(62 * pitch * (1 + 1.5 * np.exp(-t * 30)))) * np.exp(-t * 6)
    body = bp(noise(n, seed=seed), 180, 900) * np.exp(-t * 18) * 0.6
    mech = click_(seed=seed, f1=1500, f2=5000, dur=0.03, level=0.8)
    bellx = ring([1320 * pitch * 0.97, 1320 * pitch * 1.52, 1320 * pitch * 2.31], 1.0, [4, 6, 9], [0.4, 0.2, 0.1])
    x = low * 1.1 + body
    addat(x, mech, 0)
    i = int(0.03 * SR); addat(x, bellx, i)
    return norm(st(softclip(x, 1.2)), 0.8)


def cha_ching(seed=None):
    n = n_of(1.6); t = _t(n)
    ka = click_(seed=seed, f1=900, f2=5000, dur=0.04, level=1.0)
    drawer = bp(noise(n_of(0.18), seed=seed), 300, 2500) * np.exp(-_t(n_of(0.18)) * 20) * 0.6
    ching = ring([2637, 3322, 3951, 5274, 6645], 1.5, [2.5, 3, 3.5, 4, 5], [1, 0.8, 0.6, 0.4, 0.3])
    x = np.zeros(n); addat(x, ka, 0); addat(x, drawer, 0)
    i = int(0.09 * SR); addat(x, ching * 0.7, i)
    coins = sparkle(0.8, 40, 4000, 10000, seed=seed)
    y = widen(x, 0.3); place(y, coins * 0.35, 0.12)
    return norm(y, 0.8)


def coin_up():
    x = two_tone(1976, 2637, 0.07, 8, 0.8)
    return norm(x + sparkle(0.8, 20, seed=5)[:, :x.shape[1]] * 0.3, 0.6)


def stamp(seed=None):
    th = thump(110, 0.18, 22)
    sl = bp(noise(n_of(0.08), seed=seed), 500, 4000) * np.exp(-_t(n_of(0.08)) * 60)
    x = np.zeros(len(th)); x += th; addat(x, sl * 0.8, 0)
    return norm(st(x), 0.7)


def counter_down(dur=0.45):
    x = np.zeros((2, n_of(dur + 0.1))); k = 0; t = 0.0
    while t < dur:
        f = 2400 - 1400 * t / dur
        place(x, st(blip(f, f, 0.03, decay=90)), t, 0.6)
        t += 0.03 + 0.05 * (t / dur) ** 2; k += 1
    return norm(x, 0.5)


def tick_row(pitch=1.0):
    c = click_(seed=int(pitch * 50), f1=2000, f2=7000, dur=0.01, level=0.8)
    m = marimba(880 * pitch, 0.35, 0.9)
    x = np.zeros(len(m)); x += m; addat(x, c, 0)
    return norm(st(x), 0.6)


# ───────── mascota / hologramas ─────────
def fm_chirp(f0, f1, dur=0.18, ratio=2.0, idx=2.0):
    n = n_of(dur); t = _t(n); u = t / dur
    f = f0 * (f1 / f0) ** u
    x = np.sin(phase_of(f) + idx * np.exp(-u * 3) * np.sin(phase_of(f * ratio)))
    return x * np.sin(np.pi * u) ** 0.6


def visor_blip():
    x = np.zeros(n_of(0.35))
    for f0, f1, t0 in [(900, 1600, 0), (1200, 2200, 0.1)]:
        c = fm_chirp(f0, f1, 0.12, 1.5, 1.5); i = int(t0 * SR); x[i:i + len(c)] += c
    return norm(st(x), 0.5)


def mascot_in(seed=None):
    b = fm_chirp(300, 1200, 0.35, 2.0, 2.5)
    y = st(b); s = sparkle(0.5, 30, seed=seed); z = np.zeros((2, max(y.shape[1], s.shape[1]))); place(z, y, 0); place(z, s * 0.4, 0.1)
    return norm(z, 0.6)


def mascot_fly(seed=None):
    w = whoosh(0.9, 250, 4000, 900, q=1.2, pan0=-0.8, pan1=0.2, seed=seed)
    c = fm_chirp(400, 1400, 0.8, 2.0, 1.5) * 0.4
    s = sparkle(0.9, 35, seed=seed)
    y = w.copy(); place(y, st(c), 0); place(y, s * 0.35, 0.1)
    return norm(y, 0.7)


def mascot_spin(seed=None):
    n = n_of(0.9); t = _t(n)
    w = whoosh(0.9, 300, 3000, 1200, q=1.5, seed=seed)
    w *= (0.6 + 0.4 * np.sin(2 * np.pi * 9 * t))
    c = fm_chirp(500, 1800, 0.8, 2.0, 1.2) * 0.35
    y = w.copy(); place(y, st(c), 0.05)
    return norm(y, 0.6)


def wink():
    b = blip(1200, 2600, 0.12, decay=18)
    r = ring([2637, 3951], 0.6, [6, 8], [0.6, 0.3])
    x = np.zeros(len(r)); addat(x, b, 0); x += r * 0.6
    return norm(st(x), 0.5)


def holo_open(seed=None):
    n = n_of(0.45); t = _t(n); u = t / 0.45
    nb = (n + 63) // 64
    s = sweep(saw(220 * 2 ** (u * 1.5), None), 'bp', 0, 0, q=3, fpath=(400 * (3500 / 400) ** u)[::64][:nb])
    x = st(s * np.sin(np.pi * u) ** 0.5)
    place(x, sparkle(0.4, 30, seed=seed) * 0.4, 0.1)
    return norm(x, 0.55)


def scan(dur=2.0, seed=None):
    n = n_of(dur); t = _t(n)
    f = 1400 + 500 * np.sin(2 * np.pi * 0.9 * t) + 60 * np.sin(2 * np.pi * 38 * t)
    tone = np.sin(phase_of(f)) * 0.3
    nz = bp(noise(n, seed=seed), 2500, 7000) * (0.5 + 0.5 * np.sin(2 * np.pi * 14 * t)) * 0.2
    e = np.clip(t / 0.1, 0, 1) * np.clip((dur - t) / 0.2, 0, 1)
    return norm(pan_move((tone + nz) * e, -0.6, 0.6), 0.45)


def pulse_zap(seed=None):
    n = n_of(0.3); t = _t(n); u = t / 0.3
    f = 1500 * (250 / 1500) ** u
    x = lp(saw(f, None), 3500) * 0.5 + bp(noise(n, seed=seed), 2000, 8000) * 0.3
    return norm(st(x * np.exp(-u * 3) * (1 - np.exp(-t * 800))), 0.55)


def data_whoosh(seed=None):
    w = whoosh(0.45, 400, 5000, None, q=1.6, seed=seed, pan0=-0.5, pan1=0.5)
    s = sparkle(0.45, 50, 3000, 9000, seed=seed)
    return norm(w + s[:, :w.shape[1]] * 0.4, 0.6)


# ───────── mundo físico ─────────
def printer(dur=1.0, seed=None):
    n = n_of(dur); t = _t(n)
    step = (np.sin(2 * np.pi * 22 * t) > 0).astype(float)
    rasp = bp(noise(n, seed=seed), 2000, 7000) * (0.4 + 0.6 * step)
    motor = np.sin(phase_of(1150 + 30 * np.sin(2 * np.pi * 3 * t), None)) * 0.12 + square(55, n) * 0.05
    e = np.clip(t / 0.03, 0, 1) * np.clip((dur - t) / 0.05, 0, 1)
    return norm(st((rasp * 0.7 + lp(motor, 2500)) * e), 0.55)


def scanner_beep():
    n = n_of(0.14); t = _t(n)
    x = (np.sin(phase_of(2400, n)) * 0.8 + square(2400, n) * 0.1) * np.clip(t / 0.004, 0, 1) * np.clip((0.14 - t) / 0.01, 0, 1)
    return norm(st(x), 0.5)


def beep_confirm():
    x = np.zeros(n_of(0.3))
    for f, t0 in [(1400, 0), (2100, 0.11)]:
        n = n_of(0.09); b = np.sin(phase_of(f, n)) * np.clip(_t(n) / 0.004, 0, 1) * np.clip((0.09 - _t(n)) / 0.01, 0, 1)
        i = int(t0 * SR); addat(x, b, i)
    return norm(st(x), 0.5)


def doorbell():
    x = np.zeros(n_of(1.9))
    for f, t0 in [(659.3, 0), (523.3, 0.55)]:
        b = ring([f, f * 2.76, f * 5.4], 1.3, [2.2, 5, 9], [1, 0.3, 0.1]); i = int(t0 * SR); addat(x, b, i)
    return norm(st(x), 0.6)


def door_open(seed=None):
    n = n_of(0.9); t = _t(n); u = t / 0.9
    latch = click_(seed=seed, f1=800, f2=4000, dur=0.03, level=1.0)
    nb = (n + 63) // 64
    creak = sweep(noise(n, seed=seed) * (0.5 + 0.5 * np.sin(2 * np.pi * 26 * t)), 'bp', 0, 0, q=9, fpath=(320 * (650 / 320) ** u)[::64][:nb])
    x = creak * np.sin(np.pi * u) * 0.6; addat(x, latch, 0)
    return norm(st(x), 0.55)


def cardboard(heavy=False, seed=None):
    th = thump(90 if heavy else 130, 0.25, 18)
    rs = bp(noise(n_of(0.3), seed=seed), 300, 2500) * np.exp(-_t(n_of(0.3)) * 14)
    x = np.zeros(max(len(th), len(rs))); addat(x, th, 0); addat(x, rs * 0.5, 0)
    if heavy:
        cl = ring([410, 693, 1270], 0.4, [12, 16, 22], [0.4, 0.25, 0.15]); addat(x, cl, 0)
    return norm(st(x), 0.7)


def suspension(seed=None):
    n = n_of(0.8); t = _t(n)
    boing = np.sin(phase_of(85 + 8 * np.sin(2 * np.pi * 7 * t))) * np.exp(-t * 5)
    creak = reson(noise(n, seed=seed), 520, 12) * np.exp(-t * 8) * 0.3
    return norm(st(boing + creak), 0.55)


def metal_door(seed=None):
    n = n_of(1.4); t = _t(n)
    imp = thump(70, 0.4, 10) * 1.2
    metal = ring([221, 347, 512, 781, 1133, 1670], 1.3, [4, 5, 6, 8, 10, 12], [1, 0.8, 0.6, 0.5, 0.35, 0.25])
    rat = bp(noise(n, seed=seed), 400, 3000) * np.exp(-t * 12) * 0.5
    x = rat; addat(x, imp, 0); addat(x, metal * 0.5, 0)
    return norm(st(softclip(x, 1.3)), 0.8)


def engine(dur=4.0, rpm0=1.0, rpm1=1.0, seed=None):
    n = n_of(dur); t = _t(n); u = t / dur
    fire = 38 * (rpm0 + (rpm1 - rpm0) * u) * (1 + 0.01 * np.sin(2 * np.pi * 0.7 * t))
    ph = phase_of(fire)
    x = sum(np.sin(ph * k + k) / k ** 0.8 for k in range(1, 9))
    x *= 1 + 0.2 * np.sin(ph * 0.5)
    x = lp(x, 500) + lp(noise(n, 'brown', seed), 300) * 0.8
    tires = bp(noise(n, 'pink', seed), 300, 1500) * 0.15
    return norm(st(x * 0.8 + tires), 0.6)


def wind(dur=4.0, seed=None):
    n = n_of(dur); t = _t(n)
    nz = noise(n, 'pink', seed)
    nb = (n + 63) // 64
    fp = 700 + 400 * np.sin(2 * np.pi * 0.23 * t[::64][:nb]) + 200 * np.sin(2 * np.pi * 0.61 * t[::64][:nb])
    x = sweep(nz, 'bp', 0, 0, q=0.7, fpath=fp)
    return norm(widen(x, 0.8), 0.45)


def air_brake(seed=None):
    n = n_of(0.7); t = _t(n)
    x = hp(noise(n, seed=seed), 2500) * np.clip(t / 0.01, 0, 1) * np.exp(-t * 4.5)
    return norm(st(x), 0.5)


def brake(seed=None):
    n = n_of(0.5); t = _t(n)
    sq = np.sin(phase_of(1750 + 60 * np.sin(2 * np.pi * 11 * t))) * np.sin(np.pi * t / 0.5) * 0.4
    return norm(st(sq + hp(noise(n, seed=seed), 2500) * np.exp(-t * 6) * 0.3), 0.45)


def step(seed=None):
    th = thump(95, 0.08, 45)
    sc = bp(noise(n_of(0.06), seed=seed), 400, 2500) * np.exp(-_t(n_of(0.06)) * 60)
    x = np.zeros(len(th)); x += th; addat(x, sc * 0.5, 0)
    return norm(st(x), 0.5)


def confetti(dur=2.4, seed=None):
    r = rng(seed); x = np.zeros((2, n_of(dur)))
    t = 0.0
    while t < dur:
        c = hp(noise(n_of(0.012), seed=int(r.integers(1e6))), 3000) * np.exp(-_t(n_of(0.012)) * 400)
        place(x, pan(c, r.uniform(-0.9, 0.9)), t, r.uniform(0.2, 1.0) * (1 - t / dur) ** 0.5)
        t += r.uniform(0.006, 0.03) + t * 0.01
    return norm(x, 0.35)


def birds(dur=4.0, seed=None, density=1.2):
    r = rng(seed); x = np.zeros((2, n_of(dur)))
    t = r.uniform(0, 0.5)
    while t < dur - 0.3:
        k = r.integers(2, 5); f0 = r.uniform(2800, 4200); p = r.uniform(-0.8, 0.8)
        for j in range(k):
            n = n_of(0.07); u = _t(n) / 0.07
            c = np.sin(phase_of(f0 * (1 + 0.35 * np.sin(np.pi * u)))) * np.sin(np.pi * u)
            place(x, pan(c, p), t + j * 0.09, 0.4)
        t += r.uniform(0.6, 1.4) / density
    return x


def room_tone(dur, kind='night', seed=None):
    n = n_of(dur); t = _t(n)
    base = lp(noise(n, 'brown', seed), 250) * 0.6
    x = widen(base, 0.5)
    if kind == 'night':
        # grillos lejanos
        ch = np.sin(phase_of(4300, n)) * (np.sin(2 * np.pi * 29 * t) > 0.3) * (np.sin(2 * np.pi * 0.9 * t) > -0.2) * 0.05
        x += pan(ch, 0.5) + pan(np.sin(phase_of(60, n)) * 0.03, 0)
    elif kind in ('morning', 'day', 'street'):
        x += birds(dur, seed, 0.8 if kind != 'street' else 0.5) * (0.6 if kind == 'morning' else 0.35)
        if kind == 'street':
            x += widen(bp(noise(n, 'pink', seed), 200, 1200) * 0.15, 0.6)
    e = np.clip(t / 0.3, 0, 1) * np.clip((dur - t) / 0.3, 0, 1)
    return norm(x * e, 0.4)


def final_hit(seed=None):
    k = kick(1.0, 0.85, 0.9)
    y = crash(1.0, 3.0, seed=seed) * 0.7
    place(y, st(sub_hit(2.5, 90, 28, 1.0)), 0, 0.9); place(y, st(k), 0, 0.9)
    return norm(y, 0.9)


def boom_low(seed=None):
    y = st(sub_hit(2.5, 75, 24, 1.0))
    place(y, st(lp(noise(n_of(0.6), 'brown', seed), 200) * np.exp(-_t(n_of(0.6)) * 6)), 0, 0.8)
    return norm(y, 0.9)


def flash_boom(seed=None):
    y = st(sub_hit(1.4, 90, 35, 1.0)) * 0.8
    place(y, zoom_whoosh(seed)[:, ::-1] * 0.0, 0)
    place(y, shimmer(1.0, seed) * 0.7, 0)
    return norm(y, 0.8)


def chime_up():
    x = np.zeros((2, n_of(2.2)))
    for i, m in enumerate([72, 76, 79, 84, 88]):
        f = 440 * 2 ** ((m - 69) / 12)
        place(x, pan(bell(f, 1.8, 0.8), -0.5 + i * 0.25), i * 0.07)
    place(x, sparkle(1.2, 30, seed=2) * 0.3, 0.2)
    return norm(x, 0.7)


def brand_chime():
    x = np.zeros((2, n_of(3.5)))
    for i, m in enumerate([72, 79, 84, 88, 91]):
        f = 440 * 2 ** ((m - 69) / 12)
        place(x, pan(bell(f, 3.0, 0.9, ratio=2.0 + 0.5 * i), -0.4 + i * 0.2), i * 0.06)
        place(x, pan(marimba(f / 2, 1.0, 0.7), 0), i * 0.06, 0.4)
    place(x, shimmer(2.0, 8) * 0.5, 0.15)
    return norm(x, 0.8)


def thanks_chime():
    x = np.zeros((2, n_of(1.2)))
    for i, m in enumerate([76, 81]):
        place(x, st(marimba(440 * 2 ** ((m - 69) / 12), 0.6, 0.8)), i * 0.14)
    return norm(x, 0.5)


def processing(dur=0.6):
    n = n_of(dur); t = _t(n)
    x = np.sin(phase_of(660, n)) * (0.5 + 0.5 * np.sin(2 * np.pi * 10 * t)) * 0.3
    for k in range(int(dur / 0.1)):
        c = click_(seed=k, f1=3000, f2=8000, dur=0.006, level=0.4); i = int(k * 0.1 * SR); x[i:i + len(c)] += c
    return norm(st(lp(x, 4000)), 0.35)


def typing_dots(dur=0.5):
    x = np.zeros((2, n_of(dur + 0.1))); t = 0.0; k = 0
    while t < dur:
        place(x, st(blip(1500 + 200 * (k % 3), 1600 + 200 * (k % 3), 0.04, decay=80)), t, 0.5)
        t += 0.12; k += 1
    return norm(x, 0.35)


def num_hit():
    n = n_of(0.3); t = _t(n)
    w = np.sin(phase_of(95 * (1 + np.exp(-t * 25)))) * np.exp(-t * 12)
    c = click_(seed=3, f1=2000, f2=8000, dur=0.01, level=0.5)
    addat(w, c, 0)
    return norm(st(w), 0.7)


def freeze_hit(seed=None):
    # "tape stop" muy corto que desemboca en el silencio
    n = n_of(0.28); t = _t(n); u = t / 0.28
    f = 700 * (60 / 700) ** u
    x = lp(saw(f, None), 2000) * (1 - u) ** 0.6 * 0.4 + bp(noise(n, seed=seed), 300, 3000) * np.exp(-t * 20) * 0.3
    c = click_(seed=seed, f1=1000, f2=6000, dur=0.02, level=1.0)
    addat(x, c, max(0, len(x) - len(c)))
    return norm(st(x), 0.6)


# ───────── catálogo de cues ─────────
def make(name, o):
    p = o.get('pitch', 1.0); dur = o.get('dur', None); seed = abs(hash((name, round(o.get('t', 0), 3)))) % (2 ** 31)
    d = o.get('dir', 1) or 1
    M = {
        'room_night': lambda: room_tone(dur or 5, 'night', seed),
        'morning_amb': lambda: room_tone(dur or 4, 'morning', seed),
        'day_amb': lambda: room_tone(dur or 4, 'day', seed),
        'street_amb': lambda: room_tone(dur or 5, 'street', seed),
        'breath_tired': lambda: sigh(1.0, True, seed),
        'sigh': lambda: sigh(0.85, False, seed),
        'breath_relief': lambda: np.concatenate([inhale(0.5, seed), sigh(1.1, True, seed + 1)], axis=1),
        'sleep_breath': lambda: sleep_breath(dur or 2.2, seed),
        'yawn': lambda: yawn(1.3, seed),
        'startle': lambda: inhale(0.22, seed),
        'surprise_gasp': lambda: inhale(0.35, seed),
        'effort': lambda: effort(0.25, seed),
        'mm_happy': lambda: hum_mm(0.42),
        'gracias': lambda: thanks_chime(),
        'sip': lambda: sip(seed),
        'sweat': lambda: drop_plip(),
        'vibrate': lambda: vibrate(0.36, False, seed),
        'vibrate_soft': lambda: vibrate(0.5, True, seed),
        'notif': lambda: notif(p),
        'notif_soft': lambda: notif(p * 0.9, True),
        'msg_in': lambda: msg_in(p),
        'img_ding': lambda: msg_in(0.85 * p),
        'wa_ding': lambda: two_tone(1568 * p, 2093 * p, 0.08, 9),
        'ding_ui': lambda: two_tone(1568, 2093, 0.06, 14, 0.5),
        'soft_ding': lambda: lp(two_tone(1175, 1568, 0.1, 6, 1.0), 5000),
        'ping': lambda: st(bell(1760 * p, 0.9, 0.8)) * 1.5,
        'ping_soft': lambda: st(lp(bell(1568 * p, 0.8, 0.6), 4000)) * 1.3,
        'meta_ping': lambda: two_tone(1318 * p, 1976 * p, 0.07, 7, 0.9),
        'chip_pop': lambda: pop_(1.4 * p),
        'pop': lambda: pop_(p, big=True),
        'reply_pop': lambda: pop_(1.1 * p, big=True),
        'tap_pop': lambda: tap('pop', seed),
        'tap_soft': lambda: tap('soft', seed),
        'tap_firm': lambda: tap('firm', seed),
        'click': lambda: mouse_click(seed),
        'state_click': lambda: mouse_click(seed) + st(np.pad(blip(1600, 2000, 0.08, decay=40), (0, max(0, n_of(0.06) - n_of(0.08)))))[:, :n_of(0.06)] * 0.3,
        'keyboard': lambda: keyboard(dur or 0.6, seed),
        'phone_type': lambda: keyboard(dur or 0.5, seed, (0.08, 0.14), soft=True) * 0.7,
        'keypad': lambda: keyboard(dur or 1.0, seed, (0.1, 0.18), soft=True) * 0.6,
        'enter_key': lambda: enter_key(),
        'copy_paste': lambda: np.concatenate([keyboard(0.1, seed, (0.05, 0.06)), keyboard(0.1, seed + 1, (0.05, 0.06))], axis=1),
        'send': lambda: whoosh(0.22, 900, 5000, None, q=1.3, seed=seed, pan0=-0.2, pan1=0.4),
        'error': lambda: error_(),
        'refresh': lambda: whoosh(0.18, 1500, 4000, 2000, q=1.5, seed=seed),
        'cell_fill': lambda: st(blip(900, 1300, 0.12, decay=25)) * 0.8,
        'thumb_scroll': lambda: swipe(0.18, seed, True),
        'swipe': lambda: swipe(0.22, seed),
        'pinch': lambda: np.concatenate([swipe(0.12, seed, True), swipe(0.12, seed + 1, True)], axis=1),
        'typing_dots': lambda: typing_dots(dur or 0.5),
        'processing': lambda: processing(dur or 0.6),
        'success_tick': lambda: two_tone(1047, 1568, 0.08, 8, 0.8),
        'lock': lambda: np.concatenate([mouse_click(seed), st(ring([3200, 4800], 0.25, [20, 30], [0.4, 0.2]))], axis=1),
        'num_hit': lambda: num_hit(),
        'beep_confirm': lambda: beep_confirm(),
        'scanner_beep': lambda: scanner_beep(),
        'bip': lambda: st(blip(1800 * p, 1800 * p, 0.07, decay=50)) * 0.8,
        'tick_row': lambda: tick_row(p),
        'counter_down': lambda: counter_down(dur or 0.45),
        'coin_up': lambda: coin_up(),
        'cha_ching': lambda: cha_ching(seed),
        'register_thud': lambda: register_thud(p, seed),
        'stamp': lambda: stamp(seed),
        'printer': lambda: printer(dur or 1.0, seed),
        'slap_stick': lambda: cardboard(False, seed),
        'card_in': lambda: whoosh(0.3, 400, 2500, 800, q=1.2, seed=seed, pan0=-0.5, pan1=-0.2),
        'data_whoosh': lambda: data_whoosh(seed),
        'pulse_zap': lambda: pulse_zap(seed),
        'visor_flash': lambda: shimmer(0.5, seed) * 0.8,
        'visor_blip': lambda: visor_blip(),
        'visor_zoom': lambda: zoom_whoosh(seed)[:, ::-1] * 0.8,
        'mascot_in': lambda: mascot_in(seed),
        'mascot_spin': lambda: mascot_spin(seed),
        'mascot_fly': lambda: mascot_fly(seed),
        'wink': lambda: wink(),
        'holo_open': lambda: holo_open(seed),
        'scan': lambda: scan(dur or 2.0, seed),
        'bubble_travel': lambda: whoosh(0.4, 600, 3000, None, q=1.5, seed=seed, pan0=0.6, pan1=0.0) * 0.7 + sparkle(0.4, 25, seed=seed) * 0.3,
        'merge_whoosh': lambda: whoosh(0.4, 300, 2500, None, q=1.2, seed=seed, pan0=-0.8, pan1=0.0) + whoosh(0.4, 320, 2600, None, q=1.2, seed=seed + 1, pan0=0.8, pan1=0.0),
        'fly_out': lambda: whoosh(0.4, 500, 4000, None, q=1.3, seed=seed, pan0=0.0, pan1=0.9 * np.sign(o.get('pan', 1) or 1)),
        'status_whoosh': lambda: whoosh(0.35, 500, 3000, 1000, q=1.3, seed=seed) * 0.7 + two_tone(1760 * p, 2349 * p, 0.06, 12, 0.35)[:, :n_of(0.35)] * 0.4,
        'whip': lambda: whip(d, seed),
        'sheet_up': lambda: whoosh(0.5, 250, 2600, None, q=0.9, seed=seed, shape=1.0) * 0.8,
        'zoom_whoosh': lambda: zoom_whoosh(seed),
        'flash_shimmer': lambda: shimmer(0.9, seed),
        'flash_hit': lambda: flash_hit(seed),
        'trail_whoosh': lambda: whoosh(0.55, 250, 3500, 900, q=1.2, seed=seed, pan0=-0.9, pan1=0.9) + sparkle(0.55, 40, seed=seed) * 0.35,
        'ripple': lambda: ripple_(seed),
        'soft_swell': lambda: soft_swell(0.5, seed),
        'whoosh_up': lambda: whoosh(0.5, 300, 5000, None, q=1.0, seed=seed),
        'celebrate_whoosh': lambda: whoosh(0.45, 400, 4000, 1500, q=1.2, seed=seed),
        'jump_whoosh': lambda: whoosh(0.3, 500, 2500, 900, q=1.5, seed=seed) * 0.8,
        'fall_whoosh': lambda: whistle_fall(0.33, seed),
        'land_thump': lambda: st(thump(100, 0.15, 25)) * 0.7,
        'confetti': lambda: confetti(dur or 2.4, seed),
        'drum_hit': lambda: norm(st(kick(1.0)) * 0.8 + np.pad(st(snare(1.0)), ((0, 0), (0, n_of(0.5) - n_of(0.32)))) * 0.7 + crash(0.8, 0.5, seed)[:, :n_of(0.5)], 0.8),
        'flash_boom': lambda: flash_boom(seed),
        'chime_up': lambda: chime_up(),
        'chime': lambda: two_tone(1047, 1319, 0.12, 4, 1.6),
        'brand_chime': lambda: brand_chime(),
        'final_hit': lambda: final_hit(seed),
        'boom_low': lambda: boom_low(seed),
        'freeze_hit': lambda: freeze_hit(seed),
        'riser': lambda: norm(__import__('instruments').riser(dur or 2.0, 1.0, seed=seed), 0.6),
        'truck_arrive': lambda: engine(dur or 1.3, 1.6, 0.8, seed) * np.linspace(1, 0.6, n_of(dur or 1.3)),
        'engine': lambda: engine(dur or 4.0, 1.25, 1.2, seed),
        'wind': lambda: wind(dur or 4.0, seed),
        'air_brake': lambda: air_brake(seed),
        'brake': lambda: brake(seed),
        'effort_': lambda: effort(0.25, seed),
        'box_load': lambda: cardboard(True, seed),
        'box_handoff': lambda: cardboard(False, seed),
        'suspension': lambda: suspension(seed),
        'metal_door': lambda: metal_door(seed),
        'step': lambda: step(seed),
        'doorbell': lambda: doorbell(),
        'door_open': lambda: door_open(seed),
    }
    if name not in M:
        return None
    x = M[name]()
    return st(np.asarray(x, dtype=float))
