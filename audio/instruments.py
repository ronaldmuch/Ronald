"""Instrumentos sintetizados para la música (todo procedural)."""
import numpy as np
from scipy import signal
from dsp import *


# ───────────── batería ─────────────
def kick(vel=1.0, tone=1.0, dur=0.5, seed=None):
    n = n_of(dur); t = np.arange(n) / SR
    f = 44 * tone + 120 * np.exp(-t * 38) + 30 * np.exp(-t * 9)
    body = np.sin(phase_of(f)) * np.exp(-t * 7.5)
    click = hp(noise(n, seed=seed), 2500) * np.exp(-t * 400) * 0.35
    x = softclip((body + click) * 1.4, 1.6) * vel
    return fade(x, 0.0005, 0.02)


def snare(vel=1.0, dur=0.32, seed=None):
    n = n_of(dur); t = np.arange(n) / SR
    body = (np.sin(phase_of(185 + 40 * np.exp(-t * 60))) * 0.6 + np.sin(phase_of(330, n)) * 0.25) * np.exp(-t * 22)
    nz = bp(noise(n, seed=seed), 1500, 9000) * np.exp(-t * 14)
    return fade((body + nz * 0.9) * vel * 0.8, 0.0005, 0.02)


def clap(vel=1.0, dur=0.45, seed=None):
    n = n_of(dur); t = np.arange(n) / SR
    nz = bp(noise(n, seed=seed), 900, 5200)
    e = np.zeros(n)
    for k, d in enumerate([0, 0.011, 0.021, 0.034]):
        i = int(d * SR); e[i:] += np.exp(-(t[:n - i]) * (160 if k < 3 else 16)) * (0.8 if k < 3 else 1.0)
    return fade(nz * e * vel * 0.7, 0.0003, 0.02)


def rim(vel=1.0, seed=None):
    n = n_of(0.08); t = np.arange(n) / SR
    x = reson(noise(n, seed=seed) * np.exp(-t * 300), 1700, 12) * 0.4 + np.sin(phase_of(820, n)) * np.exp(-t * 80) * 0.5
    return fade(x * vel, 0.0002, 0.01)


def hat(vel=1.0, open_=False, seed=None):
    dur = 0.38 if open_ else 0.06
    n = n_of(dur); t = np.arange(n) / SR
    x = hp(noise(n, seed=seed), 7000, 4)
    # color metálico
    m = sum(np.sign(np.sin(phase_of(f, n))) for f in (3120, 4260, 5410, 6120)) * 0.08
    x = x + hp(m, 6000)
    e = np.exp(-t * (9 if open_ else 70))
    return fade(x * e * vel * 0.35, 0.0003, 0.01)


def shaker(vel=1.0, seed=None):
    n = n_of(0.09); t = np.arange(n) / SR
    e = np.sin(np.pi * np.clip(t / 0.09, 0, 1)) ** 2
    return bp(noise(n, seed=seed), 5000, 11000) * e * vel * 0.25


def crash(vel=1.0, dur=2.6, seed=None):
    n = n_of(dur); t = np.arange(n) / SR
    x = hp(noise(n, seed=seed), 3500, 2)
    m = sum(np.sin(phase_of(f, n)) for f in (2873, 3654, 4981, 6327, 7110)) * 0.05
    e = np.exp(-t * 1.9) * (1 - np.exp(-t * 400))
    y = (x * 0.8 + hp(m, 2500)) * e * vel * 0.55
    return widen(y, 0.6)


def tom(freq=110, vel=1.0, dur=0.45):
    n = n_of(dur); t = np.arange(n) / SR
    f = freq * (1 + 0.6 * np.exp(-t * 25))
    return np.sin(phase_of(f)) * np.exp(-t * 7) * vel


def sub_hit(dur=2.0, f0=62, f1=28, vel=1.0):
    n = n_of(dur); t = np.arange(n) / SR
    f = f1 + (f0 - f1) * np.exp(-t * 3)
    return np.sin(phase_of(f)) * np.exp(-t * 1.6) * (1 - np.exp(-t * 300)) * vel


def reverse_cymbal(dur=1.2, seed=None):
    c = crash(1.0, dur + 0.3, seed=seed)[:, :n_of(dur)]
    return c[:, ::-1] * np.linspace(0, 1, c.shape[1]) ** 1.5


# ───────────── tonales ─────────────
def bass(freq, dur, vel=1.0, cutoff=900, bright=1.0):
    n = n_of(dur + 0.08); t = np.arange(n) / SR
    x = saw(freq, n) * 0.55 + np.sin(phase_of(freq, n)) * 0.9 + square(freq * 0.5, n) * 0.0
    fpath_n = (n + 63) // 64
    tb = np.arange(fpath_n) * 64 / SR
    fp = cutoff * 0.45 + cutoff * bright * 1.4 * np.exp(-tb * 9)
    y = sweep(x, 'lp', 0, 0, q=0.9, fpath=fp)
    e = env_adsr(n, 0.004, 0.25, 0.55, 0.06, hold=dur)
    return softclip(y * e * vel * 0.9, 1.3)


def epiano(freq, dur, vel=1.0):
    """Piano eléctrico FM (tipo Rhodes)."""
    n = n_of(dur + 0.9); t = np.arange(n) / SR
    idx = (1.6 * vel + 0.3) * np.exp(-t * 3.2) + 0.25
    mod = np.sin(phase_of(freq, n))
    car = np.sin(phase_of(freq, n) + idx * mod)
    tine = np.sin(phase_of(freq * 14.0, n)) * np.exp(-t * 55) * 0.18 * vel
    trem = 1 + 0.05 * np.sin(2 * np.pi * 4.5 * t)
    e = env_adsr(n, 0.003, 1.3, 0.35, 0.35, hold=dur)
    return (car + tine) * e * trem * vel * 0.4


def marimba(freq, dur=0.6, vel=1.0):
    n = n_of(max(dur, 0.5) + 0.3); t = np.arange(n) / SR
    x = (np.sin(phase_of(freq, n)) * np.exp(-t * 5.5)
         + 0.32 * np.sin(phase_of(freq * 3.93, n)) * np.exp(-t * 16)
         + 0.1 * np.sin(phase_of(freq * 9.2, n)) * np.exp(-t * 40))
    click = bp(noise(n, seed=int(freq)), freq * 2, min(freq * 6, 16000)) * np.exp(-t * 500) * 0.25
    return fade((x + click) * vel * 0.55, 0.0008, 0.03)


def bell(freq, dur=2.5, vel=1.0, ratio=3.5):
    n = n_of(dur); t = np.arange(n) / SR
    idx = 2.2 * np.exp(-t * 2.5) + 0.4
    mod = np.sin(phase_of(freq * ratio, n))
    x = np.sin(phase_of(freq, n) + idx * mod) * np.exp(-t * 1.6)
    x += 0.25 * np.sin(phase_of(freq * 2.01, n)) * np.exp(-t * 3)
    return fade(x * vel * 0.35, 0.001, 0.05)


def pluck(freq, dur=0.6, vel=1.0, bright=0.6, seed=None):
    """Karplus-Strong vectorizado (comb IIR)."""
    n = n_of(dur)
    N = max(2, int(round(SR / freq)))
    exc = lp(noise(N, seed=seed), 1500 + 9000 * bright)
    x = np.zeros(n); x[:N] = exc
    g = 0.996
    a = np.zeros(N + 2); a[0] = 1; a[N] = -g * 0.5; a[N + 1] = -g * 0.5
    y = signal.lfilter([1], a, x)
    t = np.arange(n) / SR
    return fade(y * np.exp(-t * 2.2) * vel * 0.5, 0.0005, 0.03)


def pad(freqs, dur, vel=1.0, cutoff=1800, attack=0.6, release=1.2, detune=0.012, seed=0):
    n = n_of(dur + release); t = np.arange(n) / SR
    L = np.zeros(n); R = np.zeros(n)
    r = rng(seed)
    for f in freqs:
        for k, d in enumerate((-detune, 0, detune)):
            ph = r.random()
            v = saw(f * (1 + d) * (1 + 0.0015 * np.sin(2 * np.pi * (0.3 + 0.1 * k) * t)), None, ph)
            if k == 0: L += v
            elif k == 2: R += v
            else: L += v * 0.7; R += v * 0.7
    e = env_adsr(n, attack, 1.5, 0.85, release, hold=dur)
    fl = cutoff * (1 + 0.15 * np.sin(2 * np.pi * 0.12 * t))
    L = lp(L, cutoff, 2); R = lp(R, cutoff, 2)
    y = np.stack([L, R]) * e * vel * 0.09 / max(1, len(freqs)) ** 0.5
    return y


def stab(freqs, vel=1.0, dur=0.35):
    """Stab de cuerdas/piano oscuro para los golpes del montaje."""
    n = n_of(dur + 0.4); t = np.arange(n) / SR
    x = np.zeros(n)
    for f in freqs:
        x += saw(f, n) * 0.5 + saw(f * 1.006, n) * 0.5 + np.sin(phase_of(f / 2, n)) * 0.4
    x = lp(x, 2200)
    e = np.exp(-t * 6) * (1 - np.exp(-t * 300))
    return x * e * vel * 0.18 / len(freqs) ** 0.5


def drone(freq, dur, vel=1.0, beat_hz=0.2):
    n = n_of(dur); t = np.arange(n) / SR
    x = np.sin(phase_of(freq, n)) + 0.5 * np.sin(phase_of(freq * 1.004, n)) + 0.25 * np.sin(phase_of(freq * 2, n)) + 0.15 * saw(freq, n)
    x = lp(x, 400)
    return x * vel * 0.4 * (0.85 + 0.15 * np.sin(2 * np.pi * beat_hz * t))


def riser(dur, vel=1.0, f0=300, f1=9000, seed=None):
    n = n_of(dur); t = np.arange(n) / SR
    u = t / dur
    nz = sweep(noise(n, seed=seed), 'bp', f0, f1, q=2.2)
    tone = saw(110 * 2 ** (u * 2.5), None) * 0.15 + saw(165 * 2 ** (u * 2.5), None) * 0.1
    tone = lp(tone, 4000)
    e = u ** 2.2
    return widen((nz * 0.6 + tone) * e * vel * 0.5, 0.5)
