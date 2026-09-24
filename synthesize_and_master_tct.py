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
RATE = "+10%"

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

def master_voice_clip(input_path, output_path):
    filter_chain = (
        "highpass=f=80,"
        "equalizer=f=140:width_type=h:width=60:g=3.5,"
        "equalizer=f=3600:width_type=h:width=1200:g=4.0,"
        "acompressor=threshold=-16dB:ratio=4:attack=10:release=120:makeup=2.5dB,"
        "loudnorm=I=-14:TP=-1.0:LRA=7"
    )
    cmd = [
        "ffmpeg", "-y", "-i", input_path,
        "-af", filter_chain,
        "-c:a", "libmp3lame", "-b:a", "192k",
        output_path
    ]
    subprocess.run(cmd, capture_output=True, check=True)

async def main():
    temp_dir = os.path.join("video_tct", "temp_voice")
    os.makedirs(temp_dir, exist_ok=True)

    print(f"🎙️ Generando locución TCT con {VOICE} ({RATE}) y Masterización Vocal...")
    mastered_files = []
    current_time = 0.0
    timeline_scenes = []

    for idx, sc in enumerate(SCENES):
        raw_file = os.path.join(temp_dir, f"scene_{idx+1}_raw.mp3")
        mastered_file = os.path.join(temp_dir, f"scene_{idx+1}_mastered.mp3")

        comm = edge_tts.Communicate(sc["voice_text"], VOICE, rate=RATE)
        await comm.save(raw_file)

        master_voice_clip(raw_file, mastered_file)
        dur = get_audio_duration(mastered_file)
        mastered_files.append(mastered_file)

        sc_timing = {
            **sc,
            "start": round(current_time, 3),
            "audio_duration": round(dur, 3),
            "end": round(current_time + dur, 3)
        }
        timeline_scenes.append(sc_timing)
        print(f"  ✓ Escena {idx+1}: [{sc_timing['start']}s -> {sc_timing['end']}s] ({dur:.2f}s) - \"{sc['subtitle']}\"")
        current_time += dur + 0.16 # 160ms pausa

    total_duration = current_time + 0.4
    total_duration_sec = int(round(total_duration))
    print(f"\n⏱️ Duración total TCT: {total_duration:.2f}s (~{total_duration_sec}s)")

    # Concatenar locución final
    concat_list = os.path.join(temp_dir, "concat_list.txt")
    with open(concat_list, "w", encoding="utf-8") as f:
        for fn in mastered_files:
            abs_p = os.path.abspath(fn).replace("\\", "/")
            f.write(f"file '{abs_p}'\n")

    final_voice = os.path.join("video_tct", "public", "news_voice.mp3")
    concat_cmd = [
        "ffmpeg", "-y", "-f", "concat", "-safe", "0",
        "-i", concat_list,
        "-c:a", "libmp3lame", "-b:a", "192k",
        final_voice
    ]
    subprocess.run(concat_cmd, capture_output=True, check=True)
    print(f"✅ Voz masterizada guardada en {final_voice}")

    # Audio ducking sobre la pista tech
    music_src = os.path.join("video_tct", "public", "music_shiny_tech.mp3")
    ducked_music = os.path.join("video_tct", "public", "tct_music.mp3")

    print("🎵 Procesando Audio Ducking sobre la nueva pista tech (Shiny Tech)...")
    ducking_filter = (
        f"[1:a]aformat=channel_layouts=stereo:sample_rates=48000[sc];"
        f"[0:a]atrim=0:{total_duration_sec},aformat=channel_layouts=stereo:sample_rates=48000[music];"
        f"[music][sc]sidechaincompress=threshold=0.03:ratio=6:attack=40:release=350,volume=0.36[final_music]"
    )
    duck_cmd = [
        "ffmpeg", "-y",
        "-i", music_src,
        "-i", final_voice,
        "-filter_complex", ducking_filter,
        "-map", "[final_music]",
        "-c:a", "libmp3lame", "-b:a", "192k",
        ducked_music
    ]
    subprocess.run(duck_cmd, capture_output=True, check=True)
    print(f"✅ Música con Sidechain Ducking guardada en {ducked_music}")

    # Actualizar news_data.js
    news_data = {
        "theme_color": "#FF3300",
        "layout_type": "neo_brutalist",
        "total_duration_sec": total_duration_sec,
        "total_frames": total_duration_sec * 30,
        "scenes": timeline_scenes
    }

    with open(os.path.join("video_tct", "news_data.js"), "w", encoding="utf-8") as f:
        f.write(f"window.NEWS_DATA = {json.dumps(news_data, indent=2, ensure_ascii=False)};\n")

    # Actualizar hyperframes.json
    hf_config_file = os.path.join("video_tct", "hyperframes.json")
    with open(hf_config_file, "r", encoding="utf-8") as f:
        hf_config = json.load(f)
    hf_config["compositions"][0]["duration"] = total_duration_sec
    with open(hf_config_file, "w", encoding="utf-8") as f:
        json.dump(hf_config, f, indent=2)

    print(f"🎉 Pipeline de audio TCT completado. Duración video: {total_duration_sec}s")

if __name__ == "__main__":
    asyncio.run(main())
