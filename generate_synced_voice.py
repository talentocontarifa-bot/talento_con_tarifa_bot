import asyncio
import os
import sys
import json
import subprocess
import edge_tts

if sys.platform == "win32":
    try:
        sys.stdout.reconfigure(encoding="utf-8")
        sys.stderr.reconfigure(encoding="utf-8")
    except Exception:
        pass

VOICE = "es-MX-JorgeNeural"
RATE = "+6%"

SCENES = [
    {
        "id": "scene_1",
        "title1": "AGENTES IA",
        "title2": "NUEVA ERA",
        "tag": "✦ REVOLUCIÓN TECNOLÓGICA ✦",
        "voice_text": "¡Atención emprendedor! Los agentes de inteligencia artificial llegaron para cambiar todas las reglas del juego.",
        "subtitle": "¡Atención emprendedor! Los agentes de IA llegaron para cambiar las reglas."
    },
    {
        "id": "scene_2",
        "title": "AUTOMATIZACIÓN EXTREMA",
        "key_points": [
            "Multiplican tu alcance",
            "Operan 24 horas continuas",
            "Reducen costos operativos"
        ],
        "voice_text": "Automatización extrema: multiplican tu alcance, operan veinticuatro siete y reducen tus costos operativos.",
        "subtitle": "Automatización extrema: multiplican tu alcance y operan 24/7."
    },
    {
        "id": "scene_3",
        "number": 85,
        "label": "Empresas Adaptadas",
        "voice_text": "El ochenta y cinco por ciento de las empresas líderes en el mercado ya integraron agentes autónomos a sus equipos.",
        "subtitle": "El 85% de las empresas líderes ya integraron agentes autónomos."
    },
    {
        "id": "scene_4",
        "title": "COBRA POR TU VALOR",
        "voice_text": "Quienes dominan esta tecnología no compiten por precio: cobran por el verdadero valor de su talento.",
        "subtitle": "No compitas por precio: cobra por el valor de tu talento."
    },
    {
        "id": "scene_5",
        "headline": "¿LISTO PARA DOMINAR?",
        "sub": "Tu talento amplificado con agentes de IA.",
        "btn": "TALENTOCONTARIFA.LAT",
        "voice_text": "¿Listo para escalar tu negocio? Visita hoy mismo talento con tarifa punto lat y transforma tu futuro.",
        "subtitle": "Visita hoy talentocontarifa.lat y transforma tu futuro."
    }
]

def get_audio_duration(file_path):
    cmd = [
        "ffprobe", "-v", "error",
        "-show_entries", "format=duration",
        "-of", "default=noprint_wrappers=1:nokey=1",
        file_path
    ]
    res = subprocess.run(cmd, capture_output=True, text=True, check=True)
    return float(res.stdout.strip())

async def main():
    out_dir = os.path.join("video_tct", "temp_voice")
    os.makedirs(out_dir, exist_ok=True)
    
    scene_files = []
    current_time = 0.0
    timeline_scenes = []

    print("🎙️ Generando locución sincronizada con edge-tts...")
    for idx, sc in enumerate(SCENES):
        fn = os.path.join(out_dir, f"scene_{idx+1}.mp3")
        comm = edge_tts.Communicate(sc["voice_text"], VOICE, rate=RATE)
        await comm.save(fn)
        dur = get_audio_duration(fn)
        scene_files.append(fn)
        
        # Guardar timings exactos
        sc_timing = {
            **sc,
            "start": round(current_time, 3),
            "audio_duration": round(dur, 3),
            "end": round(current_time + dur, 3)
        }
        timeline_scenes.append(sc_timing)
        print(f"  ✓ Escena {idx+1}: [{sc_timing['start']}s -> {sc_timing['end']}s] ({dur:.2f}s) - \"{sc['subtitle']}\"")
        current_time += dur + 0.15 # 150ms micro-pausa natural entre escenas

    total_duration = current_time + 0.5 # 0.5s margen al final
    total_duration_sec = int(round(total_duration))
    print(f"\n⏱️ Duración total de voz y video: {total_duration:.2f}s (~{total_duration_sec}s)")

    # Concatenar audios con ffmpeg
    concat_list_file = os.path.join(out_dir, "concat_list.txt")
    with open(concat_list_file, "w", encoding="utf-8") as f:
        for fn in scene_files:
            # ffmpeg concat demuxer format
            abs_path = os.path.abspath(fn).replace("\\", "/")
            f.write(f"file '{abs_path}'\n")

    merged_voice_path = os.path.join("video_tct", "public", "news_voice.mp3")
    concat_cmd = [
        "ffmpeg", "-y", "-f", "concat", "-safe", "0",
        "-i", concat_list_file,
        "-c", "copy",
        merged_voice_path
    ]
    subprocess.run(concat_cmd, check=True)
    print(f"✅ Archivo maestro de voz generado en {merged_voice_path}")

    # Guardar metadata para HyperFrames
    news_data = {
        "theme_color": "#FF3300",
        "layout_type": "neo_brutalist",
        "total_duration_sec": total_duration_sec,
        "total_frames": total_duration_sec * 30,
        "scenes": timeline_scenes
    }

    js_file = os.path.join("video_tct", "news_data.js")
    with open(js_file, "w", encoding="utf-8") as f:
        f.write(f"window.NEWS_DATA = {json.dumps(news_data, indent=2, ensure_ascii=False)};\n")
    print(f"✅ news_data.js guardado con timestamps exactos.")

    json_file = os.path.join("video_tct", "src", "news_data.json")
    with open(json_file, "w", encoding="utf-8") as f:
        json.dump(news_data, f, indent=2, ensure_ascii=False)

    # Actualizar hyperframes.json con la duración real
    hf_config_file = os.path.join("video_tct", "hyperframes.json")
    with open(hf_config_file, "r", encoding="utf-8") as f:
        hf_config = json.load(f)
    hf_config["compositions"][0]["duration"] = total_duration_sec
    with open(hf_config_file, "w", encoding="utf-8") as f:
        json.dump(hf_config, f, indent=2)
    print(f"✅ hyperframes.json actualizado con duration={total_duration_sec}s.")

if __name__ == "__main__":
    asyncio.run(main())
