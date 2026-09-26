import sys
import unittest
import struct
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[2]/'video_shared'))
from synthesize_sfx import synthesize, DURATIONS, RATE

class SfxTests(unittest.TestCase):
    def test_effects_are_short_deterministic_and_do_not_clip(self):
        for name, seconds in DURATIONS.items():
            payload=synthesize(name)
            self.assertEqual(payload,synthesize(name))
            self.assertEqual(len(payload),round(seconds*RATE)*2)
            samples=struct.unpack('<'+'h'*(len(payload)//2),payload)
            self.assertLessEqual(max(abs(v) for v in samples),16000)
            self.assertEqual(samples[0],0)
