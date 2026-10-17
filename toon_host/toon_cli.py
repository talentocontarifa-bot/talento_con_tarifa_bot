"""
toon_cli.py — Gestor Universal de Personajes y Animaciones (Toon Maker)
=======================================================================
Separa completamente el MOTOR de animaciones de cada PERSONAJE individual.

Estructura de carpetas:
  Toon_maker/
  ├── toon_cli.py            <-- Consola maestra (init, inspect, render, list)
  ├── toon_packager.py       <-- Motor universal de Chroma Key, Slew-Rate, FX, Audio DSP y Render
  ├── 00/                    <-- Personaje 00 (Kraugé)
  │   ├── character.json     <-- Configuración declarativa (frames, foco, colores, voz, efectos)
  │   ├── krauge_plugin.py   <-- Lógica de contenido propia del bot (YouVersion + IA)
  │   └── ... (mp4, jpg, mp3)
  └── 01/                    <-- Próximo personaje / bot
      └── character.json

Comandos:
  python toon_cli.py list
  python toon_cli.py init 01 --name "NuevoBot"
  python toon_cli.py inspect 01
  python toon_cli.py render 00
  python toon_cli.py render 00 --text "Texto personalizado de prueba"
"""

import os
import sys
import io
import glob
import json
import argparse
import importlib.util
import cv2
import numpy as np
from toon_packager import ToonPackager

BASE_DIR = os.path.dirname(os.path.abspath(__file__))


def load_character_profile(folder_name):
    folder_path = os.path.join(BASE_DIR, folder_name)
    cfg_path = os.path.join(folder_path, "character.json")
    if not os.path.exists(cfg_path):
        raise FileNotFoundError(f"No existe {cfg_path}. Ejecuta primero: python toon_cli.py inspect {folder_name}")
    with open(cfg_path, "r", encoding="utf-8") as f:
        return folder_path, json.load(f)


def resolve_asset(folder_path, pattern_or_rel):
    if not pattern_or_rel:
        return None
    direct = os.path.join(folder_path, pattern_or_rel)
    if os.path.exists(direct):
        return direct
    # Si el nombre tiene caracteres truncados (…), buscar coincidencia en la carpeta
    ext = os.path.splitext(pattern_or_rel)[1]
    candidates = [
        p for p in glob.glob(os.path.join(folder_path, f"*{ext}"))
        if not os.path.basename(p).startswith("demo_")
    ]
    return candidates[0] if candidates else None


def cmd_list(_args):
    print("====================================================")
    print("🎭 PERSONAJES REGISTRADOS EN TOON_MAKER")
    print("====================================================")
    for entry in sorted(os.listdir(BASE_DIR)):
        if entry.startswith(".") or entry.startswith("_"):
            continue
        sub = os.path.join(BASE_DIR, entry)
        if os.path.isdir(sub):
            cfg_file = os.path.join(sub, "character.json")
            if os.path.exists(cfg_file):
                with open(cfg_file, "r", encoding="utf-8") as f:
                    cfg = json.load(f)
                ladder = cfg.get("rig", {}).get("frame_ladder", [])
                voice = cfg.get("voice", {}).get("voice_name", "N/A")
                theme = cfg.get("visual_fx", {}).get("theme_name", "default")
                print(f"  [{entry}] {cfg.get('display_name')} — \"{cfg.get('tagline')}\"")
                print(f"       Frames: {len(ladder)} {ladder[:5]}... | Voz: {voice} | Tema: {theme}")
            else:
                mp4s = glob.glob(os.path.join(sub, "*.mp4"))
                print(f"  [{entry}] (Sin character.json — {len(mp4s)} archivo(s) MP4 detectados)")
    print("====================================================")


def cmd_init(args):
    folder_path = os.path.join(BASE_DIR, args.folder)
    os.makedirs(os.path.join(folder_path, "assets"), exist_ok=True)
    os.makedirs(os.path.join(folder_path, "analysis"), exist_ok=True)

    # Copiar fuentes base desde 00/assets si existen
    src_assets = os.path.join(BASE_DIR, "00", "assets")
    if os.path.exists(src_assets):
        import shutil
        for ttf in glob.glob(os.path.join(src_assets, "*.ttf")):
            shutil.copy2(ttf, os.path.join(folder_path, "assets", os.path.basename(ttf)))

    print(f"✅ Carpeta de personaje '{args.folder}' creada en: {folder_path}")
    print("👉 Siguiente paso:")
    print(f"   1. Coloca tu video en pantalla verde (.mp4) y tu fondo (.jpg) dentro de '{args.folder}/'")
    print(f"   2. Ejecuta: python toon_cli.py inspect {args.folder} --name \"{args.name}\"")


def cmd_inspect(args):
    """
    Analiza un video en pantalla verde dentro de la carpeta indicada,
    genera la hoja de contacto de frames (analysis/heads_grid.jpg)
    y crea automáticamente su archivo character.json con una escalera contigua sugerida.
    """
    folder_path = os.path.join(BASE_DIR, args.folder)
    os.makedirs(os.path.join(folder_path, "analysis"), exist_ok=True)

    mp4s = [
        p for p in glob.glob(os.path.join(folder_path, "*.mp4"))
        if not os.path.basename(p).startswith("demo_")
    ]
    if not mp4s:
        print(f"❌ No se encontró ningún video fuente (.mp4) en {folder_path}")
        sys.exit(1)

    source_vid = mp4s[0]
    jpgs = glob.glob(os.path.join(folder_path, "*.jpg")) + glob.glob(os.path.join(folder_path, "*.png"))
    bg_file = jpgs[0] if jpgs else ""
    mp3s = glob.glob(os.path.join(folder_path, "*.mp3"))
    bgm_file = mp3s[0] if mp3s else ""

    cap = cv2.VideoCapture(source_vid)
    total = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    fps = cap.get(cv2.CAP_PROP_FPS) or 24.0
    frames = []
    while True:
        ret, f = cap.read()
        if not ret:
            break
        frames.append(f)
    cap.release()

    H, W = frames[0].shape[:2]
    print(f"🔍 Video detectado: {os.path.basename(source_vid)} ({W}x{H} @ {fps:.1f}fps, {len(frames)} frames)")

    # Generar hoja de contacto cada 6 frames para inspección visual
    thumbs = []
    step = max(1, len(frames) // 40)
    for idx in range(0, len(frames), step):
        crop = cv2.resize(frames[idx], (180, 320))
        cv2.putText(crop, f"F{idx:03d}", (10, 30), cv2.FONT_HERSHEY_SIMPLEX, 0.8, (0, 255, 255), 2)
        thumbs.append(crop)

    cols = 8
    while len(thumbs) % cols != 0:
        thumbs.append(np.zeros_like(thumbs[0]))
    rows = [np.hstack(thumbs[i : i + cols]) for i in range(0, len(thumbs), cols)]
    grid = np.vstack(rows)
    grid_path = os.path.join(folder_path, "analysis", "heads_grid.jpg")
    cv2.imwrite(grid_path, grid)
    print(f"   ✓ Hoja de contacto generada: {grid_path}")

    # Sugerir escalera contigua de 16 frames ordenada por energía/movimiento en el primer tercio limpio
    end_clean = min(len(frames), 60)
    start_clean = min(15, max(0, end_clean - 40))
    suggested_ladder = [
        int(round(x)) for x in np.linspace(start_clean, end_clean - 1, 16)
    ]

    cfg_path = os.path.join(folder_path, "character.json")
    if not os.path.exists(cfg_path) or args.force:
        profile = {
            "character_id": f"char_{args.folder}",
            "display_name": args.name.upper(),
            "tagline": "TRANSMISIÓN ACTIVA",
            "closing_signature": "FIN DE TRANSMISIÓN",
            "assets": {
                "source_video": os.path.basename(source_vid),
                "background_image": os.path.basename(bg_file) if bg_file else "",
                "bgm_audio": "",
                "lcd_font": "assets/VT323-Regular.ttf",
                "hud_font": "assets/ShareTechMono-Regular.ttf",
            },
            "rig": {
                "frame_ladder": suggested_ladder,
                "phonetic_mode": True,
                "blend_mode": "snap",
                "focus_center": [W // 2, int(H * 0.22)],
                "slew_up": 0.42,
                "slew_down": 0.24,
                "shots": {
                    "FULL": {"zoom": 1.00, "focus_y": H // 2},
                    "MEDIUM": {"zoom": 1.38, "focus_y": int(H * 0.30)},
                    "CLOSE": {"zoom": 1.82, "focus_y": int(H * 0.19)},
                },
            },
            "voice": {
                "engine": "elevenlabs",
                "voice_id": "TX3LPaxmHKxFdv7VOQHJ",
                "model_id": "eleven_v4_turbo",
                "voice_name": "es-MX-JorgeNeural",
                "rate": "+4%",
                "pitch": "-6Hz",
                "dsp_preset": "studio_broadcast",
                "bgm_volume": 0.16,
            },
            "visual_fx": {
                "theme_name": "clean_studio",
                "primary_bgr": [255, 225, 0],
                "secondary_bgr": [255, 120, 0],
                "bg_tint_bgr": [52, 24, 8],
                "bg_tint_strength": 0.0,
                "character_rgb_split_px": 0,
                "show_hud": False,
                "show_top_banner": False,
                "show_subtitles_box": False,
                "digital_dust": False,
                "dust_count": 52,
                "front_vignette": True,
                "scanlines": False,
                "hud_top_title": f"{args.name.upper()} // TRANSMISIÓN ACTIVA",
                "hud_bottom_prefix": args.name.upper(),
            },
            "content_plugin": "",
        }
        with open(cfg_path, "w", encoding="utf-8") as f:
            json.dump(profile, f, ensure_ascii=False, indent=2)
        print(f"   ✓ Archivo character.json creado en: {cfg_path}")
    else:
        print(f"   ℹ️ {cfg_path} ya existe (usa --force para sobrescribirlo).")


def cmd_render(args):
    folder_path, cfg = load_character_profile(args.folder)
    assets = cfg.get("assets", {})
    rig = cfg.get("rig", {})
    voice_cfg = cfg.get("voice", {})
    vfx_cfg = cfg.get("visual_fx", {})

    source_vid = resolve_asset(folder_path, assets.get("source_video"))
    bg_file = resolve_asset(folder_path, assets.get("background_image"))

    bgm_rel = getattr(args, "bgm", "") or assets.get("bgm_audio", "")
    bgm_file = resolve_asset(folder_path, bgm_rel) if bgm_rel else None

    ladder = rig.get("frame_ladder", [18, 17, 20, 22, 23, 24, 26, 28, 30, 33, 36, 40, 44, 48, 51, 54])
    focus_center = tuple(rig.get("focus_center", [315, 210]))
    phonetic_mode = bool(rig.get("phonetic_mode", False))
    blend_mode = rig.get("blend_mode", "snap" if phonetic_mode else "crossfade")

    hud_top_title = vfx_cfg.get("hud_top_title", f"{cfg.get('display_name', 'BOT')} // {cfg.get('tagline', 'ACTIVO')}")
    hud_bottom_prefix = vfx_cfg.get("hud_bottom_prefix", cfg.get("display_name", "BOT"))
    closing_sig = cfg.get("closing_signature", "FIN DE TRANSMISIÓN")
    rgb_split_px = int(vfx_cfg.get("character_rgb_split_px", 0))

    # Modo Clean por defecto (sin banner superior, sin cuadro de texto gigante, sin polvo digital)
    show_hud = bool(vfx_cfg.get("show_hud", False))
    show_top_banner = bool(getattr(args, "banner", False) or vfx_cfg.get("show_top_banner", show_hud))
    show_subtitles_box = bool(getattr(args, "subtitles", False) or vfx_cfg.get("show_subtitles_box", show_hud))
    show_digital_dust = bool(getattr(args, "dust", False) or vfx_cfg.get("digital_dust", show_hud))
    glitch_fx = bool(vfx_cfg.get("glitch_fx", True))
    brand_preset = str(vfx_cfg.get("brand_preset", "tct"))
    show_lower_thirds = (
        False
        if getattr(args, "no_lower_thirds", False)
        else bool(vfx_cfg.get("show_lower_thirds", brand_preset == "tct"))
    )
    show_outro_curtain = (
        False
        if getattr(args, "no_outro", False)
        else bool(vfx_cfg.get("show_outro_curtain", brand_preset == "tct"))
    )

    print(f"====================================================")
    print(f"🎬 RENDERIZANDO PERSONAJE [{args.folder}]: {cfg.get('display_name')}")
    print(f"   Branding    : {brand_preset.upper()} | Glitch + Disimulador: {'ACTIVO' if glitch_fx else 'OFF'}")
    print(f"   Apoyos IA   : {'ON (Textos extraídos abajo)' if show_lower_thirds else 'OFF'} | Cortinilla Salida: {'ON (Sin quitar personaje)' if show_outro_curtain else 'OFF'}")
    print(f"   Música Fondo: {os.path.basename(bgm_file) if bgm_file else 'Ninguna (Clean Audio)'}")
    print(f"====================================================")

    packager = ToonPackager(
        source_video_path=source_vid,
        frame_ladder=ladder,
        background_path=bg_file,
        bgm_path=bgm_file,
        phonetic_mode=phonetic_mode,
        blend_mode=blend_mode,
        hud_top_title=hud_top_title,
        hud_bottom_prefix=hud_bottom_prefix,
        closing_signature=closing_sig,
    )

    pack_dir = os.path.join(folder_path, "character_pack")
    packager.export_character_pack(
        pack_dir,
        character_name=cfg.get("character_id", f"char_{args.folder}"),
        focus_center=focus_center,
    )

    # Obtener el guion y las 5 escenas desde --text o desde el plugin del personaje (ej. tct_plugin.py)
    script_text = args.text
    hud_tag = args.tag or cfg.get("tagline", "TRANSMISIÓN")
    cycle_num = 1
    scenes = None

    plugin_rel = cfg.get("content_plugin")
    if not script_text and plugin_rel:
        plugin_path = os.path.join(folder_path, plugin_rel)
        if os.path.exists(plugin_path):
            spec = importlib.util.spec_from_file_location("char_plugin", plugin_path)
            mod = importlib.util.module_from_spec(spec)
            spec.loader.exec_module(mod)
            payload = mod.generate_daily_payload()
            script_text = payload["script_text"]
            hud_tag = payload["hud_tag"]
            cycle_num = payload.get("cycle", 1)
            scenes = payload.get("scenes")
            if scenes:
                print(f"   ✓ IA Talento con Tarifa extrajo {len(scenes)} escenas ({hud_tag})")

    if not script_text:
        script_text = cfg.get(
            "default_script",
            f"Hola a todos. Soy {cfg.get('display_name')}. Esta es una prueba en tiempo real del motor Toon Maker con sincronización labial de fonemas y cámara dinámica.",
        )

    packager.cycle_num = cycle_num
    char_id = cfg.get("character_id", f"char_{args.folder}")
    out_wav = os.path.join(folder_path, f"demo_{char_id}.wav")
    out_wav2 = os.path.join(folder_path, f"demo_{char_id}_2.wav")
    out_mp4 = args.output or os.path.join(folder_path, f"demo_{char_id}.mp4")
    dsp_preset = voice_cfg.get("dsp_preset", "studio_broadcast" if phonetic_mode else "cyber_krauge")
    engine = voice_cfg.get("engine", "elevenlabs").lower()

    script_text_2 = cfg.get(
        "secondary_script",
        "En este modo de estudio interactivo puedes cambiar entre plano general, plano medio y close-up, o activar tu micrófono para hablar en vivo.",
    )

    v_id = voice_cfg.get("voice_id", "TX3LPaxmHKxFdv7VOQHJ")
    m_id = voice_cfg.get("model_id", "eleven_v4_turbo")

    if scenes and isinstance(scenes, list):
        print(f"1. Sintetizando y sincronizando las {len(scenes)} escenas con ElevenLabs (Voice ID: {v_id} | DSP: {dsp_preset})...")
        scenes = packager.synthesize_scenes_voice(
            scenes,
            out_wav,
            voice_id=v_id,
            model_id=m_id,
            dsp_preset=dsp_preset,
            force_tts=getattr(args, "force_tts", False),
        )
        # Guardar snapshot de las escenas sincronizadas para inspección
        scenes_json_out = os.path.join(folder_path, "latest_tct_scenes.json")
        with open(scenes_json_out, "w", encoding="utf-8") as sf:
            json.dump({"hud_tag": hud_tag, "script_text": script_text, "scenes": scenes}, sf, ensure_ascii=False, indent=2)
        if not os.path.exists(out_wav2):
            packager.synthesize_elevenlabs_voice(
                script_text_2,
                out_wav2,
                voice_id=v_id,
                model_id=m_id,
                dsp_preset=dsp_preset,
            )
    else:
        reuse_existing_wav = (
            not getattr(args, "force_tts", False)
            and not args.text
            and os.path.exists(out_wav)
            and os.path.exists(out_wav2)
        )
        if reuse_existing_wav:
            print(f"1. Reutilizando audios existentes ({os.path.basename(out_wav)} y {os.path.basename(out_wav2)}) — usa --force-tts para regenerar...")
        elif engine == "elevenlabs":
            print(f"1. Sintetizando voz con ElevenLabs (Voice ID: {v_id} | Modelo: {m_id} | DSP: {dsp_preset})...")
            packager.synthesize_elevenlabs_voice(
                script_text,
                out_wav,
                voice_id=v_id,
                model_id=m_id,
                dsp_preset=dsp_preset,
            )
            packager.synthesize_elevenlabs_voice(
                script_text_2,
                out_wav2,
                voice_id=v_id,
                model_id=m_id,
                dsp_preset=dsp_preset,
            )
        else:
            print(f"1. Sintetizando voz ({voice_cfg.get('voice_name')} | DSP: {dsp_preset})...")
            packager.synthesize_rattle_style_voice(
                script_text,
                out_wav,
                voice=voice_cfg.get("voice_name", "es-MX-JorgeNeural"),
                rate=voice_cfg.get("rate", "+4%"),
                pitch=voice_cfg.get("pitch", "-6Hz"),
                dsp_preset=dsp_preset,
            )
            packager.synthesize_rattle_style_voice(
                script_text_2,
                out_wav2,
                voice=voice_cfg.get("voice_name", "es-MX-JorgeNeural"),
                rate=voice_cfg.get("rate", "+4%"),
                pitch=voice_cfg.get("pitch", "-6Hz"),
                dsp_preset=dsp_preset,
            )

    print(f"2. Renderizando video MP4 -> {out_mp4}...")
    packager.render_video(
        clean_voice_wav=out_wav,
        script_text=script_text,
        votd_ref=hud_tag,
        output_mp4_path=out_mp4,
        focus_center_x=focus_center[0],
        rgb_split_px=rgb_split_px,
        show_hud=show_hud,
        show_top_banner=show_top_banner,
        show_subtitles_box=show_subtitles_box,
        show_digital_dust=show_digital_dust,
        glitch_fx=glitch_fx,
        brand_preset=brand_preset,
        scenes=scenes,
        show_lower_thirds=show_lower_thirds,
        show_outro_curtain=show_outro_curtain,
    )
    print(f"✅ ¡Video MP4 completado!: {out_mp4}")

    studio_html = os.path.join(folder_path, f"{char_id}_realtime_studio.html")
    print(f"3. Generando Estudio Interactivo HTML -> {studio_html}...")
    packager.build_realtime_studio_html(
        {
            "demo1": {"wav": out_wav, "text": script_text, "ref": hud_tag},
            "demo2": {"wav": out_wav2, "text": script_text_2, "ref": "MODO ESTUDIO EN VIVO"},
        },
        votd_info={
            "source": cfg.get("display_name", "Talento con Tarifa"),
            "reference": hud_tag,
            "text": script_text,
        },
        output_html_path=studio_html,
        focus_center_x=focus_center[0],
        show_hud=show_hud,
        show_top_banner=show_top_banner,
        show_subtitles_box=show_subtitles_box,
        show_digital_dust=show_digital_dust,
        glitch_fx=glitch_fx,
        brand_preset=brand_preset,
        scenes=scenes,
        show_lower_thirds=show_lower_thirds,
        show_outro_curtain=show_outro_curtain,
    )
    print(f"✅ ¡Estudio HTML listo!: {studio_html}")


def main():
    parser = argparse.ArgumentParser(description="Gestor Universal de Animaciones Toon Maker")
    sub = parser.add_subparsers(dest="cmd")

    sub.add_parser("list", help="Lista todos los personajes configurados")

    p_init = sub.add_parser("init", help="Crea la estructura para un nuevo personaje (ej. 01)")
    p_init.add_argument("folder", help="Nombre de la carpeta (ej. 01)")
    p_init.add_argument("--name", default="NuevoBot", help="Nombre del personaje")

    p_insp = sub.add_parser("inspect", help="Analiza el MP4 en pantalla verde y genera character.json")
    p_insp.add_argument("folder", help="Carpeta del personaje (ej. 01)")
    p_insp.add_argument("--name", default="NuevoBot", help="Nombre del personaje")
    p_insp.add_argument("--force", action="store_true", help="Sobrescribir character.json si existe")

    p_ren = sub.add_parser("render", help="Renderiza un personaje usando su character.json")
    p_ren.add_argument("folder", help="Carpeta del personaje (ej. 00)")
    p_ren.add_argument("--text", default="", help="Texto opcional a pronunciar (si se omite, usa su plugin)")
    p_ren.add_argument("--tag", default="", help="Etiqueta opcional para el visor")
    p_ren.add_argument("--output", default="", help="Ruta de salida opcional para el MP4")
    p_ren.add_argument("--bgm", default="", help="Archivo de música de fondo opcional (.mp3/.wav)")
    p_ren.add_argument("--banner", action="store_true", help="Activar opcionalmente el banner superior")
    p_ren.add_argument("--subtitles", action="store_true", help="Activar opcionalmente el cuadro con texto inferior")
    p_ren.add_argument("--dust", action="store_true", help="Activar opcionalmente el polvo digital")
    p_ren.add_argument("--no-lower-thirds", action="store_true", help="Desactivar apoyos visuales de textos extraídos")
    p_ren.add_argument("--no-outro", action="store_true", help="Desactivar cortinilla de salida")
    p_ren.add_argument("--force-tts", action="store_true", help="Forzar regeneración de audio TTS con ElevenLabs")

    args = parser.parse_args()
    if args.cmd == "list" or not args.cmd:
        cmd_list(args)
    elif args.cmd == "init":
        cmd_init(args)
    elif args.cmd == "inspect":
        cmd_inspect(args)
    elif args.cmd == "render":
        cmd_render(args)


if __name__ == "__main__":
    main()
