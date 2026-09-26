"""Deterministic effects using only Python's standard library."""
import math
import random
import struct
import sys
import wave
from pathlib import Path

RATE = 24000
DURATIONS = {'hit': .24, 'swish': .32, 'tick': .09}

def synthesize(kind):
    rng = random.Random(714)
    duration = DURATIONS[kind]
    samples = []
    low = 0.0
    for i in range(round(RATE * duration)):
        t = i / RATE
        p = t / duration
        low = .75 * low + .25 * rng.uniform(-1, 1)
        if kind == 'hit':
            value = math.sin(2*math.pi*(135*t-160*t*t))*math.exp(-18*t)+.14*low*math.exp(-35*t)
        elif kind == 'swish':
            value = low*math.sin(math.pi*p)**2
        else:
            value = (math.sin(2*math.pi*1100*t)+.25*low)*math.exp(-65*t)
        value *= min(1, t/.004, (duration-t)/.012)
        samples.append(value)
    peak = max(abs(v) for v in samples) or 1
    return b''.join(struct.pack('<h', round(v/peak*16000)) for v in samples)

def write_effects(destination):
    destination = Path(destination)
    destination.mkdir(parents=True, exist_ok=True)
    for kind in DURATIONS:
        with wave.open(str(destination/f'{kind}.wav'), 'wb') as out:
            out.setnchannels(1)
            out.setsampwidth(2)
            out.setframerate(RATE)
            out.writeframes(synthesize(kind))

if __name__ == '__main__':
    write_effects(sys.argv[1])
