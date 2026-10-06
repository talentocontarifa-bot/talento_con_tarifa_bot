import json
import os
import shutil
import sys
import tempfile
import unittest
from pathlib import Path

BASE = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BASE))
from cinematic_composer import FORMATS, build_editorial, fit_font, resolve_format


class LayoutTests(unittest.TestCase):
    def test_formats_and_aliases(self):
        self.assertEqual(resolve_format(None)[0], 'vertical')
        self.assertEqual(resolve_format('4:5')[0], 'feed')
        self.assertEqual(resolve_format('1:1')[0], 'square')
        with self.assertRaises(ValueError):
            resolve_format('panoramico')

    def test_long_text_gets_smaller_font_than_short_text(self):
        L = FORMATS['vertical']
        width = L['w'] - L['pad_l'] - L['pad_r']
        short = fit_font('Busca contexto.', width, L['head_h'], L['head_max'], 44)
        long = fit_font('Por qué acumular información sin una pregunta clara te hace decidir peor', width, L['head_h'], L['head_max'], 44)
        self.assertEqual(short, L['head_max'])
        self.assertLess(long, short)
        self.assertGreaterEqual(long, 44)

    def test_long_single_word_never_exceeds_width(self):
        fs = fit_font('Desoxirribonucleico', 600, 400, 160, 30)
        self.assertLessEqual(len('Desoxirribonucleico') * 0.6 * fs, 600)


@unittest.skipUnless(shutil.which('node'), 'node requerido')
class BuildTests(unittest.TestCase):
    def build(self, fmt, image=False):
        root = Path(tempfile.mkdtemp())
        self.addCleanup(shutil.rmtree, root, ignore_errors=True)
        tmp = root / 'video_editorial'
        tmp.mkdir()
        shutil.copytree(BASE.parent / 'video_shared', root / 'video_shared')
        for name in ('cinematic.css', 'editorial-motion.css', 'editorial-motion.js'):
            shutil.copy(BASE / name, tmp / name)
        timeline = [
            {'id': 1, 'chapter': 'CAPÍTULO I: Primera idea <b>', 'captions': ['Una frase.'], 'highlight_word': 'Clave', 'start': .5, 'duration': 4, 'end': 4.5},
            {'id': 2, 'chapter': 'CAPÍTULO II: Segunda idea', 'captions': ['Otra frase.', 'Y otra.'], 'highlight_word': '', 'start': 4.9, 'duration': 4, 'end': 8.9},
        ]
        os.environ['EDITORIAL_FORMAT'] = fmt
        self.addCleanup(os.environ.pop, 'EDITORIAL_FORMAT', None)
        build_editorial({'total_duration': 10.1, 'timeline': timeline}, {'title': 'Un título'}, str(tmp))
        return tmp

    def test_square_build_is_responsive_and_escaped(self):
        out = self.build('square')
        index = (out / 'index.html').read_text(encoding='utf-8')
        self.assertIn('data-width="1080" data-height="1080"', index)
        self.assertIn('id="ed-intro"', index)
        self.assertIn('id="ed-outro"', index)
        self.assertEqual(index.count('class="seg"'), 2)
        scene = (out / 'compositions' / 'scene-0.html').read_text(encoding='utf-8')
        self.assertIn('&lt;b&gt;', scene)
        self.assertNotIn('ed-wipe', scene)
        self.assertIn('ed-wipe', (out / 'compositions' / 'scene-1.html').read_text(encoding='utf-8'))
        config = json.loads((out / 'hyperframes.json').read_text(encoding='utf-8'))
        self.assertEqual(config['compositions'][0]['height'], 1080)


if __name__ == '__main__':
    unittest.main()
