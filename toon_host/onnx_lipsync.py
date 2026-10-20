"""
onnx_lipsync.py — Motor Ultraligero ONNX (FeatherTalk + FeatherHuBERT) para Talento con Tarifa
==============================================================================================
Reemplaza el salto entre 16 frames estáticos por síntesis neuronal continua cuadro por cuadro
en CPU pura (~40+ FPS, ~27 MB en total entre audio encoder y generador visual MobileOne UNet).
"""

import os
import subprocess
import time
import wave
import cv2
import numpy as np


FACE_CROP_SIZE = 152
FACE_INNER_SIZE = 144
FACE_BORDER = 4
GEOMETRY_BASE_SIZE = 160
MASK_RECT = (5, 5, 150, 145)


def mask_mouth_144(img: np.ndarray) -> np.ndarray:
    scale = FACE_INNER_SIZE / float(GEOMETRY_BASE_SIZE)
    x, y, width, height = MASK_RECT
    rect = (
        round(x * scale),
        round(y * scale),
        round(width * scale),
        round(height * scale),
    )
    return cv2.rectangle(img, rect, (0, 0, 0), -1)


class OnnxLipSyncEngine:
    def __init__(
        self,
        source_video_path: str,
        onnx_dir: str,
        ffmpeg_path: str = "ffmpeg",
        num_threads: int = 4,
    ):
        import onnxruntime as ort

        self.source_video_path = source_video_path
        self.onnx_dir = onnx_dir
        self.ffmpeg_path = ffmpeg_path

        hubert_path = os.path.join(onnx_dir, "feather_hubert.onnx")
        unet_path = os.path.join(onnx_dir, "feathertalk_144.onnx")
        bboxes_path = os.path.join(onnx_dir, "bboxes_240.npy")

        if not os.path.exists(hubert_path) or not os.path.exists(unet_path):
            raise FileNotFoundError(f"No se encontraron los modelos ONNX en: {onnx_dir}")
        if not os.path.exists(bboxes_path):
            raise FileNotFoundError(f"No se encontró bboxes_240.npy en: {onnx_dir}")

        sess_opts = ort.SessionOptions()
        sess_opts.intra_op_num_threads = num_threads
        sess_opts.graph_optimization_level = ort.GraphOptimizationLevel.ORT_ENABLE_ALL

        self.hubert_sess = ort.InferenceSession(
            hubert_path, sess_options=sess_opts, providers=["CPUExecutionProvider"]
        )
        self.unet_sess = ort.InferenceSession(
            unet_path, sess_options=sess_opts, providers=["CPUExecutionProvider"]
        )
        self.bboxes = np.load(bboxes_path)

        # Cargar frames base del video green screen de Rufino
        cap = cv2.VideoCapture(source_video_path)
        self.base_frames_bgr = []
        while True:
            ret, f = cap.read()
            if not ret:
                break
            self.base_frames_bgr.append(f)
        cap.release()

        if not self.base_frames_bgr:
            raise ValueError(f"No se pudieron leer frames de {source_video_path}")

        self.H, self.W = self.base_frames_bgr[0].shape[:2]
        self.num_base = min(len(self.base_frames_bgr), len(self.bboxes))
        self._rgba_cache = {}

    def _load_16k_norm_waveform(self, audio_path: str) -> np.ndarray:
        tmp_16k = audio_path + ".tmp16k_onnx.wav"
        subprocess.run(
            [
                self.ffmpeg_path,
                "-y",
                "-i",
                audio_path,
                "-ac",
                "1",
                "-ar",
                "16000",
                "-c:a",
                "pcm_s16le",
                tmp_16k,
            ],
            check=True,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )
        try:
            with wave.open(tmp_16k, "rb") as wf:
                pcm = np.frombuffer(wf.readframes(wf.getnframes()), dtype=np.int16)
            wav_f32 = pcm.astype(np.float32) / 32768.0
        finally:
            if os.path.exists(tmp_16k):
                try:
                    os.remove(tmp_16k)
                except Exception:
                    pass

        # Normalización obligatoria de media=0 y varianza=1 para FeatherHuBERT
        mean = wav_f32.mean()
        var = wav_f32.var()
        return ((wav_f32 - mean) / np.sqrt(var + 1e-7)).astype(np.float32)

    def extract_audio_features_25fps(self, audio_path: str) -> np.ndarray:
        """
        Ejecuta feather_hubert.onnx sobre el audio completo (en bloques de hasta 20s para cuidar RAM)
        y devuelve tensor [T_25fps, 2, 1024].
        """
        wav_norm = self._load_16k_norm_waveform(audio_path)
        sr = 16000
        chunk_samples = sr * 20
        overlap_samples = sr * 1

        hubert_in_name = self.hubert_sess.get_inputs()[0].name
        if len(wav_norm) <= chunk_samples:
            feat = self.hubert_sess.run(None, {hubert_in_name: wav_norm.reshape(1, -1)})[0]
            feat = feat.squeeze(0)  # [T_50hz, 1024]
        else:
            chunks_out = []
            pos = 0
            while pos < len(wav_norm):
                end = min(len(wav_norm), pos + chunk_samples)
                seg = wav_norm[pos:end]
                seg = (seg - seg.mean()) / np.sqrt(seg.var() + 1e-7)
                f_seg = self.hubert_sess.run(None, {hubert_in_name: seg.astype(np.float32).reshape(1, -1)})[0].squeeze(0)
                if pos == 0:
                    chunks_out.append(f_seg)
                else:
                    drop_steps = 50
                    chunks_out.append(f_seg[drop_steps:])
                if end >= len(wav_norm):
                    break
                pos = end - overlap_samples
            feat = np.concatenate(chunks_out, axis=0)

        if feat.shape[0] % 2 == 1:
            feat = feat[:-1]
        return feat.reshape(-1, 2, 1024).astype(np.float32)

    def _get_audio_window(self, features_25fps: np.ndarray, idx_25fps: int) -> np.ndarray:
        """Extrae la ventana [1, 40, 1024] centrada en idx_25fps."""
        n_total = features_25fps.shape[0]
        left = idx_25fps - 10
        right = idx_25fps + 10
        pad_left = max(0, -left)
        pad_right = max(0, right - n_total)
        clamped_left = max(0, left)
        clamped_right = min(n_total, right)

        win = features_25fps[clamped_left:clamped_right]
        if pad_left > 0:
            win = np.concatenate([np.zeros((pad_left, 2, 1024), dtype=np.float32), win], axis=0)
        if pad_right > 0:
            win = np.concatenate([win, np.zeros((pad_right, 2, 1024), dtype=np.float32)], axis=0)
        return win.reshape(1, 40, 1024)

    def _get_base_rgba(self, base_idx: int, key_fn) -> np.ndarray:
        if base_idx not in self._rgba_cache:
            self._rgba_cache[base_idx] = key_fn(self.base_frames_bgr[base_idx])
        return self._rgba_cache[base_idx]

    def synthesize_rgba_frames(
        self,
        clean_voice_wav: str,
        total_vframes: int,
        fps: int,
        key_frame_fn,
    ):
        """
        Genera la secuencia completa de frames RGBA (720x1280x4) sincronizados con el audio
        usando FeatherHuBERT + FeatherTalk MobileOne UNet 144x144 en ONNX.
        """
        t0 = time.perf_counter()
        feats_25 = self.extract_audio_features_25fps(clean_voice_wav)
        t_hu = time.perf_counter() - t0

        out_rgba_frames = []
        pingpong_idx = 0
        step_dir = 1

        for i in range(total_vframes):
            t_sec = i / float(fps)
            idx_25 = min(feats_25.shape[0] - 1, int(round(t_sec * 25.0)))
            aud_win = self._get_audio_window(feats_25, idx_25)

            base_bgr = self.base_frames_bgr[pingpong_idx]
            base_rgba = self._get_base_rgba(pingpong_idx, key_frame_fn).copy()
            xmin, ymin, xmax, ymax = [int(v) for v in self.bboxes[pingpong_idx]]

            region = base_bgr[ymin:ymax, xmin:xmax]
            crop_h, crop_w = region.shape[:2]
            face_crop = cv2.resize(region, (FACE_CROP_SIZE, FACE_CROP_SIZE), interpolation=cv2.INTER_AREA)
            inner = face_crop[
                FACE_BORDER : FACE_BORDER + FACE_INNER_SIZE,
                FACE_BORDER : FACE_BORDER + FACE_INNER_SIZE,
            ].copy()

            masked = mask_mouth_144(inner.copy())
            inp_chw = (
                np.concatenate([inner, masked], axis=2)
                .transpose(2, 0, 1)
                .astype(np.float32)[None, ...]
                / 255.0
            )
            pred = self.unet_sess.run(None, {"input": inp_chw, "audio": aud_win})[0]
            pred_u8 = np.clip(pred[0].transpose(1, 2, 0) * 255.0, 0, 255).astype(np.uint8)

            face_crop[
                FACE_BORDER : FACE_BORDER + FACE_INNER_SIZE,
                FACE_BORDER : FACE_BORDER + FACE_INNER_SIZE,
            ] = pred_u8
            pasted_crop = cv2.resize(face_crop, (crop_w, crop_h))
            base_rgba[ymin:ymax, xmin:xmax, :3] = pasted_crop

            out_rgba_frames.append(base_rgba)

            if pingpong_idx >= self.num_base - 1:
                step_dir = -1
            elif pingpong_idx <= 0:
                step_dir = 1
            pingpong_idx += step_dir

        t_total = time.perf_counter() - t0
        fps_achieved = total_vframes / max(1e-3, t_total)
        print(
            f"   ⚡ [ONNX Lip-Sync] {total_vframes} frames sintetizados en {t_total:.2f}s "
            f"({fps_achieved:.1f} FPS | Audio encoder: {t_hu:.2f}s)"
        )
        return out_rgba_frames
