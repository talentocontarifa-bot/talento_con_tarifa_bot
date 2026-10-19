# -*- coding: utf-8 -*-
"""
clone_voice_tct.py — Clonación de Voz 100% Local (ChatterboxMultilingualTTS) para Talento con Tarifa
====================================================================================================
Clona la voz de referencia `rufino_ref_10s.wav` usando PyTorch + `ChatterboxMultilingualTTS`
en una sola carga de modelo por lote (batch), con:
- Intensidad emocional alta (exaggeration=0.84, cfg_weight=0.36, temperature=0.78).
- Procesador DSP de Locución de Radio FM (Efecto proximidad SM7B 115Hz, corte boxy 320Hz,
  presencia broadcast 3.2kHz, aire 7.5kHz, Doble Compresión en Serie 4.5:1 + 6.5:1 y Loudnorm -12.5 LUFS / LRA 4).
"""

import os
import sys
import json
import shutil
import hashlib
import argparse
import subprocess

if sys.platform == "win32":
    try:
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
        sys.stderr.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass

THIS_DIR = os.path.dirname(os.path.abspath(__file__))
DEFAULT_REF_WAV = os.path.join(THIS_DIR, "rufino_ref_10s.wav")
CACHE_DIR = os.path.join(THIS_DIR, "voice_cache", "chatterbox_rufino")

# Parámetros de expresividad emocional de Chatterbox (equilibrados para evitar forcing EOS / colas arrastradas)
EMOTION_EXAGGERATION = float(os.environ.get("CHATTERBOX_EXAGGERATION", "0.56"))
EMOTION_CFG_WEIGHT = float(os.environ.get("CHATTERBOX_CFG_WEIGHT", "0.50"))
EMOTION_TEMPERATURE = float(os.environ.get("CHATTERBOX_TEMPERATURE", "0.68"))


def master_audio(raw_wav, out_path, ffmpeg_bin="ffmpeg"):
    """
    Cadena DSP de Estudio Suavizada (100% FFmpeg nativo en GitHub Actions):
    1. Filtro subsónico suave a 70Hz.
    2. Cuerpo cálido moderado (125Hz +2.0dB) + limpieza ligera de encajonamiento (320Hz -1.5dB).
    3. Presencia natural (3200Hz +2.0dB) + aire suave (7500Hz +1.5dB, lowpass abierto a 16kHz).
    4. Una sola etapa de compresión suave (3.2:1) para conservar dinámica natural sin aplastar la voz.
    5. Normalización broadcast limpia (-14.0 LUFS, True Peak -1.0dB, LRA=6).
    """
    ext = os.path.splitext(out_path)[1].lower()
    af_chain = (
        "highpass=f=70:poles=2,"
        "equalizer=f=125:width_type=q:width=1.2:g=2.0,"
        "equalizer=f=320:width_type=q:width=1.8:g=-1.5,"
        "equalizer=f=3200:width_type=q:width=1.2:g=2.0,"
        "treble=g=1.5:f=7500,"
        "lowpass=f=16000,"
        "acompressor=threshold=-20dB:ratio=3.2:attack=8:release=100:knee=4:makeup=2.5dB,"
        "loudnorm=I=-14.0:TP=-1.0:LRA=6"
    )
    cmd = [ffmpeg_bin, "-y", "-i", raw_wav, "-af", af_chain, "-ac", "1"]
    if ext == ".wav":
        cmd += ["-ar", "24000", "-c:a", "pcm_s16le", out_path]
    else:
        cmd += ["-ar", "48000", "-c:a", "libmp3lame", "-b:a", "192k", out_path]

    subprocess.run(cmd, check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)


def synthesize_batch(items, ref_wav_path=DEFAULT_REF_WAV, ffmpeg_bin="ffmpeg"):
    if not os.path.isfile(ref_wav_path):
        raise FileNotFoundError(f"No se encontró el archivo de referencia de voz: {ref_wav_path}")

    os.makedirs(CACHE_DIR, exist_ok=True)
    local_model = None
    torch_mod = None

    for idx, item in enumerate(items):
        text = (item.get("text") or "").strip()
        out_path = item.get("output")
        if not text or not out_path:
            continue

        os.makedirs(os.path.dirname(os.path.abspath(out_path)), exist_ok=True)
        ext = os.path.splitext(out_path)[1].lower() or ".mp3"
        ref_tag = os.path.basename(ref_wav_path)
        h_key = hashlib.sha256(
            f"rufino_radio_v2|{ref_tag}|ex={EMOTION_EXAGGERATION}|cfg={EMOTION_CFG_WEIGHT}|{text}".encode("utf-8")
        ).hexdigest()[:16]
        cached_file = os.path.join(CACHE_DIR, f"cloned_{h_key}{ext}")

        if os.path.isfile(cached_file) and os.path.getsize(cached_file) > 1000:
            print(f"  ⚡ [Chatterbox Cache] Escena {idx+1} recuperada de caché ({h_key})")
            shutil.copyfile(cached_file, out_path)
            continue

        if local_model is None:
            import torch
            from chatterbox.mtl_tts import ChatterboxMultilingualTTS

            torch_mod = torch
            device = "cuda" if torch.cuda.is_available() else "cpu"
            print(
                f"  🎙️ [Chatterbox Radio] Cargando modelo en {device.upper()} "
                f"(exaggeration={EMOTION_EXAGGERATION}, cfg={EMOTION_CFG_WEIGHT}) con {os.path.basename(ref_wav_path)}..."
            )
            local_model = ChatterboxMultilingualTTS.from_pretrained(device=device)
            local_model.prepare_conditionals(ref_wav_path, exaggeration=EMOTION_EXAGGERATION)

        import wave
        import numpy as np

        print(f"  🎙️ [Chatterbox Radio] Clonando voz expresiva de Rufino para Escena {idx+1}/{len(items)}...")
        torch_mod.manual_seed(42)
        wav_tensor = local_model.generate(
            text=text,
            language_id="es",
            audio_prompt_path=None,  # Reutiliza los conditionals de rufino_ref_10s.wav
            exaggeration=EMOTION_EXAGGERATION,
            cfg_weight=EMOTION_CFG_WEIGHT,
            temperature=EMOTION_TEMPERATURE,
        )
        raw_tmp = os.path.join(CACHE_DIR, f"_raw_{h_key}.wav")
        wav_np = wav_tensor.squeeze().detach().cpu().numpy()
        pcm16 = (np.clip(wav_np, -1.0, 1.0) * 32767.0).astype(np.int16)
        with wave.open(raw_tmp, "wb") as wf:
            wf.setnchannels(1)
            wf.setsampwidth(2)
            wf.setframerate(int(local_model.sr))
            wf.writeframes(pcm16.tobytes())

        master_audio(raw_tmp, cached_file, ffmpeg_bin=ffmpeg_bin)
        if os.path.exists(raw_tmp):
            os.remove(raw_tmp)

        shutil.copyfile(cached_file, out_path)


def main():
    parser = argparse.ArgumentParser(description="Clonador de voz local Chatterbox Radio FM para Talento con Tarifa")
    parser.add_argument("--batch-json", help="Ruta a JSON con lista de [{'text': ..., 'output': ...}]")
    parser.add_argument("--text", help="Texto individual a sintetizar")
    parser.add_argument("--output", help="Ruta de salida para texto individual")
    parser.add_argument("--ref-wav", default=DEFAULT_REF_WAV, help="Ruta al WAV de referencia (10s)")
    parser.add_argument("--ffmpeg", default=os.environ.get("FFMPEG_PATH", "ffmpeg"), help="Binario de ffmpeg")
    args = parser.parse_args()

    items = []
    if args.batch_json:
        with open(args.batch_json, "r", encoding="utf-8") as f:
            items = json.load(f)
    elif args.text and args.output:
        items = [{"text": args.text, "output": args.output}]
    else:
        parser.error("Debes especificar --batch-json o bien --text y --output")

    synthesize_batch(items, ref_wav_path=args.ref_wav, ffmpeg_bin=args.ffmpeg)


if __name__ == "__main__":
    main()
