"""Deterministic cinematic composition for the topic-agnostic editorial engine."""
import html
import json
import math
import subprocess
import os
from pathlib import Path

def build_editorial(audio_info, script_data, base_dir):
    base=Path(base_dir)
    total=float(audio_info['total_duration'])
    timeline=audio_info['timeline']
    if not math.isfinite(total) or total <= 0 or not timeline:
        raise ValueError('Timeline editorial inválida.')
    esc=lambda value:html.escape(str(value),quote=True)
    mounts=[]
    captions=[]
    comp=base/'compositions'
    comp.mkdir(exist_ok=True)
    plans=[{'id':f'editorial-{i}','index':i,'duration':(float(timeline[i+1]['start']) if i+1<len(timeline) else total)-(0 if i==0 else float(scene['start'])),'headline':str(scene['chapter']).partition(':')[2].strip() or str(scene['chapter'])} for i,scene in enumerate(timeline)]
    designs=json.loads(subprocess.check_output(['node',str(base/'editorial-motion.js')],input=json.dumps(plans).encode(),timeout=30))
    previous_end=0
    for i,scene in enumerate(timeline):
        start=0 if i==0 else float(scene['start'])
        end=float(timeline[i+1]['start']) if i+1<len(timeline) else total
        if start<previous_end or end<=start:
            raise ValueError('Las escenas editoriales deben estar ordenadas.')
        previous_end=end
        duration=end-start
        graphic=os.getenv('VIDEO_VISUAL_MODE','hybrid')=='graphics' or not scene.get('image_file')
        design=designs[i]
        image=Path(scene.get('image_file') or '.')
        if not graphic and (image.is_absolute() or '..' in image.parts or not (base/image).is_file()):
            raise ValueError('Ilustración ausente o fuera del proyecto.')
        title=str(scene['chapter']).partition(':')[2].strip() or str(scene['chapter'])
        title=title[:90]
        visual=design['art'] if graphic else f'<div class="editorial-picture"><img data-layout-allow-overflow src="{esc(image.as_posix())}" alt=""></div>'
        markup=f'<section class="motion-scene {design["palette"]} role-{design["role"]} {"long-title" if len(title)>55 else ""}" id="editorial-{i}" data-composition-id="editorial-{i}" data-width="1080" data-height="1920" data-duration="{duration}">{visual}<div class="editorial-copy"><p class="chapter">CAPÍTULO {i+1:02d}<span>IDEAS / CONTEXTO</span></p><h1>{design["headline"]}</h1><p class="highlight">{esc(str(scene.get("highlight_word",""))[:40])}</p></div>{design["decoration"]}</section>'
        motion=design['motion']
        (comp/f'scene-{i}.html').write_text(f'<!doctype html><html><body><template><style>#editorial-{i}{{position:absolute;inset:0;width:100%;height:100%;overflow:hidden}}</style>{markup}<script>{motion}</script></template></body></html>',encoding='utf-8')
        mounts.append(f'<div id="editorial-mount-{i}" class="clip" data-composition-id="editorial-{i}" data-composition-src="compositions/scene-{i}.html" data-start="{start}" data-duration="{duration}" data-width="1080" data-height="1920" data-track-index="0"></div>')
        # Concise editorial summaries, not claimed word-level transcripts.
        phrases=[str(p)[:180] for p in scene.get('captions',[]) if p][:3]
        if phrases:
            span=float(scene['duration'])/len(phrases)
            for k,phrase in enumerate(phrases):
                captions.append(f'<p id="editorial-caption-{i}-{k}" class="clip editorial-caption" data-start="{float(scene["start"])+k*span}" data-duration="{span}" data-track-index="2">{esc(phrase)}</p>')
    css=(base/'cinematic.css').read_text(encoding='utf-8')+(base/'editorial-motion.css').read_text(encoding='utf-8')
    audio_file='public/editorial_preview_audio.mp3' if audio_info.get('preview_audio') else 'public/editorial_audio.mp3'
    audio = '' if audio_info.get('preview_only') and not audio_info.get('preview_audio') else f'<audio id="editorial-voice" class="clip" src="{audio_file}" data-start="0" data-duration="{total}" data-track-index="3" data-volume="1"></audio>'
    document=f'''<!doctype html><html lang="es"><head><meta charset="utf-8"><title>{esc(script_data['title'])}</title><script src="assets/gsap.min.js"></script><style>{css}</style></head><body><div id="root" data-composition-id="main" data-width="1080" data-height="1920" data-fps="30" data-duration="{total}">{''.join(mounts)}<header class="editorial-brand"><span>TALENTO CON TARIFA</span><span>IDEAS / CONTEXTO</span></header>{''.join(captions)}<div class="editorial-progress"><div id="editorial-progress-fill"></div></div>{audio}</div><script>const tl=gsap.timeline({{paused:true}});tl.fromTo('#editorial-progress-fill',{{scaleX:0}},{{scaleX:1,duration:{total},ease:'none'}},0);window.__timelines=window.__timelines||{{}};window.__timelines.main=tl;</script></body></html>'''
    (base/'index.html').write_text(document,encoding='utf-8')
    (base/'hyperframes.json').write_text(json.dumps({'compositions':[{'id':'main','source':'index.html','width':1080,'height':1920,'duration':total,'fps':30}]},indent=2),encoding='utf-8')
    (base/'editorial_data.json').write_text(json.dumps({'preview_only':bool(audio_info.get('preview_only')),'title':script_data['title'],'duration':total,'scenes_count':len(timeline),'timeline':timeline},indent=2),encoding='utf-8')
