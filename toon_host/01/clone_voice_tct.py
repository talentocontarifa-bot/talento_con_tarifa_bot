# -*- coding: utf-8 -*-
"""
clone_voice_tct.py — Clonación de Voz 100% Local (Chatterbox V3 es-mx-latam) para Talento con Tarifa
====================================================================================================
Clona la voz de referencia `rufino_ref_10s.wav` usando PyTorch + `ChatterboxMultilingualTTS`
con el checkpoint oficial de Español de México (`ResembleAI/Chatterbox-Multilingual-es-mx-latam`:
`t3_es_mx_latam.safetensors` + `s3gen_v3.pt`) en una sola carga de modelo por lote (batch), con:
- Expresividad equilibrada para acento mexicano natural (`exaggeration=0.56, cfg_weight=0.50, temperature=0.68`).
- Recorte automático del último token degradado antes de EOS (~40ms) para eliminar colas de ruido.
- Procesador DSP de Locución de Radio FM (Filtro subsónico 70Hz, cuerpo 125Hz, corte boxy 320Hz,
  presencia broadcast 3.2kHz, aire 7.5kHz, compresión suave 3.2:1 y Loudnorm -14.0 LUFS / LRA 6).
"""

import os
import sys
import json
import types
import shutil
import hashlib
import argparse
import subprocess
from pathlib import Path

if sys.platform == "win32":
    try:
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
        sys.stderr.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass

THIS_DIR = os.path.dirname(os.path.abspath(__file__))
DEFAULT_REF_WAV = os.path.join(THIS_DIR, "rufino_ref_10s.wav")
CACHE_DIR = os.path.join(THIS_DIR, "voice_cache", "chatterbox_rufino")

BASE_REPO_ID = "ResembleAI/chatterbox"
ES_MX_REPO_ID = "ResembleAI/Chatterbox-Multilingual-es-mx-latam"
T3_ES_MX_FILENAME = "t3_es_mx_latam.safetensors"
S3GEN_V3_FILENAME = "s3gen_v3.pt"
TOKENIZER_FILENAME = "grapheme_mtl_merged_expanded_v1.json"

# Parámetros de expresividad emocional de Chatterbox V3 es-mx-latam
EMOTION_EXAGGERATION = float(os.environ.get("CHATTERBOX_EXAGGERATION", "0.56"))
EMOTION_CFG_WEIGHT = float(os.environ.get("CHATTERBOX_CFG_WEIGHT", "0.50"))
EMOTION_TEMPERATURE = float(os.environ.get("CHATTERBOX_TEMPERATURE", "0.68"))


def _ensure_torchaudio_compat():
    """Evita fallo de DLL en Windows si torchaudio o resemble-perth tienen desajuste binario."""
    try:
        import torchaudio  # noqa: F401
    except OSError:
        dummy = types.ModuleType("torchaudio")
        dummy.__version__ = "2.6.0"
        dummy.transforms = types.ModuleType("torchaudio.transforms")
        dummy.functional = types.ModuleType("torchaudio.functional")
        dummy.compliance = types.ModuleType("torchaudio.compliance")
        dummy.compliance.kaldi = types.ModuleType("torchaudio.compliance.kaldi")
        sys.modules["torchaudio"] = dummy
        sys.modules["torchaudio.transforms"] = dummy.transforms
        sys.modules["torchaudio.functional"] = dummy.functional
        sys.modules["torchaudio.compliance"] = dummy.compliance
        sys.modules["torchaudio.compliance.kaldi"] = dummy.compliance.kaldi
    try:
        import perth
        if getattr(perth, "PerthImplicitWatermarker", None) is None:
            perth.PerthImplicitWatermarker = getattr(
                perth,
                "DummyWatermarker",
                type("DummyWatermarker", (), {"apply_watermark": lambda self, wav, sample_rate=None: wav}),
            )
    except Exception:
        pass


def load_chatterbox_v3_es_mx(device="cpu"):
    """
    Carga ChatterboxMultilingualTTS inyectando los pesos oficiales V3 dedicados a
    Español de México / Latinoamérica (`t3_es_mx_latam.safetensors` + `s3gen_v3.pt`).
    Solo descarga los ~3.05 GB necesarios (sin duplicar los pesos V2 antiguos).
    """
    _ensure_torchaudio_compat()
    import torch
    from huggingface_hub import hf_hub_download
    from safetensors.torch import load_file as load_safetensors
    from chatterbox.mtl_tts import ChatterboxMultilingualTTS, Conditionals
    from chatterbox.models.voice_encoder import VoiceEncoder
    from chatterbox.models.t3 import T3
    from chatterbox.models.t3.modules.t3_config import T3Config
    from chatterbox.models.s3gen import S3Gen
    from chatterbox.models.tokenizers import MTLTokenizer

    token = os.getenv("HF_TOKEN")
    map_location = torch.device("cpu") if device in ["cpu", "mps"] else None

    ve_path = Path(hf_hub_download(repo_id=BASE_REPO_ID, filename="ve.pt", token=token))
    tok_path = Path(hf_hub_download(repo_id=BASE_REPO_ID, filename=TOKENIZER_FILENAME, token=token))
    conds_path = Path(hf_hub_download(repo_id=BASE_REPO_ID, filename="conds.pt", token=token))
    # MTLTokenizer busca Cangjie5_TC.json junto al tokenizer
    cangjie_path = Path(hf_hub_download(repo_id=BASE_REPO_ID, filename="Cangjie5_TC.json", token=token))
    sibling_cangjie = tok_path.parent / "Cangjie5_TC.json"
    if not sibling_cangjie.exists() and cangjie_path.exists():
        try:
            shutil.copyfile(cangjie_path, sibling_cangjie)
        except Exception:
            pass

    t3_path = Path(hf_hub_download(repo_id=ES_MX_REPO_ID, filename=T3_ES_MX_FILENAME, token=token))
    s3gen_path = Path(hf_hub_download(repo_id=ES_MX_REPO_ID, filename=S3GEN_V3_FILENAME, token=token))

    ve = VoiceEncoder()
    ve.load_state_dict(torch.load(ve_path, map_location=map_location, weights_only=True))
    ve.to(device).eval()

    t3 = T3(T3Config.multilingual())
    t3_state = load_safetensors(t3_path)
    if "model" in t3_state.keys():
        t3_state = t3_state["model"][0]
    t3.load_state_dict(t3_state)
    t3.to(device).eval()

    s3gen = S3Gen()
    s3gen.load_state_dict(
        torch.load(s3gen_path, map_location=map_location, weights_only=True),
        strict=False,
    )
    s3gen.to(device).eval()

    tokenizer = MTLTokenizer(str(tok_path))
    conds = None
    if conds_path.exists():
        conds = Conditionals.load(conds_path, map_location=map_location).to(device)

    return ChatterboxMultilingualTTS(t3, s3gen, ve, tokenizer, device, conds=conds)


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
            f"rufino_radio_v3_esmx|{ref_tag}|ex={EMOTION_EXAGGERATION}|cfg={EMOTION_CFG_WEIGHT}|{text}".encode("utf-8")
        ).hexdigest()[:16]
        cached_file = os.path.join(CACHE_DIR, f"cloned_{h_key}{ext}")

        if os.path.isfile(cached_file) and os.path.getsize(cached_file) > 1000:
            print(f"  ⚡ [Chatterbox V3 Cache] Escena {idx+1} recuperada de caché ({h_key})")
            shutil.copyfile(cached_file, out_path)
            continue

        if local_model is None:
            _ensure_torchaudio_compat()
            import torch

            torch_mod = torch
            device = "cuda" if torch.cuda.is_available() else "cpu"
            print(
                f"  🎙️ [Chatterbox V3 es-mx-latam] Cargando modelo en {device.upper()} "
                f"(exaggeration={EMOTION_EXAGGERATION}, cfg={EMOTION_CFG_WEIGHT}) con {os.path.basename(ref_wav_path)}..."
            )
            local_model = load_chatterbox_v3_es_mx(device=device)
            local_model.prepare_conditionals(ref_wav_path, exaggeration=EMOTION_EXAGGERATION)

        import wave
        import numpy as np

        # Evitar que punc_norm convierta ':' en ',' provocando titubeo intermedio
        clean_text = text.replace(":", ".")
        print(f"  🎙️ [Chatterbox V3 es-mx-latam] Clonando voz expresiva para Escena {idx+1}/{len(items)}...")
        torch_mod.manual_seed(42)
        wav_tensor = local_model.generate(
            text=clean_text,
            language_id="es",
            audio_prompt_path=None,  # Reutiliza los conditionals de ref_wav_path
            exaggeration=EMOTION_EXAGGERATION,
            cfg_weight=EMOTION_CFG_WEIGHT,
            temperature=EMOTION_TEMPERATURE,
        )
        raw_tmp = os.path.join(CACHE_DIR, f"_raw_{h_key}.wav")
        wav_np = wav_tensor.squeeze().detach().cpu().numpy()

        # Recortar el último token degradado antes de EOS (~40ms = 960 muestras a 24kHz) como en V3 oficial
        trim_samples = int(local_model.sr // 25)
        if len(wav_np) > trim_samples * 4:
            wav_np = wav_np[:-trim_samples]

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
    parser = argparse.ArgumentParser(description="Clonador de voz local Chatterbox V3 es-mx-latam para Talento con Tarifa")
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
