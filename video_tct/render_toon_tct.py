"""
render_toon_tct.py — Renderizador Oficial Toon Maker (Personaje 01) para Talento con Tarifa
===========================================================================================
Sustituye el renderizador anterior por el presentador animado 2D/3D (Personaje 01) con:
- Sincronización fonética de 16 visemas puros + suavizado de mandíbula y cámara viva.
- Efectos Glitch + Disimulador de Frames reactivos a la voz y cortes de cámara.
- Branding Neo-Brutalista oficial de Talento con Tarifa (#CCFF00 / #0A0A0A / #F0F0F0).
- Apoyos visuales de textos extraídos en el tercio inferior (Escenas 1 a 4: Titular, 3 Claves numeradas, Estadística animada, Jugada estratégica).
- Cortinilla de Salida oficial ("ESTE CONTENIDO FUE CREADO 100% AUTOMÁTICO CON IA" / "¿LISTO PARA DOMINAR?" / Mascota Cerebro + Botón mecánico) en la Escena 5 SIN quitar al personaje.
"""

import os
import sys
import json
import argparse

VIDEO_TCT_DIR = os.path.dirname(os.path.abspath(__file__))
REPO_ROOT = os.path.abspath(os.path.join(VIDEO_TCT_DIR, ".."))
TOON_HOST_DIR = os.path.join(REPO_ROOT, "toon_host")
CHAR_01_DIR = os.path.join(TOON_HOST_DIR, "01")

if TOON_HOST_DIR not in sys.path:
    sys.path.insert(0, TOON_HOST_DIR)
if CHAR_01_DIR not in sys.path:
    sys.path.insert(0, CHAR_01_DIR)

from toon_packager import ToonPackager
import tct_plugin


def main():
    parser = argparse.ArgumentParser(description="Renderizador Toon Maker TCT (Personaje 01)")
    parser.add_argument("--output", default=os.path.join(VIDEO_TCT_DIR, "out", "render.mp4"), help="Ruta MP4 de salida")
    parser.add_argument("--news-json", default=os.path.join(VIDEO_TCT_DIR, "src", "news_data.json"), help="Ruta a news_data.json")
    parser.add_argument("--voice", default=os.path.join(VIDEO_TCT_DIR, "public", "news_voice.mp3"), help="Ruta al audio de voz narrada")
    parser.add_argument("--bgm", default="", help="Ruta opcional a música de fondo (usa tct_music.mp3 por defecto)")
    parser.add_argument("--no-bgm", action="store_true", help="Desactivar música de fondo")
    parser.add_argument("--no-lower-thirds", action="store_true", help="Ocultar apoyos visuales de texto extraído")
    parser.add_argument("--no-outro", action="store_true", help="Ocultar cortinilla de salida")
    parser.add_argument("--subtitles", action="store_true", help="Activar cuadro gigante de subtítulos opcional")
    parser.add_argument("--banner", action="store_true", help="Activar banner superior opcional")
    args = parser.parse_args()

    cfg_path = os.path.join(CHAR_01_DIR, "character.json")
    with open(cfg_path, "r", encoding="utf-8") as f:
        cfg = json.load(f)

    assets = cfg.get("assets", {})
    rig = cfg.get("rig", {})
    voice_cfg = cfg.get("voice", {})
    vfx_cfg = cfg.get("visual_fx", {})

    source_vid = os.path.join(CHAR_01_DIR, assets.get("source_video", "Character_speaking_on_green_screen_20261016231544.mp4"))
    bg_file = os.path.join(CHAR_01_DIR, assets.get("background_image", "tct_studio_bg.jpg"))

    bgm_path = None
    if not args.no_bgm and os.environ.get("TCT_ENABLE_BGM", "1").strip() != "0":
        if args.bgm and os.path.exists(args.bgm):
            bgm_path = args.bgm
        else:
            candidates = [
                os.path.join(CHAR_01_DIR, assets.get("bgm_audio", "assets/tct_music.mp3")),
                os.path.join(CHAR_01_DIR, "assets", "tct_music.mp3"),
                os.path.join(VIDEO_TCT_DIR, "public", "tct_music.mp3"),
            ]
            for cand in candidates:
                if cand and os.path.isfile(cand):
                    bgm_path = cand
                    break

    ladder = rig.get("frame_ladder", [18, 15, 12, 13, 76, 87, 78, 85, 82, 83, 34, 38, 42, 43, 44, 46])
    focus_center = tuple(rig.get("focus_center", [360, 225]))

    packager = ToonPackager(
        source_video_path=source_vid,
        frame_ladder=ladder,
        background_path=bg_file,
        bgm_path=bgm_path,
        phonetic_mode=bool(rig.get("phonetic_mode", True)),
        blend_mode=rig.get("blend_mode", "snap"),
        hud_top_title=vfx_cfg.get("hud_top_title", "TALENTO CON TARIFA // NOTICIAS IA"),
        hud_bottom_prefix=vfx_cfg.get("hud_bottom_prefix", "TALENTOCONTARIFA.LAT"),
        closing_signature=cfg.get("closing_signature", "TALENTOCONTARIFA.LAT"),
    )

    # 1. Cargar escenas y textos extraídos desde news_data.json (generado por create_daily_news.js o create_trending_video.js)
    if os.path.exists(args.news_json):
        payload = tct_plugin.generate_daily_payload(existing_news_data_path=args.news_json)
    else:
        payload = tct_plugin.generate_daily_payload()
        os.makedirs(os.path.dirname(os.path.abspath(args.news_json)), exist_ok=True)
        with open(args.news_json, "w", encoding="utf-8") as nf:
            json.dump(
                {
                    "topic": payload["topic"],
                    "source_url": payload.get("source_url"),
                    "layout_type": "neo_brutalist",
                    "scenes": payload["scenes"],
                },
                nf,
                ensure_ascii=False,
                indent=2,
            )

    scenes = payload["scenes"]
    script_text = payload["script_text"]
    hud_tag = payload["hud_tag"]

    os.makedirs(os.path.dirname(os.path.abspath(args.output)), exist_ok=True)

    # 2. Preparar el audio de voz limpia (reutilizar public/news_voice.mp3 si create_daily_news.js ya lo creó, o clonar con Chatterbox Local)
    if os.path.exists(args.voice) and os.path.getsize(args.voice) > 1000:
        print(f"🎙️ Usando narración existente de Talento con Tarifa: {args.voice}")
        clean_wav = packager.ensure_pcm_wav(args.voice)
    else:
        print("🎙️ Clonando narración por escena con Chatterbox Local (Rufino_1)...")
        clean_wav = os.path.join(VIDEO_TCT_DIR, "out", "toon_voice.wav")
        try:
            import wave
            import numpy as np
            import clone_voice_tct

            temp_dir = os.path.join(VIDEO_TCT_DIR, "temp_voice")
            os.makedirs(temp_dir, exist_ok=True)
            batch_items = []
            for idx, sc in enumerate(scenes):
                txt = sc.get("voice_text") or sc.get("text") or ""
                out_w = os.path.join(temp_dir, f"toon_sc_{idx+1}.wav")
                batch_items.append({"text": txt, "output": out_w})

            clone_voice_tct.synthesize_batch(batch_items)
            sr = 24000
            pause_samples = np.zeros(int(0.40 * sr), dtype=np.int16)
            tail_samples = np.zeros(int(1.50 * sr), dtype=np.int16)
            all_pcm = []
            cur_time = 0.0
            for idx, sc in enumerate(scenes):
                out_w = batch_items[idx]["output"]
                with wave.open(out_w, "rb") as wf:
                    pcm = np.frombuffer(wf.readframes(wf.getnframes()), dtype=np.int16)
                dur = len(pcm) / float(sr)
                sc["start"] = round(cur_time, 3)
                sc["audio_duration"] = round(dur, 3)
                sc["end"] = round(cur_time + dur, 3)
                all_pcm.append(pcm)
                if idx < len(scenes) - 1:
                    all_pcm.append(pause_samples)
                    cur_time += dur + 0.40
                else:
                    all_pcm.append(tail_samples)
                    cur_time += dur + 1.50
            full_pcm = np.concatenate(all_pcm)
            with wave.open(clean_wav, "wb") as wf_out:
                wf_out.setnchannels(1)
                wf_out.setsampwidth(2)
                wf_out.setframerate(sr)
                wf_out.writeframes(full_pcm.tobytes())
        except Exception as e:
            print(f"⚠️ Aviso Chatterbox Local ({e}), usando fallback ToonPackager...")
            scenes = packager.synthesize_scenes_voice(
                scenes,
                clean_wav,
                voice_id=os.environ.get("ELEVENLABS_VOICE_ID", voice_cfg.get("voice_id", "TX3LPaxmHKxFdv7VOQHJ")),
                model_id=os.environ.get("ELEVENLABS_MODEL_ID", voice_cfg.get("model_id", "eleven_v4_turbo")),
                dsp_preset=voice_cfg.get("dsp_preset", "studio_broadcast"),
            )

    show_lower_thirds = not args.no_lower_thirds
    show_outro_curtain = not args.no_outro

    print(f"🎬 Renderizando Reel de Talento con Tarifa con Personaje 01 -> {args.output}")
    print(f"   ✓ Tema: {hud_tag}")
    print(f"   ✓ Escenas extraídas: {len(scenes)} | Apoyos Inferiores: {'ON' if show_lower_thirds else 'OFF'} | Cortinilla Salida: {'ON' if show_outro_curtain else 'OFF'}")

    packager.render_video(
        clean_voice_wav=clean_wav,
        script_text=script_text,
        votd_ref=hud_tag,
        output_mp4_path=args.output,
        focus_center_x=focus_center[0],
        rgb_split_px=int(vfx_cfg.get("character_rgb_split_px", 0)),
        show_hud=False,
        show_top_banner=bool(args.banner),
        show_subtitles_box=bool(args.subtitles),
        show_digital_dust=False,
        glitch_fx=True,
        brand_preset="tct",
        scenes=scenes,
        show_lower_thirds=show_lower_thirds,
        show_outro_curtain=show_outro_curtain,
    )
    print(f"✅ Render Toon Maker TCT finalizado: {args.output}")


if __name__ == "__main__":
    main()
