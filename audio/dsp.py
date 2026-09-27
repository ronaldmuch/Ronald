"""Núcleo DSP: osciladores, filtros, envolventes, reverb y utilidades de mezcla (48 kHz, estéreo)."""
import numpy as np
from scipy import signal

SR = 48000
_rng = np.random.default_rng(1234)


def rng(seed=None):
    return np.random.default_rng(seed) if seed is not None else _rng


def n_of(dur):
    return max(1, int(round(dur * SR)))


def tt(dur):
    return np.arange(n_of(dur)) / SR


def mtof(m):
    return 440.0 * 2 ** ((np.asarray(m, dtype=float) - 69) / 12)


# ───────────── ruido ─────────────
def noise(n, color='white', seed=None):
    r = rng(seed)
    w = r.standard_normal(n)
    if color == 'pink':
        b = [0.049922035, -0.095993537, 0.050612699, -0.004408786]
        a = [1, -2.494956002, 2.017265875, -0.522189400]
        w = signal.lfilter(b, a, w) * 4.0
    elif color == 'brown':
        w = signal.lfilter([1], [1, -0.995], w) * 0.08
    return w


# ───────────── osciladores ─────────────
def phase_of(freq, n=None):
    if np.isscalar(freq):
        return 2 * np.pi * freq * np.arange(n) / SR
    return 2 * np.pi * np.cumsum(freq) / SR


def sine(freq, n=None, ph0=0.0):
    return np.sin(phase_of(freq, n) + ph0)


def _polyblep(t, dt):
    y = np.zeros_like(t)
    m = t < dt
    x = t[m] / dt[m]
    y[m] = x + x - x * x - 1
    m2 = t > 1 - dt
    x = (t[m2] - 1) / dt[m2]
    y[m2] = x * x + x + x + 1
    return y


def saw(freq, n=None, ph0=0.0):
    f = np.full(n, float(freq)) if np.isscalar(freq) else np.asarray(freq, float)
    dt = f / SR
    t = (np.cumsum(dt) + ph0) % 1.0
    return 2 * t - 1 - _polyblep(t, dt)


def square(freq, n=None, pw=0.5):
    f = np.full(n, float(freq)) if np.isscalar(freq) else np.asarray(freq, float)
    dt = f / SR
    t = np.cumsum(dt) % 1.0
    s = np.where(t < pw, 1.0, -1.0)
    s += _polyblep(t, dt)
    s -= _polyblep((t + 1 - pw) % 1.0, dt)
    return s


def tri(freq, n=None):
    s = square(freq, n)
    y = np.cumsum(s) * (4 * (freq if np.isscalar(freq) else np.mean(freq)) / SR)
    y = signal.lfilter([1, -1], [1, -0.999], y)
    return y / (np.max(np.abs(y)) + 1e-9)


# ───────────── envolventes ─────────────
def env_ad(n, a=0.005, d=0.3, curve=4.0):
    na = max(1, int(a * SR))
    e = np.ones(n)
    e[:na] = np.linspace(0, 1, na) if n >= na else np.linspace(0, 1, n)[:n]
    k = np.arange(n - na) / SR
    if n > na:
        e[na:] = np.exp(-k * curve / max(d, 1e-4))
    return e


def env_adsr(n, a, d, s, r, hold=None):
    """hold = duración total de la nota antes del release (s)."""
    hold = n / SR - r if hold is None else hold
    t = np.arange(n) / SR
    e = np.where(t < a, t / max(a, 1e-5), s + (1 - s) * np.exp(-(t - a) / max(d, 1e-4) * 3))
    rel = t > hold
    if np.any(rel):
        v = np.interp(hold, t, e)
        e[rel] = v * np.exp(-(t[rel] - hold) / max(r, 1e-4) * 4)
    return e


def fade(x, fin=0.002, fout=0.01):
    x = x.copy()
    n = x.shape[-1]
    a, b = min(n, int(fin * SR)), min(n, int(fout * SR))
    if a > 0:
        x[..., :a] *= np.linspace(0, 1, a)
    if b > 0:
        x[..., -b:] *= np.linspace(1, 0, b)
    return x


# ───────────── filtros ─────────────
def _sos(kind, f, order=2, q=None):
    ny = SR / 2
    if kind in ('low', 'high'):
        return signal.butter(order, min(0.999, max(1e-4, f / ny)), btype=kind, output='sos')
    f1, f2 = f
    return signal.butter(order, [max(1e-4, f1 / ny), min(0.999, f2 / ny)], btype='band', output='sos')


def lp(x, f, order=2):
    return signal.sosfilt(_sos('low', f, order), x, axis=-1)


def hp(x, f, order=2):
    return signal.sosfilt(_sos('high', f, order), x, axis=-1)


def bp(x, f1, f2, order=2):
    return signal.sosfilt(_sos('band', (f1, f2), order), x, axis=-1)


def biquad(kind, f, q=0.707, gain_db=0.0):
    A = 10 ** (gain_db / 40)
    w0 = 2 * np.pi * f / SR
    al = np.sin(w0) / (2 * q)
    c = np.cos(w0)
    if kind == 'bp':
        b = [al, 0, -al]; a = [1 + al, -2 * c, 1 - al]
    elif kind == 'lp':
        b = [(1 - c) / 2, 1 - c, (1 - c) / 2]; a = [1 + al, -2 * c, 1 - al]
    elif kind == 'hp':
        b = [(1 + c) / 2, -(1 + c), (1 + c) / 2]; a = [1 + al, -2 * c, 1 - al]
    elif kind == 'peak':
        b = [1 + al * A, -2 * c, 1 - al * A]; a = [1 + al / A, -2 * c, 1 - al / A]
    elif kind == 'lowshelf':
        sq = 2 * np.sqrt(A) * al
        b = [A * ((A + 1) - (A - 1) * c + sq), 2 * A * ((A - 1) - (A + 1) * c), A * ((A + 1) - (A - 1) * c - sq)]
        a = [(A + 1) + (A - 1) * c + sq, -2 * ((A - 1) + (A + 1) * c), (A + 1) + (A - 1) * c - sq]
    elif kind == 'highshelf':
        sq = 2 * np.sqrt(A) * al
        b = [A * ((A + 1) + (A - 1) * c + sq), -2 * A * ((A - 1) + (A + 1) * c), A * ((A + 1) + (A - 1) * c - sq)]
        a = [(A + 1) - (A - 1) * c + sq, 2 * ((A - 1) - (A + 1) * c), (A + 1) - (A - 1) * c - sq]
    else:
        raise ValueError(kind)
    b = np.array(b) / a[0]; a = np.array(a) / a[0]
    return b, a


def eq(x, kind, f, q=0.707, gain_db=0.0):
    b, a = biquad(kind, f, q, gain_db)
    return signal.lfilter(b, a, x, axis=-1)


def reson(x, f, q=8.0):
    b, a = biquad('bp', f, q)
    return signal.lfilter(b, a, x, axis=-1) * q ** 0.5


def sweep(x, kind, f0, f1, q=0.8, curve='exp', block=64, fpath=None):
    """Filtro de barrido (lp/hp/bp) con coeficientes por bloque."""
    n = len(x)
    y = np.zeros(n)
    zi = np.zeros(2)
    nb = (n + block - 1) // block
    if fpath is None:
        u = np.linspace(0, 1, nb)
        fpath = f0 * (f1 / f0) ** u if curve == 'exp' else f0 + (f1 - f0) * u
    for i in range(nb):
        s = slice(i * block, min(n, (i + 1) * block))
        f = float(np.clip(fpath[i], 20, SR * 0.45))
        b, a = biquad(kind, f, q)
        y[s], zi = signal.lfilter(b, a, x[s], zi=zi)
    return y


# ───────────── estéreo / mezcla ─────────────
def st(x):
    return np.stack([x, x]) if x.ndim == 1 else x


def pan(x, p=0.0):
    p = float(np.clip(p, -1, 1))
    th = (p + 1) * np.pi / 4
    x = x if x.ndim == 1 else x.mean(0)
    return np.stack([x * np.cos(th), x * np.sin(th)]) * np.sqrt(2)


def pan_move(x, p0, p1):
    x = x if x.ndim == 1 else x.mean(0)
    p = np.linspace(p0, p1, len(x))
    th = (p + 1) * np.pi / 4
    return np.stack([x * np.cos(th), x * np.sin(th)]) * np.sqrt(2)


def widen(x, amount=0.3, delay_ms=12):
    """Pseudo-estéreo (Haas + filtro complementario)."""
    x = x if x.ndim == 1 else x.mean(0)
    d = int(delay_ms * SR / 1000)
    xd = np.concatenate([np.zeros(d), x[:-d]]) if d > 0 else x
    side = (x - xd) * 0.5 * amount
    return np.stack([x + side, x - side])


def place(buf, x, t, gain=1.0):
    x = st(x)
    i = int(round(t * SR))
    if i >= buf.shape[1]:
        return
    j0 = max(0, -i)
    i0 = max(0, i)
    n = min(x.shape[1] - j0, buf.shape[1] - i0)
    if n > 0:
        buf[:, i0:i0 + n] += x[:, j0:j0 + n] * gain


def db(x):
    return 10 ** (x / 20)


def peak_norm(x, target_db=-1.0):
    m = np.max(np.abs(x)) + 1e-12
    return x * db(target_db) / m


def softclip(x, drive=1.0):
    return np.tanh(x * drive) / np.tanh(drive)


def smooth_env(x, att=0.005, rel=0.12):
    """Seguidor de envolvente con ataque/relajación distintos (vectorizado por bloques)."""
    a = np.abs(x if x.ndim == 1 else np.max(np.abs(x), axis=0))
    blk = 64
    nb = (len(a) + blk - 1) // blk
    pk = np.array([a[i * blk:(i + 1) * blk].max() for i in range(nb)])
    ca = np.exp(-blk / (att * SR)); cr = np.exp(-blk / (rel * SR))
    e = np.zeros(nb); v = 0.0
    for i in range(nb):
        c = ca if pk[i] > v else cr
        v = c * v + (1 - c) * pk[i]
        e[i] = v
    return np.repeat(e, blk)[:len(a)]


def compress(x, thresh_db=-18, ratio=3.0, att=0.004, rel=0.15, makeup_db=0.0, knee_db=6.0):
    env = smooth_env(x, att, rel)
    lvl = 20 * np.log10(env + 1e-9)
    over = lvl - thresh_db
    gr = np.where(over <= -knee_db / 2, 0.0,
                  np.where(over >= knee_db / 2, over * (1 - 1 / ratio),
                           (over + knee_db / 2) ** 2 / (2 * knee_db) * (1 - 1 / ratio)))
    g = db(-gr + makeup_db)
    return x * g


# ───────────── reverb ─────────────
def make_ir(dur=2.2, decay=2.0, bright=6000, pre=0.012, er=True, seed=5, damp=2500):
    n = n_of(dur)
    r = rng(seed)
    t = np.arange(n) / SR
    out = []
    for ch in range(2):
        w = r.standard_normal(n)
        env = np.exp(-t * 6.9 / decay)
        # amortiguación: cola más oscura con el tiempo
        a = lp(w, bright) * env
        b = lp(w, damp) * env
        mix = np.linspace(0, 1, n) ** 0.6
        irc = a * (1 - mix) + b * mix
        if er:
            for k in range(8):
                ti = int((pre + r.uniform(0.004, 0.06)) * SR)
                if ti < n:
                    irc[ti] += r.uniform(0.2, 0.6) * (1 if r.random() > 0.5 else -1)
        p = int(pre * SR)
        irc = np.concatenate([np.zeros(p), irc[:n - p]])
        out.append(irc)
    ir = np.array(out)
    return ir / np.sqrt(np.sum(ir ** 2) / 2)


def reverb(x, ir, wet=0.25, dry=1.0, hp_f=180):
    x = st(x)
    xin = hp(x, hp_f) if hp_f else x
    y = np.stack([signal.fftconvolve(xin[c], ir[c])[:x.shape[1]] for c in range(2)])
    return x * dry + y * wet


def pad_to(x, n):
    x = st(x)
    if x.shape[1] >= n:
        return x[:, :n]
    return np.concatenate([x, np.zeros((2, n - x.shape[1]))], axis=1)
