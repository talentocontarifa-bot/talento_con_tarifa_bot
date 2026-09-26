import os
import sys
import io
import json
import time
import argparse
import subprocess
import urllib.parse
import urllib.request
import requests

if sys.platform == "win32":
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
    sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding='utf-8', errors='replace')

from dotenv import load_dotenv

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
REPO_DIR = os.path.abspath(os.path.join(BASE_DIR, '..'))

load_dotenv(os.path.join(REPO_DIR, '.env'))
load_dotenv()

GEMINI_API_KEY = os.getenv("GEMINI_API") or os.getenv("GEMINI_API_KEY")
GROQ_API_KEY = os.getenv("GROQ_API_KEY")

PUBLIC_DIR = os.path.join(BASE_DIR, 'public')
ASSETS_DIR = os.path.join(BASE_DIR, 'assets')
OUT_DIR = os.path.join(BASE_DIR, 'out')
os.makedirs(PUBLIC_DIR, exist_ok=True)
os.makedirs(OUT_DIR, exist_ok=True)

# ---------------------------------------------------------
# 1. PARSEO DE ENTRADA (ISSUE O MANUAL)
# ---------------------------------------------------------
DEFAULT_SAMPLE_TITLE = "El día que vendieron el perdón por kilo"
DEFAULT_SAMPLE_SCRIPT = """Un fraile llega a un pueblo alemán con un cofre reforzado con hierro y una promesa: en cuanto tu moneda suene ahí dentro, el alma de tu madre sale del purgatorio. Eso no es leyenda. Eso predicaba Johann Tetzel en 1517, con tarifas según cuánto podías pagar.

La palabra detrás de todo esto, indulgentia, no nació cristiana: era latín romano para la clemencia que un emperador concedía por gracia propia. La Iglesia le heredó la palabra y también la lógica de fondo. Y esa lógica sigue viva cada vez que una institución convierte el perdón en trámite y el trámite en tarifa: la pregunta no es si eso pasó hace cinco siglos, es si de verdad dejó de pasar."""

def parse_input_text(raw_text):
    title = DEFAULT_SAMPLE_TITLE
    script = raw_text.strip()
    
    if "TÍTULO:" in raw_text or "TITULO:" in raw_text:
        lines = raw_text.splitlines()
        script_lines = []
        in_script = False
        for line in lines:
            stripped = line.strip()
            if stripped.upper().startswith("TÍTULO:") or stripped.upper().startswith("TITULO:"):
                title = stripped.split(":", 1)[1].strip()
            elif stripped.upper().startswith("GUION:") or stripped.upper().startswith("GUION :") or stripped.upper().startswith("GUIÓN:"):
                in_script = True
            elif in_script:
                script_lines.append(line)
        if script_lines:
            script = "\n".join(script_lines).strip()
            
    return title, script

def fetch_open_editorial_issue():
    try:
        cmd = 'gh issue list --repo talentocontarifa-bot/talento_con_tarifa_bot --state open --limit 10 --json number,title,body,labels'
        res = subprocess.check_output(cmd, shell=True).decode('utf-8')
        issues = json.loads(res)
        for iss in issues:
            body = iss.get('body', '')
            title = iss.get('title', '')
            labels = [l.get('name', '').lower() for l in iss.get('labels', [])]
            if 'editorial' in labels or 'video' in labels or '[EDITORIAL]' in title.upper() or 'GUION:' in body.upper():
                print(f"📌 Encontrado issue #{iss['number']}: {title}")
                parsed_title, parsed_script = parse_input_text(body if 'GUION:' in body.upper() else f"{title}\n\n{body}")
                return {
                    "number": iss['number'],
                    "title": parsed_title or title,
                    "script": parsed_script or body
                }
    except Exception as e:
        print(f"⚠️ No se pudo consultar GitHub Issues ({e}), usando entrada local.")
    return None

# ---------------------------------------------------------
# 2. SEGMENTAR GUION EN CAPÍTULOS / ESCENAS (IA O HEURÍSTICA)
# ---------------------------------------------------------
def segment_script_with_ai(title, script):
    prompt = f"""
Eres un director y guionista de mini-documentales y ensayos visuales de alta cultura para redes verticales (TikTok, Reels, Shorts).
Tienes este título y este ensayo/guion narrativo:

TÍTULO: {title}
GUION:
{script}

Tu tarea es dividir este texto exactamente en 3 o 4 escenas/capítulos cronológicos para un video vertical de 60 a 90 segundos.
Cada escena debe contener:
- "chapter": Número de capítulo y título corto y elegante (Ej: "CAPÍTULO I: EL COFRE DE HIERRO", "CAPÍTULO II: LA TARIFA DEL ALMA", "CAPÍTULO III: LA RAÍZ ROMANA", "CAPÍTULO IV: LA PREGUNTA INCÓMODA").
- "voice_text": El texto exacto que debe narrar la voz en off en ese capítulo (debe cubrir el guion original íntegramente, manteniendo el tono culto, provocador e hipnótico, sin omitir datos).
- "visual_prompt": Un prompt en INGLÉS para generar una ilustración cinemática histórica o alegórica de alta calidad que represente esa escena (Estilo: dark cinematic oil painting, historic details, dramatic Rembrandt chiaroscuro lighting, vertical composition, 8k).
- "captions": Una lista de 2 a 3 frases cortas y legibles para los subtítulos en pantalla correspondientes a ese capítulo.
- "highlight_word": Una o dos palabras clave de impacto que deben destacarse en color oro en la pantalla (Ej: "INDULGENTIA", "1517", "PURGATORIO", "TARIFA").

Devuelve ÚNICAMENTE un JSON con esta estructura exacta:
{{
  "title": "{title}",
  "scenes": [
    {{
      "id": 1,
      "chapter": "CAPÍTULO I: EL COFRE DE HIERRO",
      "voice_text": "...",
      "visual_prompt": "cinematic dark oil painting...",
      "captions": ["Frase 1", "Frase 2"],
      "highlight_word": "PURGATORIO"
    }}
  ]
}}
"""
    # Intentar con Groq
    if GROQ_API_KEY:
        try:
            print("🧠 Segmentando ensayo con Groq (llama-3.3-70b-versatile)...")
            url = "https://api.groq.com/openai/v1/chat/completions"
            headers = {"Authorization": f"Bearer {GROQ_API_KEY}", "Content-Type": "application/json"}
            payload = {
                "model": "llama-3.3-70b-versatile",
                "messages": [{"role": "user", "content": prompt}],
                "temperature": 0.4,
                "response_format": {"type": "json_object"}
            }
            res = requests.post(url, headers=headers, json=payload, timeout=25)
            if res.status_code == 200:
                data = res.json()["choices"][0]["message"]["content"]
                return json.loads(data)
        except Exception as e:
            print(f"⚠️ Groq falló ({e}), intentando con Gemini...")

    # Intentar con Gemini
    if GEMINI_API_KEY:
        for model_name in ["gemini-2.0-flash", "gemini-1.5-flash-8b", "gemini-1.5-pro", "models/gemini-2.0-flash"]:
            try:
                print(f"🧠 Segmentando ensayo con Gemini ({model_name})...")
                import google.generativeai as genai
                genai.configure(api_key=GEMINI_API_KEY)
                model = genai.GenerativeModel(model_name, generation_config={"response_mime_type": "application/json"})
                res = model.generate_content(prompt)
                return json.loads(res.text)
            except Exception as e:
                pass
        print(f"⚠️ Gemini falló en todos los modelos, usando segmentación inteligente de respaldo.")

    # Fallback inteligente sin IA
    paragraphs = [p.strip() for p in script.split("\n\n") if p.strip()]
    if len(paragraphs) < 2:
        paragraphs = [p.strip() for p in script.split(". ") if p.strip()]

    scenes = []
    default_prompts = [
        "cinematic dark dramatic painting of a medieval German square in 1517, a preacher with an iron bound chest with coins, Rembrandt lighting",
        "cinematic painting of medieval people giving coins to a Dominican friar, ledger of debts and souls, atmospheric gothic church interior",
        "ancient Roman marble bust of an emperor granting mercy, classical imperial aesthetic, dramatic chiaroscuro, cinematic",
        "modern imposing bureaucratic stone institution, shadows, philosophical reflection on ethics and transactions, dark atmospheric"
    ]
    
    chapter_names = ["EL COFRE DE HIERRO", "LA TARIFA DEL ALMA", "INDULGENTIA: LA RAÍZ", "LA PREGUNTA INCÓMODA"]
    highlights = ["PURGATORIO", "1517", "INDULGENTIA", "¿DE VERDAD?"]

    def chunk_words(text, words_per_line=7):
        words = text.split()
        lines = []
        for j in range(0, min(len(words), 21), words_per_line):
            lines.append(" ".join(words[j:j+words_per_line]))
        return lines[:3]

    for i, p in enumerate(paragraphs[:4]):
        scenes.append({
            "id": i + 1,
            "chapter": f"CAPÍTULO {['I', 'II', 'III', 'IV'][i]}: {chapter_names[min(i, len(chapter_names)-1)]}",
            "voice_text": p,
            "visual_prompt": default_prompts[min(i, len(default_prompts)-1)],
            "captions": chunk_words(p, words_per_line=7),
            "highlight_word": highlights[min(i, len(highlights)-1)]
        })

    return {
        "title": title,
        "scenes": scenes
    }

# ---------------------------------------------------------
# 3. DESCARGAR / GENERAR ILUSTRACIONES CINEMÁTICAS
# ---------------------------------------------------------
def prepare_scene_illustrations(scenes):
    print("🎨 Preparando ilustraciones cinemáticas para cada capítulo...")
    for sc in scenes:
        img_filename = f"editorial_scene_{sc['id']}.jpg"
        img_path = os.path.join(PUBLIC_DIR, img_filename)
        sc['image_file'] = f"public/{img_filename}"
        
        if os.path.exists(img_path) and os.path.getsize(img_path) > 10000:
            print(f"  ✓ Imagen existente para Escena {sc['id']}")
            continue

        prompt = sc.get('visual_prompt', 'dark cinematic oil painting, dramatic lighting')
        encoded = urllib.parse.quote(f"{prompt}, vertical composition, 8k, cinematic masterpiece, dark background")
        pollinations_url = f"https://image.pollinations.ai/prompt/{encoded}?width=960&height=1200&nologo=true&seed={sc['id']*137 + 42}"
        
        try:
            print(f"  ⬇️ Descargando arte para Escena {sc['id']} ({sc['chapter']})...")
            req = urllib.request.Request(pollinations_url, headers={'User-Agent': 'Mozilla/5.0'})
            with urllib.request.urlopen(req, timeout=30) as resp, open(img_path, 'wb') as out_f:
                out_f.write(resp.read())
            print(f"  ✓ Arte guardado: {img_filename} ({os.path.getsize(img_path)//1024} KB)")
        except Exception as e:
            print(f"  ⚠️ Error descargando ilustración {sc['id']} ({e}), generando respaldo...")
            # Respaldo con ffmpeg (gradiente elegante oscuro con viñeta)
            cmd_fallback = f'ffmpeg -y -f lavfi -i "color=c=0x0a0d14:s=960x1200:d=1" -vf "drawtext=text=\'{sc.get("highlight_word", "TCT")}\':fontcolor=0xd4af37:fontsize=90:x=(w-text_w)/2:y=(h-text_h)/2" -frames:v 1 "{img_path}"'
            subprocess.run(cmd_fallback, shell=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)

# ---------------------------------------------------------
# 4. SÍNTESIS DE VOZ Y MASTERIZACIÓN DE AUDIO
# ---------------------------------------------------------
def synthesize_scene_audio(text, raw_path, mastered_path, voice="es-ES-AlvaroNeural"):
    safe_text = text.replace('"', '').replace('\n', ' ').strip()
    cmd_tts = f'edge-tts --voice {voice} --rate="-2%" --text "{safe_text}" --write-media "{raw_path}"'
    subprocess.run(cmd_tts, shell=True, check=True)

    # Masterización: Calidez vocal, presencia de locución documental y normalización
    audio_filter = "highpass=f=75,equalizer=f=160:width_type=o:width=1.2:g=2.5,equalizer=f=3400:width_type=o:width=1:g=2,loudnorm=I=-16:TP=-1.5:LRA=10"
    cmd_ffmpeg = f'ffmpeg -y -i "{raw_path}" -af "{audio_filter}" -c:a libmp3lame -b:a 192k "{mastered_path}"'
    subprocess.run(cmd_ffmpeg, shell=True, check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)

    if os.path.exists(raw_path):
        os.remove(raw_path)

def get_audio_duration(path):
    cmd = f'ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "{path}"'
    res = subprocess.check_output(cmd, shell=True).decode().strip()
    return float(res)

def generate_ambient_track(duration, output_path):
    # Generar un ambiente sutil de fondo (dron cinematográfico oscuro a bajo volumen -24dB)
    cmd = f'ffmpeg -y -f lavfi -i "sine=frequency=55:duration={duration}" -af "volume=0.03,lowpass=f=200,afade=t=in:ss=0:d=2,afade=t=out:st={duration-3}:d=3" -c:a libmp3lame -b:a 128k "{output_path}"'
    subprocess.run(cmd, shell=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)

def process_voice_and_soundtrack(script_data, voice="es-ES-AlvaroNeural"):
    print(f"🎙️ Generando locución documental con {voice}...")
    temp_dir = os.path.join(BASE_DIR, "temp_editorial_audio")
    os.makedirs(temp_dir, exist_ok=True)

    scenes = script_data["scenes"]
    scene_files = []
    timeline = []
    current_time = 0.5  # Pausa inicial de 500ms para impacto

    for i, sc in enumerate(scenes):
        raw_p = os.path.join(temp_dir, f"raw_sc_{sc['id']}.mp3")
        mastered_p = os.path.join(temp_dir, f"scene_{sc['id']}_mastered.mp3")

        synthesize_scene_audio(sc["voice_text"], raw_p, mastered_p, voice=voice)
        dur = get_audio_duration(mastered_p)
        scene_files.append(mastered_p)

        timeline.append({
            **sc,
            "start": round(current_time, 3),
            "duration": round(dur, 3),
            "end": round(current_time + dur, 3)
        })
        print(f"  ✓ Escena {sc['id']}: [{timeline[-1]['start']}s -> {timeline[-1]['end']}s] ({dur:.2f}s) - {sc['chapter']}")
        current_time += dur + 0.4  # Pausa entre actos de 400ms

    total_duration = round(current_time + 1.2, 2)

    # Concatenar audios de escenas
    list_path = os.path.join(temp_dir, "concat_list.txt")
    with open(list_path, "w", encoding="utf-8") as f:
        for fpath in scene_files:
            abs_norm = os.path.abspath(fpath).replace("\\", "/")
            f.write(f"file '{abs_norm}'\n")

    voice_only_path = os.path.join(temp_dir, "full_voice.mp3")
    cmd_concat = f'ffmpeg -y -f concat -safe 0 -i "{list_path}" -c:a libmp3lame -b:a 192k "{voice_only_path}"'
    subprocess.run(cmd_concat, shell=True, check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)

    # Ambient track
    ambient_path = os.path.join(temp_dir, "ambient.mp3")
    generate_ambient_track(total_duration, ambient_path)

    # Mezclar voz + ambiente sutil
    final_audio_path = os.path.join(PUBLIC_DIR, "editorial_audio.mp3")
    cmd_mix = f'ffmpeg -y -i "{voice_only_path}" -i "{ambient_path}" -filter_complex "[0:a]volume=1.0[v];[1:a]volume=0.35[a];[v][a]amix=inputs=2:duration=first[out]" -map "[out]" -c:a libmp3lame -b:a 192k "{final_audio_path}"'
    subprocess.run(cmd_mix, shell=True, check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)

    return {
        "final_audio": final_audio_path,
        "total_duration": total_duration,
        "timeline": timeline
    }

# ---------------------------------------------------------
# 5. CONSTRUCCIÓN DE COMPOSICIÓN HYPERFRAMES (HTML + GSAP)
# ---------------------------------------------------------
def build_editorial_hyperframes(audio_info, script_data):
    total_dur = audio_info["total_duration"]
    timeline = audio_info["timeline"]
    title = script_data["title"]

    # Config hyperframes.json
    hf_config = {
        "$schema": "https://hyperframes.dev/schema.json",
        "name": "video_editorial",
        "resolution": "portrait",
        "compositions": [
            {
                "id": "main",
                "source": "index.html",
                "width": 1080,
                "height": 1920,
                "duration": int(round(total_dur)),
                "fps": 30
            }
        ]
    }
    with open(os.path.join(BASE_DIR, "hyperframes.json"), "w", encoding="utf-8") as f:
        json.dump(hf_config, f, indent=2)

    # Guardar metadatos para publicación
    meta_to_save = {
        "title": title,
        "duration": total_dur,
        "scenes_count": len(timeline),
        "timeline": timeline
    }
    with open(os.path.join(BASE_DIR, "editorial_data.json"), "w", encoding="utf-8") as f:
        json.dump(meta_to_save, f, indent=2)

    # Animaciones GSAP por escena
    gsap_lines = []
    gsap_lines.append(f"tl.fromTo('#progress_bar', {{scaleX: 0}}, {{scaleX: 1, duration: {total_dur}, ease: 'none'}}, 0);")

    for i, sc in enumerate(timeline):
        s_id = f"#scene_box_{sc['id']}"
        img_id = f"#img_{sc['id']}"
        text_id = f"#caption_{sc['id']}"
        start_t = sc['start']
        dur = sc['duration']
        end_t = sc['end']

        # Transición de entrada de la escena (fade + zoom sutil)
        gsap_lines.append(f"tl.fromTo('{s_id}', {{opacity: 0, scale: 0.96}}, {{opacity: 1, scale: 1, duration: 0.6, ease: 'power2.out'}}, {start_t});")
        # Ken Burns effect continuo en la ilustración durante la narración
        gsap_lines.append(f"tl.fromTo('{img_id}', {{scale: 1.0}}, {{scale: 1.08, duration: {dur + 0.5}, ease: 'none'}}, {start_t});")

        # Texto / Subtítulo dinámico
        gsap_lines.append(f"tl.fromTo('{text_id}', {{opacity: 0, y: 20}}, {{opacity: 1, y: 0, duration: 0.4}}, {start_t + 0.2});")

        if i < len(timeline) - 1:
            # Transición suave hacia el siguiente capítulo
            gsap_lines.append(f"tl.to('{s_id}', {{opacity: 0, scale: 1.03, duration: 0.45}}, {end_t});")
            gsap_lines.append(f"tl.to('{text_id}', {{opacity: 0, y: -10, duration: 0.35}}, {end_t});")

    gsap_script = "\n  ".join(gsap_lines)

    # HTML de cada escena
    scenes_html = []
    for sc in timeline:
        captions_html = "".join([f"<p class='caption-line'>{cap}</p>" for cap in sc.get('captions', []) if cap])
        scenes_html.append(f"""
        <div id="scene_box_{sc['id']}" class="editorial-scene">
          <div class="frame-container">
            <img id="img_{sc['id']}" class="scene-illustration" src="{sc['image_file']}" alt="Capítulo {sc['id']}">
            <div class="frame-overlay"></div>
            <div class="chapter-badge">
              <span class="chapter-label">{sc['chapter']}</span>
            </div>
            <div class="gold-accent-tag">{sc.get('highlight_word', '')}</div>
          </div>
          <div id="caption_{sc['id']}" class="caption-container">
            {captions_html}
          </div>
        </div>
        """)

    all_scenes_rendered = "\n".join(scenes_html)

    # Renderizar index.html completo
    html_content = f"""<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="utf-8">
<title>{title}</title>
<script src="assets/gsap.min.js"></script>
<style>
@font-face {{ font-family: 'PlayfairBold'; src: url('assets/arialbd.ttf'); font-weight: 700; }}
@font-face {{ font-family: 'PlayfairRegular'; src: url('assets/arial.ttf'); font-weight: 400; }}

* {{ box-sizing: border-box; margin: 0; padding: 0; }}
html, body {{
  width: 100%; height: 100%;
  overflow: hidden;
  background: #06080d;
  font-family: 'PlayfairRegular', Georgia, serif;
  color: #f1f5f9;
}}

#root {{
  width: 1080px; height: 1920px;
  position: relative;
  overflow: hidden;
  background: radial-gradient(circle at 50% 35%, #111827 0%, #030712 100%);
}}

/* Barra superior de lectura */
.header-top {{
  position: absolute; top: 70px; left: 60px; right: 60px;
  display: flex; justify-content: space-between; align-items: center;
  border-bottom: 1px solid rgba(212, 175, 55, 0.3);
  padding-bottom: 20px;
  z-index: 50;
}}
.brand-title {{
  font-family: 'PlayfairBold', Georgia, serif;
  font-size: 26px; letter-spacing: 4px; color: #d4af37;
  text-transform: uppercase;
}}
.tag-badge {{
  font-size: 22px; color: #94a3b8; font-family: monospace;
  background: rgba(255, 255, 255, 0.05); padding: 6px 16px; border-radius: 6px;
  border: 1px solid rgba(255, 255, 255, 0.1);
}}

/* Barra de progreso continua */
.progress-container {{
  position: absolute; top: 0; left: 0; width: 100%; height: 8px;
  background: rgba(255, 255, 255, 0.08); z-index: 100;
}}
#progress_bar {{
  width: 100%; height: 100%;
  background: linear-gradient(90deg, #d4af37, #fef08a);
  box-shadow: 0 0 15px rgba(212, 175, 55, 0.8);
  transform-origin: left;
}}

/* Escena y Contenedores */
.editorial-scene {{
  position: absolute; inset: 0;
  display: flex; flex-direction: column; align-items: center;
  opacity: 0;
  z-index: 20;
}}

/* Marco de la Ilustración Central */
.frame-container {{
  position: absolute; top: 160px; left: 60px; width: 960px; height: 1160px;
  border-radius: 28px;
  overflow: hidden;
  box-shadow: 0 25px 60px rgba(0, 0, 0, 0.8), 0 0 40px rgba(212, 175, 55, 0.15);
  border: 2px solid rgba(212, 175, 55, 0.4);
}}
.scene-illustration {{
  width: 100%; height: 100%;
  object-fit: cover;
  display: block;
}}
.frame-overlay {{
  position: absolute; inset: 0;
  background: linear-gradient(180deg, rgba(6, 8, 13, 0.3) 0%, rgba(6, 8, 13, 0.1) 40%, rgba(6, 8, 13, 0.8) 100%);
}}

/* Insignias de Capítulo y Destacado */
.chapter-badge {{
  position: absolute; top: 35px; left: 35px;
  background: rgba(6, 8, 13, 0.85); backdrop-filter: blur(12px);
  border: 1px solid rgba(212, 175, 55, 0.6);
  padding: 10px 24px; border-radius: 30px;
}}
.chapter-label {{
  font-family: 'PlayfairBold', Georgia, serif;
  font-size: 26px; color: #fef08a; letter-spacing: 2px;
}}
.gold-accent-tag {{
  position: absolute; bottom: 35px; right: 35px;
  background: #d4af37; color: #06080d;
  font-family: 'PlayfairBold', Georgia, serif;
  font-size: 24px; font-weight: 700; letter-spacing: 3px;
  padding: 8px 24px; border-radius: 8px;
  box-shadow: 0 0 25px rgba(212, 175, 55, 0.6);
}}

/* Contenedor de Subtítulos y Reflexión Narrativa */
.caption-container {{
  position: absolute; top: 1370px; left: 70px; right: 70px;
  height: 380px;
  display: flex; flex-direction: column; justify-content: center; align-items: center;
  text-align: center;
  background: rgba(17, 24, 39, 0.65);
  backdrop-filter: blur(16px);
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 24px;
  padding: 30px 45px;
  box-shadow: 0 15px 40px rgba(0, 0, 0, 0.6);
}}
.caption-line {{
  font-family: 'PlayfairBold', Georgia, serif;
  font-size: 44px; line-height: 1.35;
  color: #ffffff;
  text-shadow: 0 3px 12px rgba(0, 0, 0, 0.9);
  margin-bottom: 12px;
}}
.caption-line:last-child {{
  margin-bottom: 0;
}}

/* Footer / Handle de Autoridad */
.footer-bottom {{
  position: absolute; bottom: 50px; left: 60px; right: 60px;
  display: flex; justify-content: space-between; align-items: center;
  z-index: 50;
}}
.handle-author {{
  font-size: 26px; color: #d4af37; font-weight: 700; letter-spacing: 1px;
}}
.site-badge {{
  font-size: 24px; color: #94a3b8; font-family: monospace;
}}
</style>
</head>
<body>
<div id="root" data-composition-id="main" data-start="0" data-duration="{int(round(total_dur))}" data-width="1080" data-height="1920">
  <!-- BARRA DE PROGRESO -->
  <div class="progress-container">
    <div id="progress_bar"></div>
  </div>

  <!-- HEADER -->
  <div class="header-top">
    <div class="brand-title">TALENTO CON TARIFA</div>
    <div class="tag-badge">ENSAYOS & HISTORIAS</div>
  </div>

  <!-- ESCENAS DINÁMICAS -->
  {all_scenes_rendered}

  <!-- FOOTER -->
  <div class="footer-bottom">
    <div class="handle-author">@talentocontarifa</div>
    <div class="site-badge">talentocontarifa.com</div>
  </div>

  <!-- AUDIO -->
  <audio id="voice" class="clip" src="public/editorial_audio.mp3" data-start="0" data-duration="{total_dur}" data-volume="1"></audio>
</div>

<script>
  const tl = gsap.timeline({{ paused: true }});
  {gsap_script}
  window.__timelines = window.__timelines || {{}};
  window.__timelines['main'] = tl;
</script>
</body>
</html>
"""
    with open(os.path.join(BASE_DIR, "index.html"), "w", encoding="utf-8") as f:
        f.write(html_content)
    print("✓ Generados index.html y hyperframes.json correctamente.")

# ---------------------------------------------------------
# 6. FUNCIÓN PRINCIPAL / ORQUESTADOR
# ---------------------------------------------------------
def main():
    parser = argparse.ArgumentParser(description="Generador de videos editoriales y ensayos para Talento con Tarifa")
    parser.add_argument("--title", help="Título del ensayo", default=None)
    parser.add_argument("--script", help="Guion narrativo completo", default=None)
    parser.add_argument("--issue", help="Número de issue a procesar", type=int, default=None)
    parser.add_argument("--voice", help="Voz edge-tts", default="es-ES-AlvaroNeural")
    args = parser.parse_args()

    title = args.title
    script = args.script
    issue_number = args.issue

    # 1. Si no hay argumentos, buscar en issue abierto o entorno
    if not title or not script:
        if issue_number:
            try:
                cmd = f'gh issue view {issue_number} --repo talentocontarifa-bot/talento_con_tarifa_bot --json title,body'
                res = subprocess.check_output(cmd, shell=True).decode('utf-8')
                iss_data = json.loads(res)
                title, script = parse_input_text(f"{iss_data.get('title', '')}\n\n{iss_data.get('body', '')}")
            except Exception as e:
                print(f"⚠️ Error leyendo issue #{issue_number}: {e}")
        else:
            found_issue = fetch_open_editorial_issue()
            if found_issue:
                issue_number = found_issue['number']
                title = found_issue['title']
                script = found_issue['script']
            else:
                title = os.getenv("EDITORIAL_TITLE") or DEFAULT_SAMPLE_TITLE
                script = os.getenv("EDITORIAL_SCRIPT") or DEFAULT_SAMPLE_SCRIPT

    print("====================================================")
    print("🎬 INICIANDO GENERADOR DE VIDEO EDITORIAL // TCT")
    print(f"📌 TÍTULO: {title}")
    print(f"📄 GUION: {len(script.split())} palabras")
    if issue_number:
        print(f"🎫 ISSUE VINCULADO: #{issue_number}")
    print("====================================================")

    # Guardar issue_number si existe
    if issue_number:
        with open(os.path.join(BASE_DIR, "current_issue.txt"), "w") as f:
            f.write(str(issue_number))

    # 2. Segmentar guion
    script_data = segment_script_with_ai(title, script)
    print(f"✓ Ensayo dividido en {len(script_data['scenes'])} capítulos narrativos.")

    # 3. Preparar ilustraciones
    prepare_scene_illustrations(script_data['scenes'])

    # 4. Generar y masterizar audio
    audio_info = process_voice_and_soundtrack(script_data, voice=args.voice)
    print(f"✓ Audio masterizado: {audio_info['total_duration']}s de duración total.")

    # 5. Construir HTML y configuración Hyperframes
    build_editorial_hyperframes(audio_info, script_data)

    print("\n====================================================")
    print("🚀 LISTO PARA RENDERIZAR CON HYPERFRAMES")
    print("Ejecuta: npx hyperframes render -o out/video_editorial.mp4")
    print("====================================================\n")

if __name__ == "__main__":
    main()
