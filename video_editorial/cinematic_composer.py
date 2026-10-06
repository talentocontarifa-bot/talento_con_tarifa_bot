"""Deterministic cinematic composition for the topic-agnostic editorial engine."""
import html
import json
import math
import subprocess
import os
from pathlib import Path

# Responsive layout: one template, three canvases. Every position/size the CSS uses is
# derived here so text-heavy or short chapters, with or without images, always fit.
FORMATS = {
    'vertical': {'w': 1080, 'h': 1920, 'pad_l': 84, 'pad_r': 150, 'brand_top': 140, 'seg_top': 196,
                 'vis_top': 250, 'vis_h': 500, 'copy_top': 800, 'head_h': 300, 'cap_top': 1260, 'cap_h': 230,
                 'brand_fs': 24, 'kicker_fs': 26, 'num_fs': 300, 'head_max': 118, 'cap_max': 46,
                 'intro_max': 150, 'intro_h': 760, 'intro_foot': 300},
    'feed': {'w': 1080, 'h': 1350, 'pad_l': 72, 'pad_r': 72, 'brand_top': 58, 'seg_top': 104,
             'vis_top': 146, 'vis_h': 420, 'copy_top': 610, 'head_h': 250, 'cap_top': 1030, 'cap_h': 220,
             'brand_fs': 22, 'kicker_fs': 24, 'num_fs': 240, 'head_max': 104, 'cap_max': 42,
             'intro_max': 130, 'intro_h': 560, 'intro_foot': 72},
    'square': {'w': 1080, 'h': 1080, 'pad_l': 64, 'pad_r': 64, 'brand_top': 48, 'seg_top': 90,
               'vis_top': 128, 'vis_h': 300, 'copy_top': 462, 'head_h': 200, 'cap_top': 836, 'cap_h': 190,
               'brand_fs': 20, 'kicker_fs': 22, 'num_fs': 190, 'head_max': 92, 'cap_max': 38,
               'intro_max': 110, 'intro_h': 430, 'intro_foot': 56},
}
INTRO_SECONDS = 2.2
OUTRO_SECONDS = 1.8


def resolve_format(name):
    key = str(name or 'vertical').strip().lower()
    aliases = {'9:16': 'vertical', 'reel': 'vertical', 'reels': 'vertical', '4:5': 'feed', '1:1': 'square'}
    key = aliases.get(key, key)
    if key not in FORMATS:
        raise ValueError(f'Formato editorial desconocido: {name}')
    return key, FORMATS[key]


def fit_font(text, box_w, box_h, max_fs, min_fs, char=0.6, line_height=1.04, pad_w=0.0, pad_h=0.0):
    """Largest font size (px) whose greedy word wrap fits the box. pad_* are em-based paddings."""
    words = str(text).split() or ['']
    for fs in range(int(max_fs), int(min_fs) - 1, -2):
        inner_w = box_w - pad_w * fs
        inner_h = box_h - pad_h * fs
        glyph = char * fs
        if inner_w <= 0 or max(len(w) for w in words) * glyph > inner_w:
            continue
        lines, current = 1, 0.0
        for word in words:
            width = len(word) * glyph
            if current == 0:
                current = width
            elif current + 0.28 * fs + width <= inner_w:
                current += 0.28 * fs + width
            else:
                lines += 1
                current = width
        if lines * line_height * fs <= inner_h:
            return fs
    return int(min_fs)


def build_editorial(audio_info, script_data, base_dir):
    base=Path(base_dir)
    total=float(audio_info['total_duration'])
    timeline=audio_info['timeline']
    if not math.isfinite(total) or total <= 0 or not timeline:
        raise ValueError('Timeline editorial inválida.')
    fmt_name, L = resolve_format(os.getenv('EDITORIAL_FORMAT') or script_data.get('format'))
    W, H = L['w'], L['h']
    box_w = W - L['pad_l'] - L['pad_r']
    esc=lambda value:html.escape(str(value),quote=True)
    mounts=[]
    captions=[]
    caption_motion=[]
    comp=base/'compositions'
    comp.mkdir(exist_ok=True)
    for stale in comp.glob('scene-*.html'):
        stale.unlink()
    count=len(timeline)
    plans=[{'id':f'editorial-{i}','index':i,'count':count,'duration':(float(timeline[i+1]['start']) if i+1<len(timeline) else total)-(0 if i==0 else float(scene['start'])),'delay':INTRO_SECONDS if i==0 else 0,'headline':str(scene['chapter']).partition(':')[2].strip() or str(scene['chapter'])} for i,scene in enumerate(timeline)]
    designs=json.loads(subprocess.check_output(['node',str(base/'editorial-motion.js')],input=json.dumps(plans).encode(),timeout=30))
    previous_end=0
    segments=[]
    for i,scene in enumerate(timeline):
        start=0 if i==0 else float(scene['start'])
        end=float(timeline[i+1]['start']) if i+1<len(timeline) else total
        if start<previous_end or end<=start:
            raise ValueError('Las escenas editoriales deben estar ordenadas.')
        previous_end=end
        duration=end-start
        segments.append((start, end))
        graphic=os.getenv('VIDEO_VISUAL_MODE','hybrid')=='graphics' or not scene.get('image_file')
        design=designs[i]
        image=Path(scene.get('image_file') or '.')
        if not graphic and (image.is_absolute() or '..' in image.parts or not (base/image).is_file()):
            raise ValueError('Ilustración ausente o fuera del proyecto.')
        title=str(scene['chapter']).partition(':')[2].strip() or str(scene['chapter'])
        title=title[:90]
        head_fs=fit_font(title, box_w, L['head_h'], L['head_max'], 44)
        if graphic:
            visual=f'<div class="ed-visual is-art">{design["art"]}</div>'
        else:
            visual=f'<div class="ed-visual"><img data-layout-allow-overflow src="{esc(image.as_posix())}" alt=""><div class="shade"></div></div>'
        highlight=str(scene.get('highlight_word','') or '').strip()[:40]
        chip=f'<p class="ed-chip"><i></i>{esc(highlight)}</p>' if highlight else ''
        markup=(f'<section class="ed-scene role-{design["role"]}" id="editorial-{i}" data-composition-id="editorial-{i}" data-width="{W}" data-height="{H}" data-duration="{duration}">'
                f'<div class="ed-visual-shadow"></div>{visual}<div class="ed-num" data-layout-allow-overflow>{i+1:02d}</div>'
                f'<div class="ed-copy"><p class="ed-kicker"><span>CAPÍTULO {i+1:02d}</span><span class="of">/ {count:02d}</span><span class="rule"></span></p>'
                f'<h1 class="ed-head" style="--hfs:{head_fs}px">{design["headline"]}</h1>{chip}</div>{design["decoration"]}</section>')
        motion=design['motion']
        (comp/f'scene-{i}.html').write_text(f'<!doctype html><html><body><template><style>#editorial-{i}{{position:absolute;inset:0;width:100%;height:100%;overflow:hidden}}</style>{markup}<script>{motion}</script></template></body></html>',encoding='utf-8')
        mounts.append(f'<div id="editorial-mount-{i}" class="clip" data-composition-id="editorial-{i}" data-composition-src="compositions/scene-{i}.html" data-start="{start}" data-duration="{duration}" data-width="{W}" data-height="{H}" data-track-index="0"></div>')
        # Concise editorial summaries, not claimed word-level transcripts.
        phrases=[str(p)[:180] for p in scene.get('captions',[]) if p][:3]
        if phrases:
            cap_start=float(scene['start'])
            if i==0:
                cap_start=max(cap_start, INTRO_SECONDS)
            span=max(0.5,(float(scene['end'] if 'end' in scene else float(scene['start'])+float(scene['duration']))-cap_start)/len(phrases))
            for k,phrase in enumerate(phrases):
                cap_fs=fit_font(phrase, box_w-10, L['cap_h'], L['cap_max'], 26, char=0.55, line_height=1.28, pad_w=1.9, pad_h=1.24)
                cid=f'editorial-caption-{i}-{k}'
                at=round(cap_start+k*span,3)
                captions.append(f'<p id="{cid}" class="clip editorial-caption" style="font-size:{cap_fs}px" data-start="{at}" data-duration="{round(span,3)}" data-track-index="2">{esc(phrase)}</p>')
                caption_motion.append(f"tl.fromTo('#{cid}',{{opacity:0,y:26}},{{opacity:1,y:0,duration:.35,ease:'power2.out'}},{at});")
    css=(base/'cinematic.css').read_text(encoding='utf-8')+(base/'editorial-motion.css').read_text(encoding='utf-8')
    layout_vars=(f":root{{--col:{round(W/6,2)}px;--pad-l:{L['pad_l']}px;--pad-r:{L['pad_r']}px;--brand-top:{L['brand_top']}px;--seg-top:{L['seg_top']}px;"
                 f"--vis-top:{L['vis_top']}px;--vis-h:{L['vis_h']}px;--copy-top:{L['copy_top']}px;--head-h:{L['head_h']}px;--cap-top:{L['cap_top']}px;--cap-h:{L['cap_h']}px;"
                 f"--brand-fs:{L['brand_fs']}px;--kicker-fs:{L['kicker_fs']}px;--num-fs:{L['num_fs']}px;--intro-h:{L['intro_h']}px;--intro-foot:{L['intro_foot']}px;")
    title_text=str(script_data['title'])
    intro_fs=fit_font(title_text, W-L['pad_l']-L['pad_r'], L['intro_h'], L['intro_max'], 56, line_height=0.98)
    layout_vars+=f"--intro-fs:{intro_fs}px}}"
    seg_html=''.join(f'<div class="seg" id="ed-seg-{i}"><i></i></div>' for i in range(count))
    seg_motion=''.join(f"tl.fromTo('#ed-seg-{i} i',{{scaleX:0}},{{scaleX:1,duration:{round(e-s,3)},ease:'none'}},{round(s,3)});" for i,(s,e) in enumerate(segments))
    intro_words=' '.join(f'<span class="w" data-layout-allow-overlap><span class="iw" data-layout-allow-overflow data-layout-allow-overlap>{esc(w)}</span></span>' for w in title_text.split())
    intro=(f'<div id="ed-intro" class="clip ed-intro" data-layout-allow-overlap data-start="0" data-duration="{INTRO_SECONDS}" data-track-index="4">'
           f'<p class="kicker" data-layout-allow-overlap><i></i>ENSAYO · {count} CAPÍTULOS</p><h2 data-layout-allow-overlap>{intro_words}</h2>'
           f'<div class="foot" data-layout-allow-overlap><span>TALENTO CON TARIFA</span><span>IDEAS / CONTEXTO</span></div></div>')
    outro_start=round(max(INTRO_SECONDS+0.5,total-OUTRO_SECONDS),3)
    outro_dur=round(total-outro_start,3)
    outro=(f'<div id="ed-outro" class="clip ed-outro" data-layout-allow-overlap data-start="{outro_start}" data-duration="{outro_dur}" data-track-index="5">'
           f'<div class="mark"></div><h3 data-layout-allow-overlap>Talento con Tarifa</h3><p data-layout-allow-overlap>Ideas con contexto, sin humo.</p><span class="pill" data-layout-allow-overlap>SÍGUENOS</span></div>')
    intro_motion=(f"tl.fromTo('#ed-intro .kicker',{{opacity:0,x:-30}},{{opacity:1,x:0,duration:.4,ease:'power3.out'}},.1);"
                  f"tl.fromTo('#ed-intro .iw',{{yPercent:110}},{{yPercent:0,duration:.5,stagger:.05,ease:'power4.out'}},.2);"
                  f"tl.fromTo('#ed-intro .foot',{{scaleX:0,transformOrigin:'left center'}},{{scaleX:1,duration:.6,ease:'power3.inOut'}},.3);"
                  f"tl.to('#ed-intro',{{yPercent:-100,duration:.45,ease:'power4.in'}},{INTRO_SECONDS-0.45});")
    outro_motion=(f"tl.fromTo('#ed-outro',{{yPercent:100}},{{yPercent:0,duration:.45,ease:'power4.out'}},{outro_start});"
                  f"tl.fromTo('#ed-outro .mark',{{scale:0,rotation:-45}},{{scale:1,rotation:0,duration:.45,ease:'back.out(1.8)'}},{outro_start+0.25});"
                  f"tl.fromTo('#ed-outro h3,#ed-outro p,#ed-outro .pill',{{opacity:0,y:24}},{{opacity:1,y:0,duration:.35,stagger:.1,ease:'power3.out'}},{outro_start+0.35});")
    audio_file='public/editorial_preview_audio.mp3' if audio_info.get('preview_audio') else 'public/editorial_audio.mp3'
    audio = '' if audio_info.get('preview_only') and not audio_info.get('preview_audio') else f'<audio id="editorial-voice" class="clip" src="{audio_file}" data-start="0" data-duration="{total}" data-track-index="3" data-volume="1"></audio>'
    fit_script="const fit=(el,min)=>{let s=parseFloat(getComputedStyle(el).fontSize),g=0;while(g++<40&&s>min&&el.clientWidth>200&&el.scrollHeight>el.clientHeight+3){s-=2;el.style.fontSize=s+'px';}};const fitAll=()=>{document.querySelectorAll('.editorial-caption').forEach(e=>fit(e,24));const h=document.querySelector('#ed-intro h2');if(h)fit(h,48);};fitAll();if(document.fonts&&document.fonts.ready)document.fonts.ready.then(fitAll);"
    document=(f'''<!doctype html><html lang="es"><head><meta charset="utf-8"><title>{esc(title_text)}</title><script src="assets/gsap.min.js"></script><style>{layout_vars}{css}</style></head><body>'''
              f'''<div id="root" class="format-{fmt_name}" data-composition-id="main" data-width="{W}" data-height="{H}" data-fps="30" data-duration="{total}"><div class="ed-bg"></div>{''.join(mounts)}'''
              f'''<header class="ed-brand"><span class="logo"><i></i>TALENTO CON TARIFA</span><span class="tag">IDEAS / CONTEXTO</span></header><div class="ed-segs">{seg_html}</div>'''
              f'''{''.join(captions)}{intro}{outro}{audio}</div>'''
              f'''<script>{fit_script}const tl=gsap.timeline({{paused:true}});{seg_motion}{''.join(caption_motion)}{intro_motion}{outro_motion}window.__timelines=window.__timelines||{{}};window.__timelines.main=tl;</script></body></html>''')
    (base/'index.html').write_text(document,encoding='utf-8')
    (base/'hyperframes.json').write_text(json.dumps({'compositions':[{'id':'main','source':'index.html','width':W,'height':H,'duration':total,'fps':30}]},indent=2),encoding='utf-8')
    (base/'editorial_data.json').write_text(json.dumps({'preview_only':bool(audio_info.get('preview_only')),'title':script_data['title'],'format':fmt_name,'duration':total,'scenes_count':len(timeline),'timeline':timeline},indent=2),encoding='utf-8')
