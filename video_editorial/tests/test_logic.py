import unittest
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from editorial_logic import parse_editorial_input, group_paragraphs, delayed_mix_args, validate_scene_data

class EditorialTests(unittest.TestCase):
    def test_inline_script_and_accented_labels(self):
        title, script = parse_editorial_input('título: Nuevo tema\nGUIÓN: Primera frase.\nSegunda frase.')
        self.assertEqual(title, 'Nuevo tema')
        self.assertEqual(script, 'Primera frase.\nSegunda frase.')

    def test_issue_title_remains_topic_agnostic(self):
        title, script = parse_editorial_input('Un ensayo sobre astronomía.', 'Cómo mirar el cielo')
        self.assertEqual(title, 'Cómo mirar el cielo')
        self.assertNotIn('perdón', title)

    def test_fallback_keeps_every_paragraph(self):
        source = '\n\n'.join(f'Párrafo {i}.' for i in range(12))
        groups = group_paragraphs(source)
        self.assertLessEqual(len(groups), 4)
        self.assertEqual('\n\n'.join(groups), source)

    def test_audio_has_initial_and_inter_scene_delays(self):
        args = delayed_mix_args(['a.mp3','b.mp3'], [{'start':.5},{'start':2.4}], 5.1, 'out.mp3')
        filters = args[args.index('-filter_complex')+1]
        self.assertIn('adelay=500:all=1', filters)
        self.assertIn('adelay=2400:all=1', filters)
        self.assertIn('atrim=duration=5.1', filters)
        self.assertEqual(args[-1], 'out.mp3')

    def test_scene_ids_are_local_and_sequential(self):
        data = {'scenes':[{'id':'../escape','voice_text':'Texto íntegro.'}]}
        self.assertEqual(validate_scene_data(data, 'Texto íntegro.')['scenes'][0]['id'],1)

    def test_model_cannot_silently_drop_text(self):
        with self.assertRaises(ValueError):
            validate_scene_data({'scenes':[{'voice_text':'La primera frase.'}]},'La primera frase. La segunda frase.')

if __name__ == '__main__':
    unittest.main()
