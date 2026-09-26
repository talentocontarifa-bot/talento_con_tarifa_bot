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
import hashlib
from editorial_logic import parse_editorial_input, group_paragraphs, delayed_mix_args, validate_scene_data, is_image_bytes

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
    return parse_editorial_input(raw_text)

def fetch_open_editorial_issue():
    try:
        cmd = ['gh', 'issue', 'list', '--repo', 'talentocontarifa-bot/talento_con_tarifa_bot', '--state', 'open', '--limit', '10', '--json', 'number,title,body,labels']
        res = subprocess.check_output(cmd, timeout=30).decode('utf-8')
        issues = json.loads(res)
        for iss in issues:
            body = iss.get('body', '')
            title = iss.get('title', '')
            labels = [l.get('name', '').lower() for l in iss.get('labels', [])]
            if 'editorial' in labels or 'video' in labels or '[EDITORIAL]' in title.upper() or 'GUION:' in body.upper():
                print(f"📌 Encontrado issue #{iss['number']}: {title}")
                parsed_title, parsed_script = parse_editorial_input(body, title)
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
- "visual_prompt": Un prompt en INGLÉS para generar una ilustración cinematográfica documental o conceptual de alta calidad que represente esa escena (Estilo: cinematic editorial illustration, subject appropriate to the supplied script, dramatic lighting, vertical composition).
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
                return validate_scene_data(json.loads(data), script)
        except Exception as e:
            print(f"⚠️ Groq falló ({e}), intentando con Gemini...")

    # Intentar con Gemini
    if GEMINI_API_KEY:
        for model_name in [os.getenv("GEMINI_MODEL", "gemini-2.5-flash")]:
            try:
                print(f"🧠 Segmentando ensayo con Gemini ({model_name})...")
                import google.generativeai as genai
                genai.configure(api_key=GEMINI_API_KEY)
                model = genai.GenerativeModel(model_name, generation_config={"response_mime_type": "application/json"})
                res = model.generate_content(prompt)
                return validate_scene_data(json.loads(res.text), script)
            except Exception as e:
                pass
        print(f"⚠️ Gemini falló en todos los modelos, usando segmentación inteligente de respaldo.")

    # Fallback inteligente sin IA (dinámico para cualquier temática o artículo)
    paragraphs = group_paragraphs(script)

    scenes = []
    roman_numerals = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII']

    def chunk_words(text, words_per_line=7):
        words = text.split()
        lines = []
        for j in range(0, min(len(words), 21), words_per_line):
            lines.append(" ".join(words[j:j+words_per_line]))
        return lines[:3]

    for i, p in enumerate(paragraphs):
        # Extraer título del capítulo de las primeras palabras del párrafo
        first_clause = p.split('.')[0].split(',')[0].strip()
        meaningful_words = [w for w in first_clause.split() if len(w) > 3][:4]
        chapter_title = " ".join(meaningful_words).upper() if meaningful_words else f"ACTO {i+1}"

        # Palabra destacada en oro
        long_words = [w.strip('.,:;()!?"') for w in p.split() if len(w) > 5]
        highlight = long_words[0].upper() if long_words else "REFLEXIÓN"

        # Prompt visual dinámico basado en las primeras 12 palabras
        concept_snippet = " ".join(p.split()[:12]).replace('"', '')
        visual_prompt = f"cinematic dark dramatic conceptual illustration representing: {concept_snippet}, atmospheric chiaroscuro lighting, masterpiece"

        scenes.append({
            "id": i + 1,
            "chapter": f"CAPÍTULO {roman_numerals[i]}: {chapter_title}",
            "voice_text": p,
            "visual_prompt": visual_prompt,
            "captions": chunk_words(p, words_per_line=7),
            "highlight_word": highlight
        })

    return {
        "title": title,
        "scenes": scenes
    }

# ---------------------------------------------------------
# 3. DESCARGAR / GENERAR ILUSTRACIONES CINEMÁTICAS
# ---------------------------------------------------------
def prepare_scene_illustrations(scenes):
    if os.getenv('VIDEO_VISUAL_MODE', 'hybrid') != 'hybrid':
        for scene in scenes:
            scene['image_file'] = None
        print('Motion graphics: sin llamadas a proveedores de imágenes.')
        return

    print("🎨 Preparando ilustraciones cinemáticas para cada capítulo...")
    for sc in scenes:
        prompt_key = hashlib.sha256(sc.get('visual_prompt', '').encode()).hexdigest()[:12]
        img_filename = f"editorial_scene_{sc['id']}_{prompt_key}.jpg"
        img_path = os.path.join(PUBLIC_DIR, img_filename)
        sc['image_file'] = f"public/{img_filename}"

        # Si ya existe una imagen generada para este build específico, continuar
        if os.path.exists(img_path) and os.path.getsize(img_path) > 10000:
            with open(img_path, 'rb') as cached:
                if is_image_bytes(cached.read(12)):
                    print(f"  ✓ Imagen existente para Escena {sc['id']}")
                    continue

        raw_prompt = sc.get('visual_prompt', 'dark cinematic oil painting, dramatic lighting')
        concise_prompt = " ".join(raw_prompt.split()[:14])
        encoded = urllib.parse.quote(concise_prompt)
        pollinations_url = f"https://image.pollinations.ai/prompt/{encoded}?width=768&height=960&nologo=true&seed={sc['id']*137 + 42}"

        downloaded = False
        try:
            print(f"  ⬇️ Descargando arte para Escena {sc['id']} ({sc['chapter']})...")
            req = urllib.request.Request(pollinations_url, headers={'User-Agent': 'Mozilla/5.0'})
            with urllib.request.urlopen(req, timeout=18) as resp:
                payload = resp.read(15*1024*1024+1)
            if 5000 < len(payload) <= 15*1024*1024 and is_image_bytes(payload):
                with open(img_path, 'wb') as out_f:
                    out_f.write(payload)
                downloaded = True
                print(f"  ✓ Arte guardado: {img_filename} ({os.path.getsize(img_path)//1024} KB)")
        except Exception as e:
            print(f"  ⚠️ Error descargando ilustración {sc['id']} ({e})")

        if not downloaded:
            sc['image_file'] = None
            print('  Sin imagen útil: usando gráficos por código.')


# ---------------------------------------------------------
# 4. SÍNTESIS DE VOZ Y MASTERIZACIÓN DE AUDIO
# ---------------------------------------------------------
def synthesize_scene_audio(text, raw_path, mastered_path, voice="es-ES-AlvaroNeural"):
    subprocess.run([sys.executable, '-m', 'edge_tts', '--voice', voice, '--rate=-2%', '--text', text.strip(), '--write-media', raw_path], check=True, timeout=180)

    # Masterización: Calidez vocal, presencia de locución documental y normalización
    audio_filter = "highpass=f=75,equalizer=f=160:width_type=o:width=1.2:g=2.5,equalizer=f=3400:width_type=o:width=1:g=2,loudnorm=I=-16:TP=-1.5:LRA=10"
    subprocess.run(['ffmpeg', '-y', '-i', raw_path, '-af', audio_filter, '-c:a', 'libmp3lame', '-b:a', '192k', mastered_path], check=True, timeout=120, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)

    if os.path.exists(raw_path):
        os.remove(raw_path)

def get_audio_duration(path):
    res = subprocess.check_output(['ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'default=noprint_wrappers=1:nokey=1', path], timeout=30).decode().strip()
    return float(res)

def generate_ambient_track(duration, output_path):
    subprocess.run(['ffmpeg', '-y', '-f', 'lavfi', '-i', f'sine=frequency=55:duration={duration}', '-af', f'volume=0.03,lowpass=f=200,afade=t=in:ss=0:d=2,afade=t=out:st={max(0,duration-3)}:d=3', '-c:a', 'libmp3lame', '-b:a', '128k', output_path], check=True, timeout=120, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)


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

    voice_only_path = os.path.join(PUBLIC_DIR, "editorial_voice.mp3")
    subprocess.run(delayed_mix_args(scene_files, timeline, total_duration, voice_only_path), check=True, timeout=120, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)

    # Ambient track
    ambient_path = os.path.join(temp_dir, "ambient.mp3")
    generate_ambient_track(total_duration, ambient_path)

    # Mezclar voz + ambiente sutil
    final_audio_path = os.path.join(PUBLIC_DIR, "editorial_audio.mp3")
    subprocess.run(['ffmpeg', '-y', '-i', voice_only_path, '-i', ambient_path, '-filter_complex', '[0:a]volume=1.0[v];[1:a]volume=0.35[a];[v][a]amix=inputs=2:duration=first:normalize=0[out]', '-map', '[out]', '-c:a', 'libmp3lame', '-b:a', '192k', final_audio_path], check=True, timeout=120, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)

    return {
        "final_audio": final_audio_path,
        "total_duration": total_duration,
        "timeline": timeline
    }

# ---------------------------------------------------------
# 5. CONSTRUCCIÓN DE COMPOSICIÓN HYPERFRAMES (HTML + GSAP)
# ---------------------------------------------------------
def build_editorial_hyperframes(audio_info, script_data):
    from cinematic_composer import build_editorial
    build_editorial(audio_info, script_data, BASE_DIR)

# ---------------------------------------------------------
# 6. FUNCIÓN PRINCIPAL / ORQUESTADOR
# ---------------------------------------------------------
def main():
    parser = argparse.ArgumentParser(description="Generador de videos editoriales y ensayos para Talento con Tarifa")
    parser.add_argument("--title", help="Título del ensayo", default=os.getenv("EDITORIAL_TITLE"))
    parser.add_argument("--script", help="Guion narrativo completo", default=os.getenv("EDITORIAL_SCRIPT"))
    parser.add_argument("--issue", help="Número de issue a procesar", type=int, default=int(os.environ["EDITORIAL_ISSUE"]) if os.getenv("EDITORIAL_ISSUE") else None)
    parser.add_argument("--voice", help="Voz edge-tts", default="es-ES-AlvaroNeural")
    args = parser.parse_args()

    title = args.title
    script = args.script
    issue_number = args.issue

    # 1. Si no hay argumentos, buscar en issue abierto o entorno
    if not title or not script:
        if issue_number:
            try:
                cmd = ['gh', 'issue', 'view', str(issue_number), '--repo', 'talentocontarifa-bot/talento_con_tarifa_bot', '--json', 'title,body']
                res = subprocess.check_output(cmd, timeout=30).decode('utf-8')
                iss_data = json.loads(res)
                title, script = parse_editorial_input(iss_data.get('body', ''), iss_data.get('title', ''))
            except Exception as e:
                print(f"⚠️ Error leyendo issue #{issue_number}: {e}")
        else:
            found_issue = fetch_open_editorial_issue()
            if found_issue:
                issue_number = found_issue['number']
                title = found_issue['title']
                script = found_issue['script']
            else:
                title = os.getenv("EDITORIAL_TITLE")
                script = os.getenv("EDITORIAL_SCRIPT")

    if not title or not script:
        raise ValueError("Indica título y guion, o un issue válido. No se publicará un ejemplo por defecto.")

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

    elif os.path.exists(os.path.join(BASE_DIR, "current_issue.txt")):
        os.remove(os.path.join(BASE_DIR, "current_issue.txt"))

    # 2. Segmentar guion
    script_data = validate_scene_data(segment_script_with_ai(title, script), script)
    script_data["title"] = title
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
