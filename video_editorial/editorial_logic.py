"""Pure helpers shared by the editorial generator and its offline tests."""
import re
import math

def is_image_bytes(data):
    return (data.startswith(b'\x89PNG\r\n\x1a\n') or data.startswith(b'\xff\xd8\xff') or
            (data[:4] == b'RIFF' and data[8:12] == b'WEBP'))

def parse_editorial_input(raw_text, fallback_title=''):
    title = fallback_title
    lines = raw_text.strip().splitlines()
    script_lines = []
    explicit = False
    for line in lines:
        match = re.match(r'^\s*(T[IÍ]TULO|GUI[OÓ]N)\s*:\s*(.*)$', line, re.I)
        if match:
            if match.group(1).upper().startswith('T'):
                title = match.group(2).strip()
            else:
                explicit = True
                script_lines = [match.group(2)] if match.group(2) else []
        elif explicit:
            script_lines.append(line)
    script = '\n'.join(script_lines).strip() if explicit else raw_text.strip()
    if not title:
        title = ' '.join(script.split()[:9]).strip()
    return title, script

def group_paragraphs(script, limit=4):
    paragraphs = [p.strip() for p in re.split(r'\n\s*\n', script) if p.strip()]
    if not paragraphs:
        raise ValueError('El guion está vacío.')
    if len(paragraphs) <= limit:
        return paragraphs
    size = math.ceil(len(paragraphs) / limit)
    return ['\n\n'.join(paragraphs[i:i+size]) for i in range(0, len(paragraphs), size)]

def delayed_mix_args(files, timeline, total_duration, output):
    if len(files) != len(timeline) or not files:
        raise ValueError('Las pistas no coinciden con las escenas.')
    args = ['ffmpeg', '-y']
    for filename in files:
        args.extend(['-i', str(filename)])
    filters = []
    for i, scene in enumerate(timeline):
        filters.append(f'[{i}:a]adelay={round(scene["start"]*1000)}:all=1[a{i}]')
    inputs = ''.join(f'[a{i}]' for i in range(len(files)))
    filters.append(f'{inputs}amix=inputs={len(files)}:normalize=0,apad,atrim=duration={total_duration}[voice]')
    return args + ['-filter_complex', ';'.join(filters), '-map', '[voice]', '-c:a', 'libmp3lame', '-b:a', '192k', str(output)]

def validate_scene_data(data, original_script):
    scenes = data.get('scenes') if isinstance(data, dict) else None
    if not isinstance(scenes, list) or not 1 <= len(scenes) <= 5:
        raise ValueError('Se requieren entre 1 y 5 capítulos.')
    for index, scene in enumerate(scenes):
        if not isinstance(scene, dict) or not isinstance(scene.get('voice_text'), str) or not scene['voice_text'].strip():
            raise ValueError('Capítulo sin narración.')
        scene['id'] = index + 1
        scene['chapter'] = str(scene.get('chapter', f'CAPÍTULO {index + 1}'))[:100]
        scene['highlight_word'] = str(scene.get('highlight_word', ''))[:40]
        scene['visual_prompt'] = str(scene.get('visual_prompt', 'Cinematic editorial illustration'))[:800]
        if not isinstance(scene.get('captions'), list):
            scene['captions'] = []
        scene['captions'] = [str(c)[:180] for c in scene['captions'][:3]]
    normalize = lambda text: ' '.join(text.split())
    if normalize(' '.join(s['voice_text'] for s in scenes)) != normalize(original_script):
        raise ValueError('La segmentación alteró u omitió parte del guion.')
    return data
