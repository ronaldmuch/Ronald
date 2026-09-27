"""Partitura original a 108 BPM, escrita contra el horario de tomas (los cortes caen en el beat).

ACTO 1 (beats 0–36)  El caos: pad oscuro en La menor, reloj, pulso de bajo, el tic-tac acelera de 1 a 2
                     golpes por beat en el montaje, stabs en cada corte, riser → silencio seco (congelado
                     de la toma 10) → golpe grave → drone de los gastos → negro.
ACTO 2 (beats 36–142) Urbby trabaja: DROP en Do mayor (C–G/B–Am–F), groove pop con bombo, palmas, hats,
                     bajo, piano eléctrico, marimba con el motivo de Urbby. En 14b baja un escalón.
ACTO 3 (beats 142–176) La vida nueva: medio tiempo, pads abiertos, sube en 26, crescendo en 27 y golpe
                     final + acorde de Do mayor que resuena en el cierre.
"""
import numpy as np
from dsp import *
from instruments import *

BPM = 108
B = 60 / BPM


def at(b):
    return b * B


# acordes: (bajo, voicing piano, voicing pad)
CH = {
    'Am': (33, [64, 69, 72], [45, 52, 60, 64]),
    'F': (29, [65, 69, 72], [41, 48, 57, 64]),
    'Dm': (38, [62, 65, 69], [38, 50, 57, 65]),
    'E': (28, [64, 68, 71], [40, 52, 56, 59]),
    'C': (36, [64, 67, 72], [48, 55, 64, 67]),
    'G/B': (35, [62, 67, 71], [47, 55, 62, 67]),
    'G': (31, [62, 67, 71], [43, 50, 59, 62]),
    'Em': (28, [64, 67, 71], [40, 52, 59, 67]),
    'Gsus': (31, [62, 67, 72], [43, 50, 60, 62]),
    'Cadd9': (36, [64, 67, 74], [48, 55, 62, 64, 67]),
}

# motivo de Urbby (marimba): (beat, nota, duración)
MOTIF = [(0, 67, .5), (.5, 72, .5), (1, 76, .75), (1.75, 74, .25), (2, 72, .5), (2.5, 74, .5), (3, 76, 1),
         (4, 74, .5), (4.5, 71, .5), (5, 67, .75), (5.75, 69, .25), (6, 71, .5), (6.5, 74, .5), (7, 79, 1),
         (8, 76, .5), (8.5, 72, .5), (9, 69, .75), (9.75, 71, .25), (10, 72, .5), (10.5, 76, .5), (11, 77, 1),
         (12, 76, .5), (12.5, 72, .5), (13, 69, 1), (14, 72, .5), (14.5, 74, .5), (15, 72, 1)]


def build(total):
    n = n_of(total)
    bus = {k: np.zeros((2, n)) for k in ('drums', 'bass', 'keys', 'lead', 'pad', 'fx', 'clock')}

    def put(name, x, b, g=1.0, p=0.0):
        x = pan(x, p) if x.ndim == 1 else x
        place(bus[name], x, at(b), g)

    # ═════════ ACTO 1 ═════════
    # reloj de pared: tic-tac (1 por beat → 2 por beat desde el beat 17), se corta en el congelado
    FREEZE = 25 + 1.28 / B          # la toma 10 se congela a 1.28 s
    b = 0.0; k = 0
    while b < FREEZE - 0.01:
        tick = rim(0.9 if k % 2 == 0 else 0.7, seed=k)
        tick = reson(tick, 2600 if k % 2 == 0 else 1900, 6) * 0.6 + tick * 0.4
        put('clock', tick, b, 0.55 if b < 9 else 0.7, 0.25)
        step = 1.0 if b < 17 else 0.5
        b += step; k += 1
    # pad oscuro y drone en La (toma 01)
    put('pad', pad(mtof([45, 52, 59, 60]), at(9) + 0.3, 0.9, cutoff=900, attack=1.6, release=0.8, seed=1), 0, 1.0)
    put('bass', drone(mtof(33), at(9.2), 0.8), 0, 0.8)
    # montaje: acordes Am–F–Dm–E, pulso de bajo en corcheas, stabs en cada corte, hats, riser
    prog1 = [(9, 'Am'), (13, 'F'), (17, 'Dm'), (21, 'E')]
    for i, (b0, c) in enumerate(prog1):
        b1 = prog1[i + 1][0] if i + 1 < len(prog1) else FREEZE
        bn, keys, pv = CH[c]
        put('pad', pad(mtof(pv), at(b1 - b0) + 0.05, 0.8 + 0.1 * i, cutoff=1100 + 350 * i, attack=0.08, release=0.05, seed=10 + i), b0, 1.0)
        bb = b0
        while bb < b1 - 0.01:
            put('bass', bass(mtof(bn + 12), at(0.45), 0.75 if (bb - b0) % 1 == 0 else 0.55, cutoff=500 + 150 * i), bb, 0.9)
            bb += 0.5
    for b0 in range(9, 26, 2):
        c = [c for (bb, c) in prog1 if bb <= b0][-1]
        put('keys', stab(mtof(CH[c][2]), 1.0, 0.3), b0, 1.4)
        put('drums', kick(0.8, 0.9), b0, 0.6)
    bb = 17
    while bb < FREEZE - 0.01:
        put('drums', hat(0.5 + 0.3 * ((bb * 4) % 2 == 0), seed=int(bb * 4)), bb, 0.5, 0.3)
        bb += 0.25
    put('fx', riser(at(FREEZE - 21), 1.0, 250, 7000, seed=3), 21, 0.7)
    # ── congelado: silencio de ~8 cuadros, golpe grave en el corte a la toma 11 (beat 28)
    put('fx', st(sub_hit(2.4, 70, 26, 1.0)), 28, 1.2)
    put('drums', kick(1.0, 0.8, 0.8), 28, 0.9)
    put('fx', crash(0.5, 2.0, seed=4), 28, 0.35)
    # toma 11: drone disonante (La + Si bemol) que se abre y se cierra, y se apaga al negro
    d = drone(mtof(33), at(7.4), 0.9, 0.3) + drone(mtof(34), at(7.4), 0.5, 0.17)
    d *= np.minimum(1, np.linspace(0, 3, len(d))) * np.clip(np.linspace(1.6, 0, len(d)) * 1.6, 0, 1)
    put('bass', d, 28, 0.9)
    put('pad', pad(mtof([45, 48, 51, 56]), at(7.2), 0.8, cutoff=700, attack=1.0, release=0.4, seed=7), 28, 0.9)
    # swell inverso hacia el drop
    put('fx', reverse_cymbal(at(1.6), seed=9), 36 - 1.6, 0.8)

    # ═════════ ACTO 2 ═════════
    prog2 = ['C', 'G/B', 'Am', 'F']

    def groove(b0, b1, kick_on=True, clap_on=True, hats=True, open_hat=True, busy=False):
        bb = b0
        while bb < b1 - 1e-6:
            pos = (bb - 36) % 4
            if kick_on and pos in (0, 2, 2.75) or (kick_on and busy and pos == 1.5):
                put('drums', kick(1.0 if pos == 0 else 0.85), bb, 1.0)
            if clap_on and pos in (1, 3):
                put('drums', clap(0.9, seed=int(bb * 4)), bb, 0.85, 0.05)
                put('drums', snare(0.5, seed=int(bb * 4) + 1), bb, 0.45)
            if hats:
                sub = round(((bb - 36) * 4) % 4)
                if open_hat and pos % 1 == 0.5:
                    put('drums', hat(0.7, True, seed=int(bb * 8)), bb, 0.38, -0.25)
                else:
                    put('drums', hat(0.9 if sub == 0 else (0.5 if sub == 2 else 0.35), seed=int(bb * 8)), bb, 0.42, -0.25)
            bb += 0.25

    def bassline(b0, b1, prog=prog2, start=36, gain=1.0, pattern=((0, .7), (.75, .5), (1.5, .45), (2.5, .45), (3, .4), (3.5, .45))):
        bar = start
        while bar < b1 - 1e-6:
            c = prog[int(round((bar - start) / 4)) % len(prog)]
            root = CH[c][0]
            for off, dur in pattern:
                bb = bar + off
                if b0 <= bb < b1:
                    note = root + (12 if off == 1.5 else 0) + (7 if off == 2.5 else 0)
                    put('bass', bass(mtof(note + 12), at(dur), 0.95, cutoff=1100, bright=1.0), bb, gain)
            bar += 4

    def comp(b0, b1, prog=prog2, start=36, gain=1.0, hits=(0, .75, 1.5, 2.5, 3.25)):
        bar = start
        while bar < b1 - 1e-6:
            c = prog[int(round((bar - start) / 4)) % len(prog)]
            for off in hits:
                bb = bar + off
                if b0 <= bb < b1:
                    for m in CH[c][1]:
                        put('keys', epiano(mtof(m), at(0.6), 0.75 if off == 0 else 0.6), bb, gain * 0.55, -0.15 + 0.1 * (m % 3))
            bar += 4

    def pads(b0, b1, prog=prog2, start=36, gain=1.0, cutoff=2000):
        bar = start
        while bar < b1 - 1e-6:
            c = prog[int(round((bar - start) / 4)) % len(prog)]
            s0 = max(bar, b0); s1 = min(bar + 4, b1)
            if s1 > s0:
                put('pad', pad(mtof(CH[c][2]), at(s1 - s0), 0.8, cutoff=cutoff, attack=0.25, release=0.5, seed=int(bar)), s0, gain)
            bar += 4

    def arps(b0, b1, prog=prog2, start=36, gain=1.0):
        bb = b0
        while bb < b1 - 1e-6:
            bar = start + ((bb - start) // 4) * 4
            c = prog[int(round((bar - start) / 4)) % len(prog)]
            tones = CH[c][1] + [CH[c][1][0] + 12]
            m = tones[int(round((bb - bar) * 4)) % len(tones)] + 12
            put('lead', pluck(mtof(m), 0.35, 0.55, 0.5, seed=int(bb * 4)), bb, gain * 0.45, 0.35 * np.sin(bb * 1.7))
            bb += 0.25

    def motif(b0, gain=1.0, transpose=0):
        for off, m, dd in MOTIF:
            put('lead', marimba(mtof(m + transpose), at(dd) + 0.2, 0.9), b0 + off, gain * 0.8, 0.1)
            put('lead', bell(mtof(m + transpose + 12), 0.9, 0.25), b0 + off, gain * 0.25, -0.2)

    # 36–59: drop (tomas 12–14)
    put('fx', crash(1.0, seed=11), 36, 0.9); put('fx', st(sub_hit(1.4, 80, 40, 0.8)), 36, 0.8)
    groove(36, 59); bassline(36, 59); comp(36, 59); pads(36, 59, cutoff=2200)
    motif(36, 1.0)
    arps(52, 59, gain=0.8)
    # 59–63: 14b "baja un escalón" (noche, Ronald duerme)
    pads(59, 63, cutoff=900, gain=1.1)
    put('bass', bass(mtof(CH['C'][0] + 12), at(3.8), 0.6, cutoff=400), 59, 0.7)
    for bb in (59, 60.5, 62): put('keys', epiano(mtof(76), at(1.2), 0.5), bb, 0.35, 0.3)
    put('fx', reverse_cymbal(at(1.0), seed=12), 62, 0.45)
    # 63–77: tomas 15–16 (tech: arpegios)
    groove(63, 77); bassline(63, 77); comp(63, 77, gain=0.8); pads(63, 77); arps(63, 77)
    # 77: cha-ching → celebración
    put('fx', crash(1.0, seed=13), 77, 0.8)
    groove(77, 101, busy=True); bassline(77, 101); comp(77, 101); pads(77, 101)
    motif(77, 1.0); arps(93, 101, gain=0.7)
    # 101–105: 19b (respiro corto)
    groove(101, 105, kick_on=False); comp(101, 105, gain=0.9); pads(101, 105); bassline(101, 105, gain=0.8)
    # 105–142: tomas 20–24
    put('fx', crash(0.8, seed=14), 105, 0.6)
    groove(105, 142); bassline(105, 142); comp(105, 142, gain=0.85); pads(105, 142)
    arps(105, 117, gain=0.7); motif(117, 0.9); arps(133, 140, gain=0.7)
    # fill hacia el acto 3
    for i, bb in enumerate(np.arange(140, 142, 0.25)):
        put('drums', snare(0.35 + 0.08 * i, seed=200 + i), bb, 0.6)
    put('fx', reverse_cymbal(at(2.0), seed=15), 140, 0.6)

    # ═════════ ACTO 3 ═════════
    prog3 = ['F', 'G', 'Em', 'Am']
    put('fx', crash(0.7, 3.2, seed=16), 142, 0.6)
    # 142–149: medio tiempo, respira
    for bb in (142, 146):
        put('drums', kick(0.8), bb, 0.8)
    for bb in (144, 148):
        put('drums', rim(0.6), bb, 0.6, 0.1)
    pads(142, 158, prog=prog3, start=142, cutoff=2600, gain=1.2)
    bassline(142, 149, prog=prog3, start=142, gain=0.7, pattern=((0, 3.6),))
    bb = 142
    while bb < 149:
        c = prog3[int((bb - 142) // 4) % 4]
        tones = CH[c][1]
        put('keys', epiano(mtof(tones[int((bb - 142) * 2) % 3] + 12), at(0.9), 0.5), bb, 0.45, 0.35 * np.sin(bb))
        bb += 0.5
    for bb in np.arange(142, 149, 0.5):
        put('drums', shaker(0.6, seed=int(bb * 2)), bb, 0.6, 0.3)
    # 149–158: sube (toma 26)
    groove(149, 158, open_hat=False); bassline(149, 158, prog=prog3, start=142); comp(149, 158, prog=prog3, start=142, gain=0.8)
    motif(150, 0.9, transpose=5)
    # 158–167: crescendo (toma 27)
    prog4 = [(158, 'F'), (160, 'G'), (162, 'Am'), (164, 'Gsus')]
    put('fx', crash(0.8, seed=17), 158, 0.6)
    for i, (b0, c) in enumerate(prog4):
        b1 = prog4[i + 1][0] if i + 1 < len(prog4) else 167
        put('pad', pad(mtof(CH[c][2]), at(b1 - b0) + 0.05, 1.0, cutoff=2400 + 400 * i, attack=0.05, release=0.1, seed=30 + i), b0, 1.1)
        bb = b0
        while bb < b1 - 1e-6:
            put('bass', bass(mtof(CH[c][0] + 12), at(0.45), 0.9, cutoff=1200), bb, 0.9)
            for m in CH[c][1]:
                put('keys', epiano(mtof(m), at(0.4), 0.55 + 0.1 * i), bb, 0.35)
            bb += 0.5
    bb = 158
    while bb < 167 - 1e-6:
        pos = (bb - 158) % 2
        if pos in (0, 1): put('drums', kick(0.95), bb, 0.9)
        rate = 1.0 if bb < 162 else (0.5 if bb < 165 else 0.25)
        if ((bb - 158) / rate) % 1 == 0:
            put('drums', snare(0.3 + 0.6 * (bb - 158) / 9, seed=int(bb * 8)), bb, 0.7)
        put('drums', hat(0.5, seed=int(bb * 8)), bb, 0.45, -0.2)
        bb += 0.25
    put('fx', riser(at(5.5), 1.0, 400, 10000, seed=18), 167 - 5.5, 0.8)
    # 167: golpe final + Do mayor que resuena
    put('fx', crash(1.0, 4.5, seed=19), 167, 1.0)
    put('fx', st(sub_hit(3.0, 90, 30, 1.0)), 167, 1.0)
    put('drums', kick(1.0, 0.85, 0.9), 167, 1.0)
    fin_len = total - at(167)
    put('pad', pad(mtof(CH['Cadd9'][2]), fin_len - 1.6, 1.0, cutoff=3000, attack=0.02, release=1.6, seed=40), 167, 1.4)
    for m in CH['Cadd9'][1] + [60]:
        put('keys', epiano(mtof(m), fin_len - 1.0, 0.8), 167, 0.6)
    put('bass', bass(mtof(36 + 12), fin_len - 1.2, 0.9, cutoff=700), 167, 0.9)
    for i, m in enumerate([67, 72, 76, 79, 84]):
        put('lead', marimba(mtof(m), 1.4, 0.9), 168.35 + i * 0.25, 0.75)
        put('lead', bell(mtof(m + 12), 3.0, 0.3), 168.35 + i * 0.25, 0.35)
    return bus
