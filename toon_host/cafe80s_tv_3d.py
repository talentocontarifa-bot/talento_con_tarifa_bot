"""
cafe80s_tv_3d.py — Motor 3D Real (Three.js WebGL + Respaldo Perspectiva 3D OpenCV)
===================================================================================
Inspirado en la televisión JVC del 'Café 80's' de Back to the Future Part II:
- El video del personaje vive EXCLUSIVAMENTE adentro del tubo CRT curvo 3D (estilo Max Headroom).
- Carcasa 3D completa en Three.js:
  * Viseras / aletas laterales trapezoidales rojas/burdeos con filetes #CCFF00 y dorado.
  * Corona triangular superior perforada con 3 agujeros circulares (fiel al Café 80's).
  * Bandeja inferior roja de diner con franja amarilla/lima y botella de vidrio 3D con popote.
  * Brazo mecánico de techo con cardán 3D y cables en espiral.
- Movimiento 3D real:
  * Balanceo físico de péndulo en 3 ejes (rotX, rotY, rotZ) + micro-impulso reactivo a la voz.
  * Coreografía de cámara 3D de 5 escenas (Dolly-In, Órbita 3/4 Izquierda, Contrapicado Hero,
    Close-Up Lateral Derecho y Pull-Back para la Cortinilla Final).
- Sincronización labial Rhubarb Lip Sync (-r phonetic) + Pre-roll óptico de +40ms.
"""

import os
import sys
import json
import math
import base64
import subprocess
import cv2
import numpy as np


def build_cafe80s_threejs_html(
    payload_dict,
    three_js_code="",
    lcd_font_b64="",
    offline_render_mode=False,
):
    """
    Genera el documento HTML completo con Three.js WebGL real para:
    1) El Estudio Interactivo en Tiempo Real (con controles de cámara 3D, micrófono y demos).
    2) El Renderizador Offline Determinista Cuadro-a-Cuadro (cuando offline_render_mode=True)
       para exportar MP4 a 24/30 FPS con precisión exacta de milisegundos.
    """
    payload_json = json.dumps(payload_dict, ensure_ascii=False)

    three_script_tag = (
        f"<script>{three_js_code}</script>"
        if three_js_code
        else '<script src="https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js"></script>'
    )

    body_class = "offline-mode" if offline_render_mode else "studio-mode"

    html = f"""<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>Talento con Tarifa — Café 80's 3D TV Studio (Three.js WebGL + Rhubarb Lip-Sync)</title>
{three_script_tag}
<style>
  @font-face {{
    font-family: 'VT323LCD';
    src: url('data:font/truetype;base64,{lcd_font_b64}') format('truetype');
  }}
  :root {{
    --bg: #07080c;
    --panel: #10131a;
    --border: #283322;
    --accent: #CCFF00;
    --cyan: #00f0ff;
    --crimson: #8a151b;
    --text: #F0F0F0;
    --muted: #98a88e;
  }}
  * {{ box-sizing: border-box; margin: 0; padding: 0; }}
  body.studio-mode {{
    background: var(--bg);
    color: var(--text);
    font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    min-height: 100vh;
    display: flex;
    flex-direction: column;
    align-items: center;
    padding: 16px;
  }}
  body.offline-mode {{
    background: #000;
    overflow: hidden;
    margin: 0;
    padding: 0;
  }}
  body.offline-mode header,
  body.offline-mode .controls-card,
  body.offline-mode .stage-footer {{
    display: none !important;
  }}
  body.offline-mode .workspace {{
    display: block;
    width: 720px;
    height: 1280px;
    max-width: none;
  }}
  body.offline-mode .stage-card {{
    padding: 0;
    border: none;
    border-radius: 0;
    background: transparent;
    box-shadow: none;
  }}
  body.offline-mode canvas#stage {{
    width: 720px !important;
    height: 1280px !important;
    max-width: none !important;
    border: none !important;
    border-radius: 0 !important;
  }}
  header {{
    width: 100%;
    max-width: 1280px;
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 14px 20px;
    background: var(--panel);
    border: 2px solid var(--accent);
    border-radius: 14px;
    margin-bottom: 16px;
    box-shadow: 6px 6px 0 #000;
  }}
  header h1 {{
    font-size: 1.12rem;
    font-weight: 900;
    color: var(--accent);
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }}
  .badge {{
    background: var(--accent);
    color: #000;
    border: 2px solid #000;
    font-size: 0.76rem;
    padding: 4px 12px;
    font-weight: 900;
    text-transform: uppercase;
  }}
  .workspace {{
    width: 100%;
    max-width: 1280px;
    display: grid;
    grid-template-columns: 440px 1fr;
    gap: 18px;
    align-items: start;
  }}
  @media (max-width: 960px) {{ .workspace {{ grid-template-columns: 1fr; }} }}
  .stage-card {{
    background: var(--panel);
    border: 1px solid var(--border);
    border-radius: 16px;
    padding: 14px;
    display: flex;
    flex-direction: column;
    align-items: center;
    box-shadow: 0 18px 45px rgba(0,0,0,0.85);
  }}
  canvas#stage {{
    width: 100%;
    max-width: 410px;
    aspect-ratio: 9 / 16;
    border-radius: 12px;
    background: #080a08;
    display: block;
    border: 2px solid var(--accent);
  }}
  .controls-card {{
    background: var(--panel);
    border: 1px solid var(--border);
    border-radius: 16px;
    padding: 20px;
    display: flex;
    flex-direction: column;
    gap: 15px;
  }}
  .section-title {{
    font-size: 0.78rem;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: var(--accent);
    margin-bottom: 8px;
    font-weight: 800;
  }}
  .votd-card {{
    background: rgba(204, 255, 0, 0.08);
    border: 1px solid rgba(204, 255, 0, 0.35);
    border-radius: 12px;
    padding: 12px 14px;
    font-size: 0.86rem;
    line-height: 1.45;
  }}
  .votd-card strong {{ color: var(--accent); }}
  .row {{ display: flex; gap: 10px; flex-wrap: wrap; align-items: center; }}
  textarea {{
    width: 100%;
    background: #070a07;
    border: 1px solid var(--border);
    color: var(--accent);
    font-family: 'VT323LCD', monospace;
    border-radius: 10px;
    padding: 10px 12px;
    font-size: 1.28rem;
    letter-spacing: 1px;
    min-height: 60px;
    outline: none;
  }}
  button, .file-btn {{
    cursor: pointer;
    border: none;
    border-radius: 10px;
    padding: 10px 14px;
    font-size: 0.82rem;
    font-weight: 700;
    transition: all 0.15s ease;
    display: inline-flex;
    align-items: center;
    gap: 8px;
  }}
  .btn-primary {{
    background: var(--accent);
    color: #000;
    border: 2px solid #000;
    box-shadow: 4px 4px 0 #F0F0F0;
    font-weight: 900;
  }}
  .btn-primary:hover {{ filter: brightness(1.08); transform: translateY(-1px); }}
  .btn-secondary {{ background: #182015; color: var(--text); border: 1px solid var(--border); }}
  .btn-secondary:hover {{ background: #222e1d; }}
  .btn-secondary.active {{
    background: rgba(204, 255, 0, 0.18);
    border-color: var(--accent);
    color: var(--accent);
  }}
  .btn-mic.active {{ background: #ff2a55; color: #fff; border-color: #ff2a55; }}
  .hud-grid {{
    display: grid;
    grid-template-columns: repeat(8, 1fr);
    gap: 6px;
    margin-top: 6px;
  }}
  .hud-cell {{
    background: #070a07;
    border: 2px solid #24301e;
    border-radius: 8px;
    overflow: hidden;
    text-align: center;
    padding-bottom: 3px;
  }}
  .hud-cell.active {{
    border-color: var(--accent);
    box-shadow: 0 0 12px rgba(204, 255, 0, 0.65);
    transform: translateY(-2px);
  }}
  .hud-cell img {{
    width: 100%;
    aspect-ratio: 1 / 1.05;
    object-fit: cover;
    object-position: 50% 16%;
    display: block;
    background: radial-gradient(circle, #1f2b18 0%, #060806 100%);
  }}
  .hud-cell span {{
    font-size: 0.62rem;
    font-weight: 700;
    color: var(--muted);
    display: block;
    margin-top: 2px;
  }}
  .hud-cell.active span {{ color: var(--accent); }}
  .meter-bar {{
    height: 8px;
    background: #070a07;
    border-radius: 999px;
    overflow: hidden;
    margin-top: 6px;
  }}
  .meter-fill {{
    height: 100%;
    width: 0%;
    background: linear-gradient(90deg, #CCFF00, #00e5ff, #ff0055);
  }}
  .status-line {{
    font-size: 0.78rem;
    color: var(--muted);
    display: flex;
    justify-content: space-between;
    width: 100%;
    margin-top: 10px;
  }}
</style>
</head>
<body class="{body_class}">

<header>
  <div>
    <h1>⚡ TALENTO CON TARIFA // CAFÉ 80'S 3D CRT TELEVISION (THREE.JS)</h1>
  </div>
  <div class="badge">THREE.JS 3D + RHUBARB LIP-SYNC (+40MS PRE-ROLL)</div>
</header>

<div class="workspace">
  <div class="stage-card">
    <canvas id="stage" width="720" height="1280"></canvas>
    <div class="status-line stage-footer">
      <span id="statusText">Tele 3D Café 80's lista (Three.js WebGL).</span>
      <span id="fpsCounter">30 FPS | 3D CRT RIG</span>
    </div>
  </div>

  <div class="controls-card">
    <div>
      <div class="section-title">1. Transmisión Café 80's (Max Headroom CRT + Rhubarb Lip-Sync)</div>
      <div class="votd-card">
        <strong>Tema Activo (<span id="payloadRefDisplay"></span>):</strong><br/>
        <span id="votdTextDisplay"></span>
      </div>
    </div>

    <div>
      <div class="section-title">2. Controles de Audio y Micrófono en Vivo</div>
      <div class="row">
        <button class="btn-primary" onclick="playDemo('demo1')">▶️ Reproducir Noticia IA en la Tele 3D</button>
        <button class="btn-secondary" onclick="playDemo('demo2')">🎬 Demo Estudio 2</button>
        <button id="btnMic" class="btn-secondary btn-mic" onclick="toggleMicrophone()">🎙️ Hablar en Vivo en la Tele 3D</button>
      </div>
      <div class="meter-bar"><div id="volMeter" class="meter-fill"></div></div>
    </div>

    <div>
      <div class="section-title">3. Movimiento de Cámara 3D (Three.js) y Encuadre Interno CRT</div>
      <div class="row" id="cam-buttons">
        <button class="btn-secondary active" onclick="setCamera('AUTO', this)">🤖 Auto-Director 3D (5 Ángulos)</button>
        <button class="btn-secondary" onclick="setCamera('FULL', this)">📺 Plano Diner 80's</button>
        <button class="btn-secondary" onclick="setCamera('MEDIUM', this)">📐 Órbita 3/4 Aletas JVC</button>
        <button class="btn-secondary" onclick="setCamera('CLOSE', this)">🔍 Close-Up Tubo CRT</button>
      </div>
      <div class="row" style="margin-top: 8px;">
        <button id="btnToggle3dMove" class="btn-secondary active" onclick="toggle3dMotion(this)">🌀 Balanceo 3D Activo: ON</button>
        <button id="btnToggleMaxBg" class="btn-secondary active" onclick="toggleMaxHeadroomBg(this)">📡 Fondo CRT Max Headroom: ON</button>
        <button id="btnToggleLowerThirds" class="btn-secondary active" onclick="toggleLowerThirds(this)">📊 Apoyos Inferiores: ON</button>
        <button id="btnToggleOutro" class="btn-secondary active" onclick="toggleOutroCurtain(this)">🚀 Cortinilla Salida: ON</button>
      </div>
    </div>

    <div>
      <div class="section-title">4. Subtítulos / OSD Opcional</div>
      <textarea id="liveSubtitleInput" placeholder="Escribe aquí..."></textarea>
    </div>

    <div>
      <div class="section-title">5. Escalera Fonética de 16 Visemas (Rhubarb + Pre-Roll +40ms)</div>
      <div id="hudGrid" class="hud-grid"></div>
    </div>
  </div>
</div>

<script>
const PAYLOAD = {payload_json};

document.getElementById('payloadRefDisplay').textContent = PAYLOAD.votd.reference;
document.getElementById('votdTextDisplay').textContent = `"${{PAYLOAD.votd.text}}"`;
document.getElementById('liveSubtitleInput').value = PAYLOAD.votd.text.toUpperCase();

// ============================================================================
// 1. CARGA DE SPRITES DEL PERSONAJE, FONDOS Y LOGOS DE TALENTO CON TARIFA
// ============================================================================
const ladderImages = [];
const hudGrid = document.getElementById('hudGrid');

PAYLOAD.ladder.forEach((item, idx) => {{
  const img = new Image();
  img.src = item.src;
  ladderImages.push(img);

  if (hudGrid) {{
    const cell = document.createElement('div');
    cell.className = 'hud-cell' + (idx === 2 ? ' active' : '');
    cell.id = 'hud_' + idx;
    cell.innerHTML = `<img src="${{item.src}}" /><span>S${{String(idx).padStart(2,'0')}}</span>`;
    hudGrid.appendChild(cell);
  }}
}});

const studioBgImg = new Image();
studioBgImg.src = PAYLOAD.default_bg;

const dinerBgImg = new Image();
dinerBgImg.src = PAYLOAD.cafe80s_diner_bg || PAYLOAD.default_bg;

const tctBlackImg = new Image();
if (PAYLOAD.tct_logo_black) tctBlackImg.src = PAYLOAD.tct_logo_black;

const tctLimeImg = new Image();
if (PAYLOAD.tct_logo_lime) tctLimeImg.src = PAYLOAD.tct_logo_lime;

const tctCerebroImg = new Image();
if (PAYLOAD.tct_cerebro) tctCerebroImg.src = PAYLOAD.tct_cerebro;

let cameraMode = 'AUTO';
let enable3dMotion = true;
let enableMaxHeadroomBg = true;
let showLowerThirds = Boolean(PAYLOAD.show_lower_thirds !== false);
let showOutroCurtain = Boolean(PAYLOAD.show_outro_curtain !== false);
let showTctBrand = Boolean(PAYLOAD.show_tct_brand !== false);
let showSubtitlesBox = Boolean(PAYLOAD.show_subtitles_box);

function setCamera(mode, btn) {{
  cameraMode = mode;
  cutGlitchFrames = 5;
  document.querySelectorAll('#cam-buttons button').forEach(b => b.classList.remove('active'));
  if (btn) btn.classList.add('active');
}}
function toggle3dMotion(btn) {{
  enable3dMotion = !enable3dMotion;
  btn.classList.toggle('active', enable3dMotion);
  btn.textContent = `🌀 Balanceo 3D Activo: ${{enable3dMotion ? 'ON' : 'OFF'}}`;
}}
function toggleMaxHeadroomBg(btn) {{
  enableMaxHeadroomBg = !enableMaxHeadroomBg;
  btn.classList.toggle('active', enableMaxHeadroomBg);
  btn.textContent = `📡 Fondo CRT Max Headroom: ${{enableMaxHeadroomBg ? 'ON' : 'OFF'}}`;
}}
function toggleLowerThirds(btn) {{
  showLowerThirds = !showLowerThirds;
  btn.classList.toggle('active', showLowerThirds);
  btn.textContent = `📊 Apoyos Inferiores: ${{showLowerThirds ? 'ON' : 'OFF'}}`;
}}
function toggleOutroCurtain(btn) {{
  showOutroCurtain = !showOutroCurtain;
  btn.classList.toggle('active', showOutroCurtain);
  btn.textContent = `🚀 Cortinilla Salida: ${{showOutroCurtain ? 'ON' : 'OFF'}}`;
}}

// ============================================================================
// 2. CANVAS INTERNO DEL TUBO CRT (640x512) — DONDE VIVE EL PERSONAJE
// ============================================================================
const crtCanvas = document.createElement('canvas');
crtCanvas.width = 640;
crtCanvas.height = 512;
const crtCtx = crtCanvas.getContext('2d');

const charTempCanvas = document.createElement('canvas');
charTempCanvas.width = 640;
charTempCanvas.height = 512;
const charTempCtx = charTempCanvas.getContext('2d');

function drawInsideCrtScreen(snapIdx, prevIdx, activeShot, tSec, normVol, isChannelCut, sceneIdx) {{
  const W = 640, H = 512;
  crtCtx.clearRect(0, 0, W, H);

  // 1. Fondo base dentro de la tele (Estudio oscuro + Rejilla geométrica ochentera Max Headroom)
  crtCtx.fillStyle = '#070910';
  crtCtx.fillRect(0, 0, W, H);

  if (studioBgImg.complete && studioBgImg.naturalWidth > 0) {{
    crtCtx.save();
    crtCtx.globalAlpha = enableMaxHeadroomBg ? 0.42 : 0.85;
    crtCtx.drawImage(studioBgImg, 0, 120, 720, 580, 0, 0, W, H);
    crtCtx.restore();
  }}

  if (enableMaxHeadroomBg) {{
    crtCtx.save();
    // Líneas y planos giratorios estilo Max Headroom (Café 80's)
    const tilt = Math.sin(tSec * 0.65) * 0.18 + (sceneIdx * 0.15);
    crtCtx.translate(W / 2, H / 2);
    crtCtx.rotate(tilt);

    const gradBg = crtCtx.createLinearGradient(-W, -H, W, H);
    gradBg.addColorStop(0, 'rgba(0, 240, 255, 0.16)');
    gradBg.addColorStop(0.5, 'rgba(10, 12, 24, 0.45)');
    gradBg.addColorStop(1, 'rgba(204, 255, 0, 0.18)');
    crtCtx.fillStyle = gradBg;
    crtCtx.fillRect(-W, -H, W * 2, H * 2);

    // Franjas diagonales en movimiento reactivas a la voz
    const stripeOffset = (tSec * 48) % 44;
    for (let y = -H; y < H; y += 22) {{
      const isAccent = Math.abs(Math.floor(y / 22)) % 4 === 0;
      crtCtx.strokeStyle = isAccent
        ? `rgba(204, 255, 0, ${{0.22 + normVol * 0.25}})`
        : `rgba(0, 225, 255, ${{0.12 + normVol * 0.12}})`;
      crtCtx.lineWidth = isAccent ? 3.5 : 1.5;
      crtCtx.beginPath();
      crtCtx.moveTo(-W, y + stripeOffset);
      crtCtx.lineTo(W, y + stripeOffset + Math.sin(tSec * 2 + y * 0.03) * 18);
      crtCtx.stroke();
    }}

    // Onda de osciloscopio ochentero detrás de los hombros del personaje
    crtCtx.strokeStyle = '#CCFF00';
    crtCtx.lineWidth = 2.5;
    crtCtx.beginPath();
    for (let x = -W / 2; x <= W / 2; x += 12) {{
      const waveY = Math.sin(x * 0.035 + tSec * 14) * (8 + normVol * 42) * Math.cos(x * 0.01);
      if (x === -W / 2) crtCtx.moveTo(x, 60 + waveY);
      else crtCtx.lineTo(x, 60 + waveY);
    }}
    crtCtx.stroke();
    crtCtx.restore();
  }}

  // 2. Dibujar al Personaje 01 encuadrado para la pantalla 4:3 de la tele
  const spriteImg = ladderImages[snapIdx] || ladderImages[2];
  if (spriteImg && spriteImg.complete && spriteImg.naturalWidth > 0) {{
    charTempCtx.clearRect(0, 0, W, H);
    const cx = PAYLOAD.focus_center_x || 360;

    // Micro-movimiento tipo Max Headroom + zoom de voz dentro del monitor
    const mhDx = Math.sin(tSec * 2.1) * 4.0;
    const mhDy = Math.cos(tSec * 1.6) * 3.0;
    const vZoom = 1.0 + normVol * 0.028;

    let cropW = 550, cropH = 440, cropY = 44;
    if (activeShot === 'CLOSE') {{
      cropW = 490; cropH = 392; cropY = 54;
    }} else if (activeShot === 'MEDIUM') {{
      cropW = 520; cropH = 416; cropY = 48;
    }} else {{
      cropW = 560; cropH = 448; cropY = 42;
    }}
    const cropX = Math.max(0, Math.min(720 - cropW, cx - cropW / 2));

    charTempCtx.save();
    charTempCtx.translate(W / 2 + mhDx, H / 2 + mhDy);
    charTempCtx.scale(vZoom, vZoom);
    charTempCtx.translate(-W / 2, -H / 2);

    // Rim-light reactivo #CCFF00 en la silueta del personaje dentro del CRT
    charTempCtx.shadowColor = '#CCFF00';
    charTempCtx.shadowBlur = 12 + normVol * 20;
    charTempCtx.drawImage(spriteImg, cropX, cropY, cropW, cropH, 0, 0, W, H);
    charTempCtx.restore();

    // Desfase cromático RGB dentro del tubo CRT en sílabas fuertes o cambios de plano
    const visemeJump = Math.abs(snapIdx - prevIdx);
    const strongSyllable = (visemeJump >= 3 && normVol > 0.48) || isChannelCut;
    if (strongSyllable) {{
      const rgbShift = isChannelCut ? 9 : Math.round(3 + normVol * 4);
      crtCtx.save();
      crtCtx.globalAlpha = 0.38;
      crtCtx.globalCompositeOperation = 'screen';
      crtCtx.drawImage(charTempCanvas, -rgbShift, 0);
      crtCtx.drawImage(charTempCanvas, rgbShift, 0);
      crtCtx.restore();
    }}

    crtCtx.drawImage(charTempCanvas, 0, 0);

    // Slice Glitch de seguimiento VHS para disimular el cambio de sprite dentro de la tele
    if (strongSyllable) {{
      const slices = isChannelCut ? 5 : 2;
      for (let s = 0; s < slices; s++) {{
        const sy = ((Math.floor(tSec * 30) * 89 + s * 173) % (H - 80)) + 30;
        const sh = isChannelCut ? 28 : 14;
        const dx = ((s % 2 === 0) ? 1 : -1) * (isChannelCut ? 22 : 12);
        crtCtx.drawImage(crtCanvas, 0, sy, W, sh, dx, sy, W, sh);
      }}
    }}
  }}

  // 3. Estática de cambio de canal ochentero en cortes de escena
  if (isChannelCut) {{
    crtCtx.save();
    for (let y = 0; y < H; y += 6) {{
      const bright = Math.floor(Math.random() * 255);
      crtCtx.fillStyle = `rgba(${{bright}}, 255, ${{Math.floor(bright*0.8)}}, 0.22)`;
      crtCtx.fillRect(0, y, W, 3);
    }}
    crtCtx.restore();
  }}

  // 4. Scanlines de fósforo CRT + OSD "CH 85 // CAFÉ 80'S IA" + Viñeta de bulbo
  crtCtx.fillStyle = 'rgba(0, 0, 0, 0.24)';
  for (let y = 0; y < H; y += 4) {{
    crtCtx.fillRect(0, y, W, 2);
  }}

  // OSD Verde Fósforo estilo JVC 1985 en la esquina superior de la pantalla
  crtCtx.save();
  crtCtx.font = 'bold 20px VT323LCD, monospace';
  crtCtx.fillStyle = '#CCFF00';
  crtCtx.shadowColor = '#CCFF00';
  crtCtx.shadowBlur = 8;
  crtCtx.fillText(`CH-85 // MAX-IA`, 24, 34);
  const recBlink = Math.floor(tSec * 2) % 2 === 0;
  if (recBlink) {{
    crtCtx.fillStyle = '#ff2a2a';
    crtCtx.beginPath();
    crtCtx.arc(W - 108, 26, 6, 0, Math.PI * 2);
    crtCtx.fill();
  }}
  crtCtx.fillStyle = '#CCFF00';
  crtCtx.fillText(`LIVE`, W - 92, 34);
  crtCtx.restore();

  // Viñeta curva en las esquinas del tubo CRT
  const crtVig = crtCtx.createRadialGradient(W / 2, H / 2, H * 0.34, W / 2, H / 2, W * 0.62);
  crtVig.addColorStop(0, 'rgba(0,0,0,0)');
  crtVig.addColorStop(0.82, 'rgba(0,4,8,0.22)');
  crtVig.addColorStop(1, 'rgba(0,0,0,0.82)');
  crtCtx.fillStyle = crtVig;
  crtCtx.fillRect(0, 0, W, H);
}}

// ============================================================================
// 3. ESCENA 3D REAL EN THREE.JS — LA TELE JVC DEL CAFÉ DE LOS 80'S
// ============================================================================
const webglCanvas = document.createElement('canvas');
webglCanvas.width = 720;
webglCanvas.height = 1280;

const renderer = new THREE.WebGLRenderer({{
  canvas: webglCanvas,
  antialias: true,
  alpha: true,
  preserveDrawingBuffer: true
}});
renderer.setSize(720, 1280, false);
renderer.setPixelRatio(1);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.08;

const scene = new THREE.Scene();

// Cámara 3D con perspectiva cinematográfica calibrada para formato vertical 9:16
const camera = new THREE.PerspectiveCamera(52, 720 / 1280, 0.1, 100);
camera.position.set(0, 0.22, 5.15);
camera.lookAt(0, 0.12, 0);

// Textura viva del tubo CRT
const crtTexture = new THREE.CanvasTexture(crtCanvas);
crtTexture.minFilter = THREE.LinearFilter;
crtTexture.magFilter = THREE.LinearFilter;

// Luces 3D del Café de los 80's con Sombras Suaves (PCFSoftShadowMap)
const ambientLight = new THREE.AmbientLight(0xd8e2ff, 0.42);
scene.add(ambientLight);

// Hemisphere light (techo cálido del diner vs piso oscuro) para sombreado natural 3D
const hemiLight = new THREE.HemisphereLight(0xffe8c8, 0x090b14, 0.52);
hemiLight.position.set(0, 5.0, 0);
scene.add(hemiLight);

// Luz principal cenital-frontal con mapa de sombras de alta resolución (2048x2048)
const keyLight = new THREE.DirectionalLight(0xfff2dd, 1.35);
keyLight.position.set(1.35, 3.8, 4.2);
keyLight.castShadow = true;
keyLight.shadow.mapSize.width = 2048;
keyLight.shadow.mapSize.height = 2048;
keyLight.shadow.camera.near = 0.5;
keyLight.shadow.camera.far = 12.0;
keyLight.shadow.camera.left = -2.4;
keyLight.shadow.camera.right = 2.4;
keyLight.shadow.camera.top = 2.6;
keyLight.shadow.camera.bottom = -2.4;
keyLight.shadow.bias = -0.0006;
keyLight.shadow.radius = 4.0;
scene.add(keyLight);

// Luz secundaria cenital simétrica para sombras suaves bajo la visera y bandeja
const topRimLight = new THREE.DirectionalLight(0xffffff, 0.55);
topRimLight.position.set(-1.2, 4.2, 2.8);
topRimLight.castShadow = true;
topRimLight.shadow.mapSize.width = 1024;
topRimLight.shadow.mapSize.height = 1024;
topRimLight.shadow.camera.near = 0.5;
topRimLight.shadow.camera.far = 12.0;
topRimLight.shadow.camera.left = -2.4;
topRimLight.shadow.camera.right = 2.4;
topRimLight.shadow.camera.top = 2.6;
topRimLight.shadow.camera.bottom = -2.4;
topRimLight.shadow.bias = -0.0008;
topRimLight.shadow.radius = 4.5;
scene.add(topRimLight);

// Luz Neón Azul/Cian izquierda (Arcades del Café 80's)
const arcadeCyanLight = new THREE.PointLight(0x00e5ff, 2.2, 11);
arcadeCyanLight.position.set(-3.2, 1.1, 2.3);
scene.add(arcadeCyanLight);

// Luz Neón Roja/Magenta derecha (Jukebox y sillones rojos del Café 80's)
const dinerRedLight = new THREE.PointLight(0xff2255, 2.2, 11);
dinerRedLight.position.set(3.2, 1.1, 2.3);
scene.add(dinerRedLight);

// Luz reactiva #CCFF00 emitida por la propia pantalla CRT sobre la bandeja y aletas
const crtBounceLight = new THREE.PointLight(0xccff00, 1.25, 5.0);
crtBounceLight.position.set(0, 0.78, 1.35);
scene.add(crtBounceLight);

// Grupo maestro de la Televisión 3D JVC del Café 80's (suspendida del techo)
const tvRig = new THREE.Group();
tvRig.scale.set(0.58, 0.58, 0.58);
tvRig.position.set(0, 0.78, 0);
scene.add(tvRig);

// Materiales PBR de la Tele 80's (con mayor contraste de sombreado)
const matCabinetDark = new THREE.MeshStandardMaterial({{
  color: 0x151820,
  roughness: 0.42,
  metalness: 0.65
}});
const matBezelBlack = new THREE.MeshStandardMaterial({{
  color: 0x090b0f,
  roughness: 0.52,
  metalness: 0.32
}});
const matJvcCrimson = new THREE.MeshStandardMaterial({{
  color: 0x8f141c,
  roughness: 0.30,
  metalness: 0.25
}});
const matJvcCrimsonDark = new THREE.MeshStandardMaterial({{
  color: 0x4e080d,
  roughness: 0.48,
  metalness: 0.22
}});
const matOliveCrown = new THREE.MeshStandardMaterial({{
  color: 0x52583a,
  roughness: 0.36,
  metalness: 0.56
}});
const matTctLime = new THREE.MeshStandardMaterial({{
  color: 0xccff00,
  emissive: 0xccff00,
  emissiveIntensity: 0.48,
  roughness: 0.22,
  metalness: 0.1
}});
const matRetroGold = new THREE.MeshStandardMaterial({{
  color: 0xffc400,
  emissive: 0xff8800,
  emissiveIntensity: 0.18,
  roughness: 0.28,
  metalness: 0.62
}});
const matChrome = new THREE.MeshStandardMaterial({{
  color: 0xd8e0e8,
  roughness: 0.18,
  metalness: 0.88
}});

// Textura de Oclusión Ambiental (AO) suave para sombras de contacto profundas en la tele
function makeSoftAoGradientTexture(topAlpha, botAlpha, vertical = true) {{
  const c = document.createElement('canvas');
  c.width = 128; c.height = 128;
  const gCtx = c.getContext('2d');
  const grad = vertical
    ? gCtx.createLinearGradient(0, 0, 0, 128)
    : gCtx.createLinearGradient(0, 0, 128, 0);
  grad.addColorStop(0, `rgba(0, 0, 0, ${{topAlpha}})`);
  grad.addColorStop(0.55, `rgba(0, 0, 0, ${{(topAlpha + botAlpha) * 0.35}})`);
  grad.addColorStop(1, `rgba(0, 0, 0, ${{botAlpha}})`);
  gCtx.fillStyle = grad;
  gCtx.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(c);
}}

// 1. Caja Principal del Monitor CRT + Carcasa Trasera Cónica (100% Simétrica)
const mainBox = new THREE.Mesh(new THREE.BoxGeometry(2.72, 2.16, 1.38), matCabinetDark);
mainBox.position.set(0, 0, -0.18);
mainBox.castShadow = true;
mainBox.receiveShadow = true;
tvRig.add(mainBox);

const rearTubeHousing = new THREE.Mesh(new THREE.BoxGeometry(1.78, 1.42, 0.85), matCabinetDark);
rearTubeHousing.position.set(0, 0.04, -1.15);
rearTubeHousing.castShadow = true;
rearTubeHousing.receiveShadow = true;
tvRig.add(rearTubeHousing);

// Bisel Frontal Oscuro que enmarca el bulbo CRT (con sombras proyectadas)
const bezelTop = new THREE.Mesh(new THREE.BoxGeometry(2.64, 0.16, 0.24), matBezelBlack);
bezelTop.position.set(0, 0.96, 0.48);
bezelTop.castShadow = true;
bezelTop.receiveShadow = true;
tvRig.add(bezelTop);

const bezelBot = new THREE.Mesh(new THREE.BoxGeometry(2.64, 0.26, 0.28), matBezelBlack);
bezelBot.position.set(0, -0.95, 0.48);
bezelBot.castShadow = true;
bezelBot.receiveShadow = true;
tvRig.add(bezelBot);

const bezelLeft = new THREE.Mesh(new THREE.BoxGeometry(0.18, 2.04, 0.24), matBezelBlack);
bezelLeft.position.set(-1.23, 0, 0.48);
bezelLeft.castShadow = true;
bezelLeft.receiveShadow = true;
tvRig.add(bezelLeft);

const bezelRight = new THREE.Mesh(new THREE.BoxGeometry(0.18, 2.04, 0.24), matBezelBlack);
bezelRight.position.set(1.23, 0, 0.48);
bezelRight.castShadow = true;
bezelRight.receiveShadow = true;
tvRig.add(bezelRight);

// Marco interior cromado alrededor de la pantalla
const innerRim = new THREE.Mesh(new THREE.BoxGeometry(2.42, 1.82, 0.04), matChrome);
innerRim.position.set(0, 0.03, 0.51);
innerRim.receiveShadow = true;
tvRig.add(innerRim);

// 2. Malla Curva 3D del Tubo CRT (con abombamiento esférico real)
const crtGeo = new THREE.PlaneGeometry(2.34, 1.76, 28, 28);
const posAttr = crtGeo.attributes.position;
for (let i = 0; i < posAttr.count; i++) {{
  const vx = posAttr.getX(i);
  const vy = posAttr.getY(i);
  const nx = vx / 1.17;
  const ny = vy / 0.88;
  const bulge = Math.max(0, (1 - nx * nx * 0.42) * (1 - ny * ny * 0.42)) * 0.16;
  posAttr.setZ(i, bulge);
}}
crtGeo.computeVertexNormals();

const matCrtScreen = new THREE.MeshBasicMaterial({{ map: crtTexture }});
const crtMesh = new THREE.Mesh(crtGeo, matCrtScreen);
crtMesh.position.set(0, 0.03, 0.52);
tvRig.add(crtMesh);

// Sombra de Oclusión Ambiental (AO) bajo la visera superior sobre la parte alta del CRT
const topCrtAoTex = makeSoftAoGradientTexture(0.76, 0.0, true);
const topCrtAoMesh = new THREE.Mesh(
  new THREE.PlaneGeometry(2.36, 0.44),
  new THREE.MeshBasicMaterial({{ map: topCrtAoTex, transparent: true, depthWrite: false }})
);
topCrtAoMesh.position.set(0, 0.70, 0.62);
tvRig.add(topCrtAoMesh);

// Domo de Cristal Especular transparente sobre el CRT para reflejos 3D reales
const matGlass = new THREE.MeshPhongMaterial({{
  color: 0xffffff,
  specular: 0x00f0ff,
  shininess: 140,
  transparent: true,
  opacity: 0.10
}});
const glassMesh = new THREE.Mesh(crtGeo.clone(), matGlass);
glassMesh.position.set(0, 0.03, 0.535);
tvRig.add(glassMesh);

// 3. Visera Superior + Aletas Laterales Rojas 100% SIMÉTRICAS (Con la rotación original hacia el frente)
const topHood = new THREE.Mesh(new THREE.BoxGeometry(3.04, 0.12, 0.90), matJvcCrimson);
topHood.position.set(0, 1.12, 0.62);
topHood.rotation.x = 0.06;
topHood.castShadow = true;
topHood.receiveShadow = true;
tvRig.add(topHood);

// Sombra oscura en la cara inferior de la visera superior
const underHoodShadow = new THREE.Mesh(new THREE.BoxGeometry(2.98, 0.02, 0.86), matJvcCrimsonDark);
underHoodShadow.position.set(0, 1.055, 0.62);
underHoodShadow.rotation.x = 0.06;
tvRig.add(underHoodShadow);

const topHoodTrim = new THREE.Mesh(new THREE.BoxGeometry(3.06, 0.035, 0.05), matTctLime);
topHoodTrim.position.set(0, 1.09, 1.06);
tvRig.add(topHoodTrim);

const wingExtrudeSettings = {{
  depth: 0.09,
  bevelEnabled: true,
  bevelSegments: 3,
  steps: 1,
  bevelSize: 0.02,
  bevelThickness: 0.02
}};

// Shape (+X) para la Aleta Izquierda (con rotation.y = -1.18 proyecta hacia +Z mostrando la cara exterior y el canto frontal)
const wingShapeR = new THREE.Shape();
wingShapeR.moveTo(0, -0.94);
wingShapeR.lineTo(0.88, -0.60);
wingShapeR.lineTo(0.94, 1.08);
wingShapeR.lineTo(0, 1.12);
wingShapeR.closePath();
const wingGeoR = new THREE.ExtrudeGeometry(wingShapeR, wingExtrudeSettings);
wingGeoR.translate(0, 0, -0.045);
wingGeoR.computeVertexNormals();

// Shape (-X espejo exacto) para la Aleta Derecha (con rotation.y = +1.18 proyecta hacia +Z como espejo exacto en X)
const wingShapeL = new THREE.Shape();
wingShapeL.moveTo(0, -0.94);
wingShapeL.lineTo(-0.88, -0.60);
wingShapeL.lineTo(-0.94, 1.08);
wingShapeL.lineTo(0, 1.12);
wingShapeL.closePath();
const wingGeoL = new THREE.ExtrudeGeometry(wingShapeL, wingExtrudeSettings);
wingGeoL.translate(0, 0, -0.045);
wingGeoL.computeVertexNormals();

const leftWingGroup = new THREE.Group();
leftWingGroup.position.set(-1.36, 0.02, 0.25);
leftWingGroup.rotation.y = 1.18; // Abierta ligeramente hacia afuera (simétrica)
const leftWingMesh = new THREE.Mesh(wingGeoL, matJvcCrimson);
leftWingMesh.castShadow = true;
leftWingMesh.receiveShadow = true;
leftWingGroup.add(leftWingMesh);
tvRig.add(leftWingGroup);

const rightWingGroup = new THREE.Group();
rightWingGroup.position.set(1.36, 0.02, 0.25);
rightWingGroup.rotation.y = -1.18; // Abierta ligeramente hacia afuera (espejo exacto)
const rightWingMesh = new THREE.Mesh(wingGeoR, matJvcCrimson);
rightWingMesh.castShadow = true;
rightWingMesh.receiveShadow = true;
rightWingGroup.add(rightWingMesh);
tvRig.add(rightWingGroup);

// Sombras de oclusión (AO) verticales donde las aletas se unen al bisel lateral
const sideAoTexL = makeSoftAoGradientTexture(0.65, 0.0, false);
const leftWingAo = new THREE.Mesh(
  new THREE.PlaneGeometry(0.28, 1.88),
  new THREE.MeshBasicMaterial({{ map: sideAoTexL, transparent: true, depthWrite: false }})
);
leftWingAo.position.set(-1.08, 0.02, 0.56);
tvRig.add(leftWingAo);

const sideAoTexR = makeSoftAoGradientTexture(0.0, 0.65, false);
const rightWingAo = new THREE.Mesh(
  new THREE.PlaneGeometry(0.28, 1.88),
  new THREE.MeshBasicMaterial({{ map: sideAoTexR, transparent: true, depthWrite: false }})
);
rightWingAo.position.set(1.08, 0.02, 0.56);
tvRig.add(rightWingAo);

// 4. Corona Triangular Superior Perforada con 3 Agujeros Circulares (100% Simétrica)
const crownShape = new THREE.Shape();
crownShape.moveTo(-1.34, 0);
crownShape.lineTo(1.34, 0);
crownShape.lineTo(0.18, 0.72);
crownShape.lineTo(-0.18, 0.72);
crownShape.closePath();

// Los 3 agujeros circulares perforados simétricos en X (-0.52, 0.0, +0.52)
[-0.52, 0.0, 0.52].forEach((hx, hIdx) => {{
  const hole = new THREE.Path();
  const hy = (hIdx === 1) ? 0.36 : 0.26;
  const hr = (hIdx === 1) ? 0.16 : 0.13;
  hole.absarc(hx, hy, hr, 0, Math.PI * 2, false);
  crownShape.holes.push(hole);
}});

const crownGeo = new THREE.ExtrudeGeometry(crownShape, {{
  depth: 0.11,
  bevelEnabled: true,
  bevelSegments: 3,
  steps: 1,
  bevelSize: 0.015,
  bevelThickness: 0.015
}});
crownGeo.translate(0, 0, -0.055);
crownGeo.computeVertexNormals();

const crownMesh = new THREE.Mesh(crownGeo, matOliveCrown);
crownMesh.position.set(0, 1.16, 0.60);
crownMesh.castShadow = true;
crownMesh.receiveShadow = true;
tvRig.add(crownMesh);

// Remaches cromados simétricos en la corona
[-0.96, -0.28, 0.28, 0.96].forEach(rx => {{
  const rivet = new THREE.Mesh(new THREE.SphereGeometry(0.032, 12, 12), matChrome);
  rivet.position.set(rx, 1.25, 0.67);
  rivet.castShadow = true;
  tvRig.add(rivet);
}});

// 5. Bandeja Inferior Roja del Café 80's con Sombras de Contacto y Franjas Amarilla/Lima (Sin Botella)
const trayNeck = new THREE.Mesh(new THREE.BoxGeometry(1.76, 0.28, 0.56), matJvcCrimsonDark);
trayNeck.position.set(0, -1.20, 0.38);
trayNeck.castShadow = true;
trayNeck.receiveShadow = true;
tvRig.add(trayNeck);

// Sombra de contacto profunda bajo el monitor sobre el cuello de la bandeja
const neckAoTex = makeSoftAoGradientTexture(0.85, 0.05, true);
const neckAoMesh = new THREE.Mesh(
  new THREE.PlaneGeometry(1.78, 0.26),
  new THREE.MeshBasicMaterial({{ map: neckAoTex, transparent: true, depthWrite: false }})
);
neckAoMesh.position.set(0, -1.18, 0.665);
tvRig.add(neckAoMesh);

const trayBase = new THREE.Mesh(new THREE.BoxGeometry(2.32, 0.22, 0.98), matJvcCrimson);
trayBase.position.set(0, -1.42, 0.64);
trayBase.castShadow = true;
trayBase.receiveShadow = true;
tvRig.add(trayBase);

// Sombra de oclusión en la cara superior de la bandeja (bajo el voladizo de la tele)
const trayTopAoTex = makeSoftAoGradientTexture(0.82, 0.08, true);
const trayTopAoMesh = new THREE.Mesh(
  new THREE.PlaneGeometry(2.28, 0.94),
  new THREE.MeshBasicMaterial({{ map: trayTopAoTex, transparent: true, depthWrite: false }})
);
trayTopAoMesh.rotation.x = -Math.PI / 2;
trayTopAoMesh.position.set(0, -1.308, 0.64);
tvRig.add(trayTopAoMesh);

// Franja amarilla/dorada clásica alrededor de la bandeja inferior
const trayStripeFront = new THREE.Mesh(new THREE.BoxGeometry(2.35, 0.055, 1.01), matRetroGold);
trayStripeFront.position.set(0, -1.41, 0.64);
trayStripeFront.castShadow = true;
trayStripeFront.receiveShadow = true;
tvRig.add(trayStripeFront);

// Filete inferior #CCFF00 Talento con Tarifa
const trayStripeLime = new THREE.Mesh(new THREE.BoxGeometry(2.34, 0.025, 1.00), matTctLime);
trayStripeLime.position.set(0, -1.49, 0.64);
tvRig.add(trayStripeLime);

// Placa frontal JVC // TCT-85 centrada en el bisel inferior
const badgeCanvas = document.createElement('canvas');
badgeCanvas.width = 256;
badgeCanvas.height = 64;
const bCtx = badgeCanvas.getContext('2d');
bCtx.fillStyle = '#101216';
bCtx.fillRect(0, 0, 256, 64);
bCtx.strokeStyle = '#CCFF00';
bCtx.lineWidth = 4;
bCtx.strokeRect(2, 2, 252, 60);
bCtx.fillStyle = '#F0F0F0';
bCtx.font = '900 28px Impact, Arial, sans-serif';
bCtx.textAlign = 'center';
bCtx.fillText('JVC // TCT-85', 128, 42);
const badgeTex = new THREE.CanvasTexture(badgeCanvas);
const badgeMesh = new THREE.Mesh(
  new THREE.PlaneGeometry(0.68, 0.17),
  new THREE.MeshBasicMaterial({{ map: badgeTex }})
);
badgeMesh.position.set(0, -0.95, 0.625);
tvRig.add(badgeMesh);

// 6. Brazo Mecánico de Techo Centrado en X=0
const ceilingPole = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 2.4, 16), matCabinetDark);
ceilingPole.position.set(0, 2.35, -0.15);
ceilingPole.castShadow = true;
ceilingPole.receiveShadow = true;
tvRig.add(ceilingPole);

const gimbalRing = new THREE.Mesh(new THREE.TorusGeometry(0.22, 0.035, 12, 24), matChrome);
gimbalRing.position.set(0, 1.35, -0.12);
gimbalRing.castShadow = true;
tvRig.add(gimbalRing);

// ============================================================================
// 4. MOTOR DE AUDIO WEB + SINCRONIZACIÓN RHUBARB (+40MS PRE-ROLL)
// ============================================================================
let audioCtx = null;
let analyser = null;
let compressorNode = null;
let gainNode = null;
let currentAudio = null;
let currentAudioDuration = 28.0;
let micStream = null;
let isSpeaking = false;
let speakStartTime = 0;
let prevShotMode = 'FULL';
let cutGlitchFrames = 0;
let prevPhoneticIdx = 2;
let phoneticHoldCount = 0;

function ensureAudioContext() {{
  if (!audioCtx) {{
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    analyser = audioCtx.createAnalyser();
    analyser.fftSize = 1024;
    analyser.smoothingTimeConstant = 0.22;

    compressorNode = audioCtx.createDynamicsCompressor();
    compressorNode.threshold.setValueAtTime(-24, audioCtx.currentTime);
    compressorNode.ratio.setValueAtTime(6, audioCtx.currentTime);
    compressorNode.attack.setValueAtTime(0.002, audioCtx.currentTime);
    compressorNode.release.setValueAtTime(0.10, audioCtx.currentTime);

    gainNode = audioCtx.createGain();
    gainNode.gain.setValueAtTime(1.35, audioCtx.currentTime);

    compressorNode.connect(gainNode);
    gainNode.connect(analyser);
  }}
  if (audioCtx.state === 'suspended') audioCtx.resume();
}}

function setStatus(msg) {{
  const el = document.getElementById('statusText');
  if (el) el.textContent = msg;
}}

async function playDemo(key) {{
  ensureAudioContext();
  if (currentAudio) {{
    currentAudio.pause();
    currentAudio = null;
  }}
  const item = PAYLOAD.demos[key];
  if (!item) return;
  document.getElementById('liveSubtitleInput').value = item.text.toUpperCase();

  const audio = new Audio(item.audio);
  audio.crossOrigin = "anonymous";
  audio.onloadedmetadata = () => {{
    if (audio.duration && isFinite(audio.duration)) currentAudioDuration = audio.duration;
  }};
  const srcNode = audioCtx.createMediaElementSource(audio);
  srcNode.connect(compressorNode);
  analyser.connect(audioCtx.destination);

  currentAudio = audio;
  isSpeaking = true;
  speakStartTime = performance.now() / 1000;
  setStatus(`Transmitiendo en la Tele 3D: ${{item.ref}}...`);
  audio.onended = () => {{
    isSpeaking = false;
    setStatus(`Transmisión finalizada. "${{PAYLOAD.closing_signature}}"`);
  }};
  await audio.play();
}}

async function toggleMicrophone() {{
  const btn = document.getElementById('btnMic');
  ensureAudioContext();
  if (micStream) {{
    micStream.getTracks().forEach(t => t.stop());
    micStream = null;
    isSpeaking = false;
    btn.classList.remove('active');
    btn.textContent = '🎙️ Hablar en Vivo en la Tele 3D';
    setStatus('Micrófono desactivado.');
    return;
  }}
  try {{
    micStream = await navigator.mediaDevices.getUserMedia({{ audio: true }});
    const micSource = audioCtx.createMediaStreamSource(micStream);
    micSource.connect(analyser);
    isSpeaking = true;
    speakStartTime = performance.now() / 1000;
    btn.classList.add('active');
    btn.textContent = '⏹️ Detener Micrófono';
    setStatus('¡Micrófono en vivo conectado al tubo CRT 3D!');
  }} catch (err) {{
    setStatus('No se pudo abrir el micrófono: ' + err.message);
  }}
}}

// Mapeo de fonema Rhubarb (X, A..H) + Energía RMS a los 16 Visemas del Personaje 01
function mapRhubarbCueTo16Viseme(rhubarbVal, normVol, centroidHz, lowRatio) {{
  if (normVol < 0.09 || rhubarbVal === 'X') return 2; // IDLE cerrado
  switch (rhubarbVal) {{
    case 'A': // M, B, P (Cierre bilabial estricto)
      return 2;
    case 'G': // F, V (Labiodental)
      return 3;
    case 'F': // U, W (Vocal redonda cerrada)
      return (normVol > 0.42) ? 6 : 4;
    case 'B': // K, S, T, D, N, I (Dientes / consonantes alveolares)
      return (centroidHz > 1850 || normVol > 0.36) ? 7 : 5;
    case 'H': // L, R (Líquidas alveolares)
      return (normVol > 0.48) ? 9 : 5;
    case 'E': // O (Vocal redonda abierta)
      return (normVol > 0.58) ? 12 : 11;
    case 'C': // E, AE (Vocal media-abierta)
      if (normVol < 0.42) return 8;
      if (normVol < 0.68) return 9;
      return 10;
    case 'D': // A (Apertura máxima)
      if (normVol < 0.55) return 13;
      if (normVol < 0.82) return 14;
      return 15;
    default:
      return 9;
  }}
}}

// ============================================================================
// 5. COMPOSICIÓN FINAL: ESCENARIO DINER 80'S + TELE 3D + APOYOS NEO-BRUTALISTAS
// ============================================================================
const stageCanvas = document.getElementById('stage');
const stageCtx = stageCanvas.getContext('2d');

// Estado interpolado suave de la cámara 3D y de la tele 3D
let curCamX = 0.0, curCamY = 0.22, curCamZ = 5.15;
let curTvRotX = 0.04, curTvRotY = 0.0, curTvRotZ = 0.0;
let curTvPosY = 0.78;

function getSceneIndexAtTime(tSec, totalDur) {{
  const scenes = PAYLOAD.scenes || [];
  if (!scenes.length) return {{ activeIdx: 0, sc: {{}}, isCta: false, localT: tSec, scDur: totalDur }};
  const lastEnd = scenes[scenes.length - 1].end || totalDur || 25.0;
  let activeIdx = scenes.length - 1;
  for (let i = 0; i < scenes.length; i++) {{
    if (tSec <= (scenes[i].end || lastEnd)) {{
      activeIdx = i;
      break;
    }}
  }}
  const sc = scenes[activeIdx] || {{}};
  const scType = sc.type || 'image_text';
  const isCta = (scType === 'cta') || (activeIdx === scenes.length - 1 && scenes.length >= 5);
  const scStart = sc.start || 0;
  const scEnd = sc.end || lastEnd;
  return {{
    activeIdx,
    sc,
    isCta,
    localT: Math.max(0, tSec - scStart),
    scDur: Math.max(0.2, scEnd - scStart)
  }};
}}

function update3dCameraAndTvRig(tSec, normVol, activeSceneIdx, isCut, snapToTarget = false) {{
  // Coreografía de 5 escenas para la Cámara 3D y la Tele JVC del Café 80's
  let targetCamX = 0.0, targetCamY = 0.22, targetCamZ = 5.10;
  let targetRotX = 0.04, targetRotY = 0.0, targetRotZ = 0.0;
  let targetPosY = 0.78;

  if (cameraMode === 'FULL') {{
    targetCamX = 0.0; targetCamY = 0.20; targetCamZ = 5.38;
    targetRotY = Math.sin(tSec * 0.7) * 0.14;
  }} else if (cameraMode === 'MEDIUM') {{
    targetCamX = -0.68; targetCamY = 0.22; targetCamZ = 4.92;
    targetRotY = 0.22;
  }} else if (cameraMode === 'CLOSE') {{
    targetCamX = 0.32; targetCamY = 0.28; targetCamZ = 4.55;
    targetRotY = -0.14;
  }} else {{
    // Modo AUTO: 5 ángulos cinematográficos sincronizados con las 5 escenas
    switch (activeSceneIdx % 5) {{
      case 0: // Escena 1 (Hook): Plano frontal centrado y simétrico con balanceo suave
        targetCamX = 0.0; targetCamY = 0.22; targetCamZ = 5.08;
        targetRotY = Math.sin(tSec * 0.95) * 0.055;
        targetRotX = 0.04;
        break;
      case 1: // Escena 2 (Las 3 Claves): Órbita 3/4 izquierda luciendo las aletas rojas simétricas
        targetCamX = -0.68; targetCamY = 0.24; targetCamZ = 4.92;
        targetRotY = 0.21;
        targetRotX = 0.04;
        targetRotZ = -0.018;
        break;
      case 2: // Escena 3 (Estadística %): Contrapicado Hero mirando la tele desde abajo
        targetCamX = 0.24; targetCamY = -0.02; targetCamZ = 4.72;
        targetRotY = -0.14;
        targetRotX = 0.09;
        targetRotZ = 0.016;
        break;
      case 3: // Escena 4 (La Jugada): Órbita 3/4 derecha (espejo simétrico de la Escena 2)
        targetCamX = 0.68; targetCamY = 0.24; targetCamZ = 4.92;
        targetRotY = -0.21;
        targetRotX = 0.04;
        targetRotZ = 0.018;
        break;
      case 4: // Escena 5 (Cortinilla CTA): Pull-back centrado para lucir la tele completa sobre la cortinilla
      default:
        targetCamX = 0.0; targetCamY = 0.26; targetCamZ = 5.25;
        targetRotY = Math.sin(tSec * 0.85) * 0.08;
        targetRotX = 0.05;
        targetPosY = 0.88;
        break;
    }}
  }}

  if (enable3dMotion) {{
    // Balanceo físico de péndulo en el soporte del techo + vibración reactiva a la voz
    targetRotY += Math.sin(tSec * 1.25) * 0.05 + Math.cos(tSec * 0.72) * 0.025;
    targetRotX += Math.cos(tSec * 1.55) * 0.026 + normVol * 0.034;
    targetRotZ += Math.sin(tSec * 1.05) * 0.018;
    targetPosY += Math.sin(tSec * 1.9) * 0.028;
  }}

  const lerpFactor = snapToTarget ? 0.22 : 0.09;
  curCamX += (targetCamX - curCamX) * lerpFactor;
  curCamY += (targetCamY - curCamY) * lerpFactor;
  curCamZ += (targetCamZ - curCamZ) * lerpFactor;
  curTvRotX += (targetRotX - curTvRotX) * (lerpFactor * 1.2);
  curTvRotY += (targetRotY - curTvRotY) * (lerpFactor * 1.2);
  curTvRotZ += (targetRotZ - curTvRotZ) * (lerpFactor * 1.2);
  curTvPosY += (targetPosY - curTvPosY) * lerpFactor;

  camera.position.set(curCamX, curCamY, curCamZ);
  // Apuntamos ligeramente debajo de la tele para que el aparato 3D quede en la mitad superior (y=155..695px)
  camera.lookAt(0, curTvPosY - 0.66, 0);

  tvRig.position.set(0, curTvPosY, 0);
  tvRig.rotation.set(curTvRotX, curTvRotY, curTvRotZ);

  // Luz reactiva del tubo CRT
  crtBounceLight.intensity = 1.2 + normVol * 1.8 + (isCut ? 1.5 : 0);
  arcadeCyanLight.intensity = 2.1 + Math.sin(tSec * 3.2) * 0.4;
  dinerRedLight.intensity = 2.0 + Math.cos(tSec * 2.7) * 0.4;
}}

function drawCafe80sBackdrop(targetCtx, tSec, normVol) {{
  targetCtx.save();
  // Desplazamiento de paralaje 3D inverso al movimiento de cámara
  const px = -curCamX * 28;
  const py = (curCamY - 0.54) * 24;
  const scale = 1.08;
  const dw = 720 * scale, dh = 1280 * scale;
  const dx = (720 - dw) / 2 + px;
  const dy = (1280 - dh) / 2 + py;

  if (dinerBgImg.complete && dinerBgImg.naturalWidth > 0) {{
    targetCtx.drawImage(dinerBgImg, dx, dy, dw, dh);
  }} else {{
    targetCtx.fillStyle = '#0c101c';
    targetCtx.fillRect(0, 0, 720, 1280);
  }}

  // Oscurecimiento atmosférico + Sombra ambiental profunda detrás y debajo de la Tele 3D
  targetCtx.fillStyle = 'rgba(6, 8, 16, 0.48)';
  targetCtx.fillRect(0, 0, 720, 1280);

  // Sombra ambiental proyectada por la tele sobre la atmósfera del diner
  const shadowCx = 360 - curCamX * 42 + curTvRotY * 28;
  const shadowCy = 520 - (curTvPosY - 0.78) * 180;
  const ambShadow = targetCtx.createRadialGradient(shadowCx, shadowCy, 90, shadowCx, shadowCy + 45, 340);
  ambShadow.addColorStop(0, 'rgba(0, 0, 0, 0.72)');
  ambShadow.addColorStop(0.55, 'rgba(0, 0, 0, 0.38)');
  ambShadow.addColorStop(1, 'rgba(0, 0, 0, 0)');
  targetCtx.fillStyle = ambShadow;
  targetCtx.fillRect(0, 120, 720, 760);

  const glowGrad = targetCtx.createRadialGradient(360 - px * 0.5, 430, 40, 360, 450, 420);
  glowGrad.addColorStop(0, `rgba(0, 240, 255, ${{0.20 + normVol * 0.14}})`);
  glowGrad.addColorStop(0.55, `rgba(204, 255, 0, ${{0.07 + normVol * 0.08}})`);
  glowGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
  targetCtx.fillStyle = glowGrad;
  targetCtx.fillRect(0, 0, 720, 960);
  targetCtx.restore();
}}

function drawBrutalistBoxJs(targetCtx, x, y, w, h, fillCol, borderCol, shadowCol, borderW = 3, shadowOff = 6) {{
  if (shadowOff > 0 && shadowCol) {{
    targetCtx.fillStyle = shadowCol;
    targetCtx.fillRect(x + shadowOff, y + shadowOff, w, h);
  }}
  targetCtx.fillStyle = fillCol;
  targetCtx.fillRect(x, y, w, h);
  targetCtx.strokeStyle = borderCol;
  targetCtx.lineWidth = borderW;
  targetCtx.strokeRect(x, y, w, h);
}}

function wrapCanvasText(targetCtx, text, maxWidth) {{
  const words = String(text || '').trim().split(/\s+/);
  if (!words.length) return [];
  const lines = [];
  let cur = words[0];
  for (let i = 1; i < words.length; i++) {{
    const test = cur + ' ' + words[i];
    if (targetCtx.measureText(test).width <= maxWidth) {{
      cur = test;
    }} else {{
      lines.push(cur);
      cur = words[i];
    }}
  }}
  lines.push(cur);
  return lines;
}}

function drawTctSceneLowerThirds(targetCtx, tSec, totalDur) {{
  const scenes = PAYLOAD.scenes || [];
  if (!scenes.length || !showTctBrand) return false;

  const info = getSceneIndexAtTime(tSec, totalDur);
  const sc = info.sc;
  const scType = sc.type || 'image_text';
  const isCta = info.isCta;
  if (isCta && !showOutroCurtain) return isCta;
  if (!isCta && !showLowerThirds) return isCta;

  const localT = info.localT;
  const scDur = info.scDur;
  const entryProg = Math.min(1.0, localT / 0.25);
  const slideY = Math.round((1 - entryProg) * (1 - entryProg) * 65);

  targetCtx.save();
  const gradTop = isCta ? 690 : 790;
  const grad = targetCtx.createLinearGradient(0, gradTop, 0, 1280);
  grad.addColorStop(0, 'rgba(6, 8, 12, 0)');
  grad.addColorStop(1, isCta ? 'rgba(6, 8, 12, 0.90)' : 'rgba(6, 8, 12, 0.72)');
  targetCtx.fillStyle = grad;
  targetCtx.fillRect(0, gradTop, 720, 1280 - gradTop);

  const cleanTag = (txt) => String(txt || '').replace(/✦/g, '//').replace(/➔/g, '>>').trim();

  if (scType === 'title' && !isCta) {{
    const baseY = 855 + slideY;
    const tagTxt = cleanTag(sc.tag || '// NOTICIAS IA HOY //').toUpperCase();
    targetCtx.font = '900 18px Inter, Arial, sans-serif';
    const tw = Math.min(640, targetCtx.measureText(tagTxt).width + 32);
    drawBrutalistBoxJs(targetCtx, 28, baseY, tw, 38, '#CCFF00', '#0A0A0A', '#F0F0F0', 3, 4);
    targetCtx.fillStyle = '#0A0A0A';
    targetCtx.fillText(tagTxt, 42, baseY + 25);

    const t1 = String(sc.text1 || 'IMPACTO IA').toUpperCase();
    const t2 = String(sc.text2 || 'NUEVA ERA').toUpperCase();
    drawBrutalistBoxJs(targetCtx, 28, baseY + 48, 320, 62, '#0A0A0A', '#F0F0F0', '#CCFF00', 3, 6);
    targetCtx.fillStyle = '#F0F0F0';
    targetCtx.font = '900 36px Impact, Inter, sans-serif';
    targetCtx.fillText(t1, 46, baseY + 93);

    drawBrutalistBoxJs(targetCtx, 362, baseY + 48, 330, 62, '#CCFF00', '#0A0A0A', '#F0F0F0', 3, 6);
    targetCtx.fillStyle = '#0A0A0A';
    targetCtx.fillText(t2, 380, baseY + 93);

    const sub = String(sc.subtitle || sc.voice_text || '').trim();
    targetCtx.font = '700 21px Inter, Arial, sans-serif';
    const lines = wrapCanvasText(targetCtx, sub, 610).slice(0, 2);
    const bh = 26 + lines.length * 28;
    drawBrutalistBoxJs(targetCtx, 28, baseY + 126, 664, bh, '#0A0A0A', '#F0F0F0', '#CCFF00', 3, 6);
    targetCtx.fillStyle = '#CCFF00';
    targetCtx.fillRect(28, baseY + 126, 12, bh);
    targetCtx.fillStyle = '#F0F0F0';
    lines.forEach((ln, idx) => {{
      targetCtx.fillText(ln, 52, baseY + 156 + idx * 28);
    }});
  }} else if (scType === 'image_text' && sc.key_points && !isCta) {{
    const baseY = 820 + slideY;
    const titleTxt = cleanTag('// ' + String(sc.title || 'CLAVES DEL DÍA').toUpperCase() + ' //');
    targetCtx.font = '900 18px Inter, Arial, sans-serif';
    const tw = Math.min(640, targetCtx.measureText(titleTxt).width + 32);
    drawBrutalistBoxJs(targetCtx, 28, baseY, tw, 38, '#CCFF00', '#0A0A0A', '#F0F0F0', 3, 4);
    targetCtx.fillStyle = '#0A0A0A';
    targetCtx.fillText(titleTxt, 42, baseY + 25);

    const slots = [0.04, 0.26, 0.48];
    (sc.key_points || []).slice(0, 3).forEach((pt, k) => {{
      const appearT = scDur * slots[Math.min(k, 2)];
      if (localT < appearT) return;
      const kProg = Math.min(1.0, (localT - appearT) / 0.22);
      const kDx = Math.round((1 - kProg) * (1 - kProg) * -180);
      const cy = baseY + 48 + k * 74;
      const cx = 28 + kDx;
      drawBrutalistBoxJs(targetCtx, cx, cy, 664, 62, '#0A0A0A', '#F0F0F0', '#CCFF00', 3, 5);
      drawBrutalistBoxJs(targetCtx, cx, cy, 64, 62, '#CCFF00', '#F0F0F0', null, 3, 0);
      targetCtx.fillStyle = '#0A0A0A';
      targetCtx.font = '900 28px Impact, Inter, sans-serif';
      targetCtx.fillText('0' + (k + 1), cx + 16, cy + 42);
      targetCtx.fillStyle = '#F0F0F0';
      targetCtx.font = '700 20px Inter, Arial, sans-serif';
      const cleanPt = String(pt).replace(/^\s*\d+[.)-]\s*/, '');
      const ptLines = wrapCanvasText(targetCtx, cleanPt, 555).slice(0, 2);
      if (ptLines.length === 1) {{
        targetCtx.fillText(ptLines[0], cx + 82, cy + 38);
      }} else {{
        targetCtx.font = '700 18px Inter, Arial, sans-serif';
        targetCtx.fillText(ptLines[0], cx + 82, cy + 26);
        targetCtx.fillText(ptLines[1], cx + 82, cy + 48);
      }}
    }});
  }} else if ((scType === 'big_percentage' || scType === 'insight') && !isCta) {{
    const baseY = 850 + slideY;
    const hasNum = sc.number !== null && sc.number !== undefined && !isNaN(parseInt(sc.number, 10));
    const pctTarget = Math.max(1, Math.min(99, hasNum ? parseInt(sc.number, 10) : 88));
    const animRatio = Math.min(1.0, localT / Math.min(1.1, scDur * 0.55));
    const animPct = Math.round(pctTarget * (1 - Math.pow(1 - animRatio, 3)));
    const customMetric = String(sc.metric || '').trim().toUpperCase().slice(0, 6);

    drawBrutalistBoxJs(targetCtx, 28, baseY + 22, 664, 240, '#0A0A0A', '#CCFF00', '#F0F0F0', 4, 8);
    drawBrutalistBoxJs(targetCtx, 46, baseY, 270, 38, '#CCFF00', '#0A0A0A', '#F0F0F0', 3, 4);
    targetCtx.fillStyle = '#0A0A0A';
    targetCtx.font = '900 18px Inter, Arial, sans-serif';
    targetCtx.fillText('// DATO DURO IA //', 62, baseY + 25);

    const numVal = (customMetric && !customMetric.endsWith('%')) ? customMetric : (hasNum ? (animPct + '%') : (customMetric || 'DATO'));
    targetCtx.fillStyle = '#CCFF00';
    targetCtx.font = '900 72px Impact, Inter, sans-serif';
    targetCtx.fillText(numVal, 48, baseY + 122);

    targetCtx.fillStyle = '#F0F0F0';
    targetCtx.font = '900 24px Impact, Inter, sans-serif';
    targetCtx.fillText(String(sc.label || sc.title || 'MÉTRICA DEL REPORTE').toUpperCase().slice(0, 26), 255, baseY + 86);
    drawBrutalistBoxJs(targetCtx, 255, baseY + 104, 410, 24, '#181818', '#F0F0F0', null, 2, 0);
    targetCtx.fillStyle = '#CCFF00';
    targetCtx.fillRect(257, baseY + 106, Math.round(406 * (animPct / 100)), 20);

    targetCtx.fillStyle = '#C8D2C0';
    targetCtx.font = '700 19px Inter, Arial, sans-serif';
    const subLines = wrapCanvasText(targetCtx, sc.subtitle || sc.voice_text || '', 600).slice(0, 2);
    subLines.forEach((ln, idx) => {{
      targetCtx.fillText(ln, 48, baseY + 178 + idx * 25);
    }});
  }} else if (!isCta) {{
    const baseY = 852 + slideY;
    drawBrutalistBoxJs(targetCtx, 28, baseY, 310, 38, '#CCFF00', '#0A0A0A', '#F0F0F0', 3, 4);
    targetCtx.fillStyle = '#0A0A0A';
    targetCtx.font = '900 18px Inter, Arial, sans-serif';
    targetCtx.fillText('// LA JUGADA ESTRATÉGICA //', 42, baseY + 25);

    drawBrutalistBoxJs(targetCtx, 28, baseY + 48, 664, 72, '#CCFF00', '#0A0A0A', '#F0F0F0', 4, 7);
    targetCtx.fillStyle = '#0A0A0A';
    targetCtx.font = '900 36px Impact, Inter, sans-serif';
    targetCtx.fillText(String(sc.title || 'JUGADA OPERATIVA').toUpperCase().slice(0, 26), 46, baseY + 98);

    const sub = String(sc.subtitle || sc.voice_text || '').trim();
    targetCtx.font = '700 20px Inter, Arial, sans-serif';
    const sLines = wrapCanvasText(targetCtx, sub, 600).slice(0, 3);
    const bh = 28 + sLines.length * 28;
    drawBrutalistBoxJs(targetCtx, 28, baseY + 136, 664, bh, '#0A0A0A', '#F0F0F0', '#CCFF00', 3, 6);
    targetCtx.fillStyle = '#CCFF00';
    targetCtx.fillRect(28, baseY + 136, 12, bh);
    targetCtx.fillStyle = '#F0F0F0';
    sLines.forEach((ln, idx) => {{
      targetCtx.fillText(ln, 54, baseY + 168 + idx * 28);
    }});
  }} else {{
    const baseY = 746 + slideY;
    drawBrutalistBoxJs(targetCtx, 28, baseY, 390, 38, '#CCFF00', '#0A0A0A', '#F0F0F0', 3, 5);
    targetCtx.fillStyle = '#0A0A0A';
    targetCtx.font = '900 18px Inter, Arial, sans-serif';
    targetCtx.fillText('// HECHO 100% AUTOMÁTICO CON IA //', 42, baseY + 25);

    const cardY1 = baseY + 48;
    drawBrutalistBoxJs(targetCtx, 28, cardY1, 664, 258, '#0A0A0A', '#F0F0F0', '#CCFF00', 4, 9);
    targetCtx.fillStyle = '#CCFF00';
    targetCtx.fillRect(28, cardY1, 14, 258);

    targetCtx.fillStyle = '#F0F0F0';
    targetCtx.font = '900 27px Impact, Inter, sans-serif';
    targetCtx.fillText('ESTE CONTENIDO FUE CREADO', 54, cardY1 + 42);
    targetCtx.fillStyle = '#CCFF00';
    targetCtx.font = '900 36px Impact, Inter, sans-serif';
    targetCtx.fillText('100% AUTOMÁTICO CON IA', 54, cardY1 + 86);
    targetCtx.fillRect(54, cardY1 + 104, 485, 4);

    targetCtx.fillStyle = '#F0F0F0';
    targetCtx.font = '900 30px Impact, Inter, sans-serif';
    targetCtx.fillText(String(sc.headline || '¿LISTO PARA DOMINAR?').toUpperCase(), 54, cardY1 + 144);
    targetCtx.fillStyle = '#C8D2C0';
    targetCtx.font = '700 19px Inter, Arial, sans-serif';
    targetCtx.fillText(String(sc.sub || 'El superpoder de la IA para tu local o negocio.'), 54, cardY1 + 180);

    // Sello interior de invitación a la página web
    drawBrutalistBoxJs(targetCtx, 54, cardY1 + 198, 468, 42, '#141A10', '#CCFF00', null, 2, 0);
    targetCtx.fillStyle = '#CCFF00';
    targetCtx.font = '900 17px Inter, monospace';
    targetCtx.fillText('✦ CONÉCTATE HOY EN NUESTRA PÁGINA WEB ✦', 72, cardY1 + 225);

    // Botón / Sello Mecánico de Invitación a TALENTOCONTARIFA.LAT
    const isPressed = ((localT % 1.15) >= 0.25 && (localT % 1.15) <= 0.48);
    const pOff = isPressed ? 6 : 0;
    const sOff = isPressed ? 4 : 10;
    const btnX = 28 + pOff;
    const btnY = cardY1 + 276 + pOff;
    const btnW = 664;
    const btnH = 76;
    drawBrutalistBoxJs(targetCtx, btnX, btnY, btnW, btnH, '#CCFF00', '#0A0A0A', '#F0F0F0', 4, sOff);

    // Remaches circulares del sello + Logo TCT + Invitación a la página
    targetCtx.fillStyle = '#0A0A0A';
    targetCtx.beginPath();
    targetCtx.arc(btnX + 26, btnY + btnH / 2, 7, 0, Math.PI * 2);
    targetCtx.arc(btnX + btnW - 26, btnY + btnH / 2, 7, 0, Math.PI * 2);
    targetCtx.fill();

    if (tctBlackImg.complete && tctBlackImg.naturalWidth > 0) {{
      targetCtx.drawImage(tctBlackImg, btnX + 46, btnY + 17, 44, 42);
    }}
    targetCtx.fillStyle = '#0A0A0A';
    targetCtx.font = '900 32px Impact, Inter, sans-serif';
    targetCtx.fillText('VISITA TALENTOCONTARIFA.LAT   >>', btnX + 102, btnY + 51);

    // Mascota Cerebrito SIEMPRE ADELANTE (en primer plano sobre la tarjeta y textos)
    if (tctCerebroImg.complete && tctCerebroImg.naturalWidth > 0) {{
      const bobY = Math.sin(tSec * 3.2) * 6;
      const cx = 720 - 172;
      const cy = cardY1 - 46 + bobY;
      targetCtx.save();
      targetCtx.shadowColor = '#CCFF00';
      targetCtx.shadowBlur = 0;
      targetCtx.shadowOffsetX = 5;
      targetCtx.shadowOffsetY = 5;
      targetCtx.drawImage(tctCerebroImg, cx, cy, 142, 152);
      targetCtx.restore();
    }}
  }}
  targetCtx.restore();
  return isCta;
}}

function drawTctTopBranding(targetCtx, tSec, totalDur, hideBottomPill) {{
  if (!showTctBrand) return;
  targetCtx.save();

  const prog = Math.min(1.0, Math.max(0.0, tSec / Math.max(0.1, totalDur)));
  targetCtx.fillStyle = '#1d1d1d';
  targetCtx.fillRect(0, 0, 720, 8);
  targetCtx.fillStyle = '#CCFF00';
  targetCtx.fillRect(0, 0, 720 * prog, 8);

  const sx = 28, sy = 24, sw = 252, sh = 62;
  targetCtx.fillStyle = '#F0F0F0';
  targetCtx.fillRect(sx + 5, sy + 5, sw, sh);
  targetCtx.fillStyle = '#CCFF00';
  targetCtx.fillRect(sx, sy, sw, sh);
  targetCtx.lineWidth = 3.5;
  targetCtx.strokeStyle = '#000000';
  targetCtx.strokeRect(sx, sy, sw, sh);

  if (tctBlackImg.complete && tctBlackImg.naturalWidth > 0) {{
    targetCtx.drawImage(tctBlackImg, sx + 10, sy + 11, 44, 40);
  }}
  targetCtx.fillStyle = '#000000';
  targetCtx.font = '900 21px Inter, Impact, sans-serif';
  targetCtx.fillText('TALENTO', sx + 62, sy + 28);
  targetCtx.fillText('CON TARIFA', sx + 62, sy + 51);

  const bx = 720 - 28 - 196, by = 28, bw = 196, bh = 52;
  targetCtx.fillStyle = '#0A0A0A';
  targetCtx.fillRect(bx, by, bw, bh);
  targetCtx.strokeStyle = '#CCFF00';
  targetCtx.lineWidth = 3;
  targetCtx.strokeRect(bx, by, bw, bh);

  const blink = Math.floor(tSec * 2) % 2 === 0;
  targetCtx.beginPath();
  targetCtx.arc(bx + 22, by + bh / 2, 7, 0, Math.PI * 2);
  if (blink) {{
    targetCtx.fillStyle = '#CCFF00';
    targetCtx.fill();
  }} else {{
    targetCtx.strokeStyle = '#CCFF00';
    targetCtx.lineWidth = 2;
    targetCtx.stroke();
  }}
  targetCtx.fillStyle = '#F0F0F0';
  targetCtx.font = '900 20px Inter, monospace';
  targetCtx.fillText('NOTICIAS IA', bx + 38, by + 33);

  // Sello inferior permanente de invitación a la página web (Escenas 1 a 4)
  if (!hideBottomPill) {{
    const fx = 28, fy = 1280 - 60, fw = 436, fh = 44;
    targetCtx.fillStyle = '#CCFF00';
    targetCtx.fillRect(fx + 5, fy + 5, fw, fh);
    targetCtx.fillStyle = '#0A0A0A';
    targetCtx.fillRect(fx, fy, fw, fh);
    targetCtx.strokeStyle = '#CCFF00';
    targetCtx.lineWidth = 2.5;
    targetCtx.strokeRect(fx, fy, fw, fh);
    if (tctLimeImg.complete && tctLimeImg.naturalWidth > 0) {{
      targetCtx.drawImage(tctLimeImg, fx + 12, fy + 10, 26, 24);
    }}
    targetCtx.fillStyle = '#F0F0F0';
    targetCtx.font = '900 16px Inter, monospace';
    targetCtx.fillText('VISITA:', fx + 46, fy + 28);
    targetCtx.fillStyle = '#CCFF00';
    targetCtx.font = '900 18px Inter, monospace';
    targetCtx.fillText('TALENTOCONTARIFA.LAT  >>', fx + 118, fy + 28);
  }}
  targetCtx.restore();
}}

// ============================================================================
// 6. FUNCIÓN MAESTRA DE RENDERIZADO (TIEMPO REAL + RENDER OFFLINE DETERMINISTA)
// ============================================================================
let prevSceneIdxGlobal = 0;

function renderCompositeAtState(tSec, totalDur, snapIdx, prevIdx, normVol, isOffline = false) {{
  const sceneInfo = getSceneIndexAtTime(tSec, totalDur);
  const activeSceneIdx = sceneInfo.activeIdx;

  // Determinar encuadre interno dentro de la tele CRT
  const shotCycle = ['FULL', 'CLOSE', 'MEDIUM', 'CLOSE', 'MEDIUM'];
  const activeShot = (cameraMode === 'AUTO')
    ? shotCycle[Math.min(activeSceneIdx, shotCycle.length - 1)]
    : cameraMode;

  if (activeSceneIdx !== prevSceneIdxGlobal || activeShot !== prevShotMode) {{
    cutGlitchFrames = 4;
    prevSceneIdxGlobal = activeSceneIdx;
    prevShotMode = activeShot;
  }}
  const isChannelCut = cutGlitchFrames > 0;
  if (cutGlitchFrames > 0) cutGlitchFrames--;

  // 1. Actualizar pantalla CRT interna con el personaje + Max Headroom FX
  drawInsideCrtScreen(snapIdx, prevIdx, activeShot, tSec, normVol, isChannelCut, activeSceneIdx);
  crtTexture.needsUpdate = true;

  // 2. Actualizar física 3D de la Tele y Cámara en Three.js
  update3dCameraAndTvRig(tSec, normVol, activeSceneIdx, isChannelCut, isOffline);
  renderer.render(scene, camera);

  // 3. Componer en el Canvas 9:16 final: Fondo Café 80's + Sombra 3D Multicapa + Tele 3D WebGL + Apoyos TCT
  stageCtx.clearRect(0, 0, 720, 1280);
  drawCafe80sBackdrop(stageCtx, tSec, normVol);

  // Capa 1 de sombra 3D: Penumbra suave proyectada hacia abajo por todo el chasis de la tele
  stageCtx.save();
  stageCtx.shadowColor = 'rgba(0, 0, 0, 0.85)';
  stageCtx.shadowBlur = 38;
  stageCtx.shadowOffsetX = Math.round(-curCamX * 14);
  stageCtx.shadowOffsetY = 26;
  stageCtx.drawImage(webglCanvas, 0, 0, 720, 1280);
  stageCtx.restore();

  // Capa 2 de sombra 3D: Sombra de contacto densa pegada a los bordes y aletas de la tele
  stageCtx.save();
  stageCtx.shadowColor = 'rgba(0, 0, 0, 0.72)';
  stageCtx.shadowBlur = 12;
  stageCtx.shadowOffsetX = Math.round(-curCamX * 5);
  stageCtx.shadowOffsetY = 8;
  stageCtx.drawImage(webglCanvas, 0, 0, 720, 1280);
  stageCtx.restore();

  const isCta = drawTctSceneLowerThirds(stageCtx, tSec, totalDur);
  drawTctTopBranding(stageCtx, tSec, totalDur, isCta && showOutroCurtain);
}}

// API para el Renderizador Offline Determinista (Playwright -> FFmpeg)
window.isReady = false;
window.addEventListener('load', () => {{
  setTimeout(() => {{ window.isReady = true; }}, 250);
}});

window.renderOfflineBatch = function(framesSpec) {{
  const outJpegs = [];
  for (let k = 0; k < framesSpec.length; k++) {{
    const f = framesSpec[k];
    renderCompositeAtState(f.tSec, f.totalDur, f.snapIdx, f.prevIdx, f.normVol, true);
    outJpegs.push(stageCanvas.toDataURL('image/jpeg', 0.94));
  }}
  return outJpegs;
}};

// Bucle en vivo para el Estudio Interactivo HTML
const OFFLINE_MODE = {str(bool(offline_render_mode)).lower()};
let lastTickMs = 0;

function liveLoop(nowMs) {{
  if (OFFLINE_MODE) return;
  requestAnimationFrame(liveLoop);
  if (nowMs - lastTickMs < 1000 / 30) return;
  lastTickMs = nowMs;

  const tSec = (currentAudio && !currentAudio.paused)
    ? currentAudio.currentTime
    : (nowMs / 1000);
  const totalDur = (currentAudio && !currentAudio.paused && currentAudioDuration > 0)
    ? currentAudioDuration
    : (PAYLOAD.total_duration || 26.0);

  let normVol = 0;
  let centroidHz = 1200;
  let lowRatio = 0.5;

  if (analyser && isSpeaking) {{
    const timeData = new Float32Array(analyser.fftSize);
    analyser.getFloatTimeDomainData(timeData);
    let sumSq = 0;
    for (let i = 0; i < timeData.length; i++) sumSq += timeData[i] * timeData[i];
    const rms = Math.sqrt(sumSq / timeData.length);
    normVol = Math.min(1.15, rms / 0.13);

    const freqData = new Uint8Array(analyser.frequencyBinCount);
    analyser.getByteFrequencyData(freqData);
    const sr = audioCtx ? audioCtx.sampleRate : 48000;
    const binHz = (sr / 2) / freqData.length;
    let num = 0, den = 0, eLow = 0, eHigh = 0;
    for (let i = 1; i < freqData.length; i++) {{
      const f = i * binHz;
      const mag = freqData[i];
      num += f * mag;
      den += mag;
      if (f >= 250 && f <= 750) eLow += mag;
      else if (f >= 1200 && f <= 3800) eHigh += mag;
    }}
    centroidHz = den > 0 ? (num / den) : 1200;
    lowRatio = (eLow + eHigh) > 0 ? (eLow / (eLow + eHigh)) : 0.5;
  }}

  const volEl = document.getElementById('volMeter');
  if (volEl) volEl.style.width = Math.min(100, Math.round(normVol * 90)) + '%';

  // Selección de visema en vivo con Rhubarb (+40ms Pre-Roll) o FFT
  let snapIdx = 2;
  const prevIdx = prevPhoneticIdx;
  const mouthCues = PAYLOAD.mouth_cues || [];
  const lookupTime = tSec + 0.040; // +40ms Pre-Roll fonético

  let matchedCue = null;
  if (isSpeaking && mouthCues.length > 0 && !micStream) {{
    for (let i = 0; i < mouthCues.length; i++) {{
      if (lookupTime >= mouthCues[i].start && lookupTime < mouthCues[i].end) {{
        matchedCue = mouthCues[i].value;
        break;
      }}
    }}
  }}

  const modBlink = Math.floor(nowMs / 33) % 75;
  if ((modBlink === 72 || modBlink === 73) && normVol < 0.35) {{
    snapIdx = 0;
  }} else if ((modBlink === 71 || modBlink === 74) && normVol < 0.35) {{
    snapIdx = 1;
  }} else if (matchedCue) {{
    snapIdx = mapRhubarbCueTo16Viseme(matchedCue, normVol, centroidHz, lowRatio);
  }} else if (normVol < 0.12) {{
    snapIdx = 2;
  }} else if (normVol < 0.25) {{
    snapIdx = (lowRatio > 0.65) ? 4 : 3;
  }} else if (normVol < 0.45) {{
    snapIdx = (centroidHz > 1950) ? 7 : ((lowRatio > 0.66) ? 6 : 5);
  }} else if (normVol < 0.72) {{
    snapIdx = (lowRatio > 0.65) ? 11 : ((centroidHz > 2100) ? 8 : 10);
  }} else {{
    snapIdx = (lowRatio > 0.63) ? 12 : ((normVol < 0.88) ? 13 : 15);
  }}

  prevPhoneticIdx = snapIdx;

  for (let i = 0; i < ladderImages.length; i++) {{
    const el = document.getElementById('hud_' + i);
    if (el) el.classList.toggle('active', i === snapIdx);
  }}

  renderCompositeAtState(tSec, totalDur, snapIdx, prevIdx, normVol, false);

  const fpsEl = document.getElementById('fpsCounter');
  if (fpsEl && PAYLOAD.ladder[snapIdx]) {{
    fpsEl.textContent = `30 FPS | ${{PAYLOAD.ladder[snapIdx].key}} | 3D CRT CAFÉ 80'S`;
  }}
}}

if (!OFFLINE_MODE) {{
  requestAnimationFrame(liveLoop);
}}
</script>
</body>
</html>
"""
    return html


def render_threejs_cafe80s_video(
    packager,
    payload_dict,
    positions,
    norm_rms,
    total_vframes,
    fps,
    final_audio_for_mux,
    output_mp4_path,
):
    """
    Renderiza el video MP4 usando el motor Three.js WebGL real (en Chromium vía Playwright)
    avanzando cuadro por cuadro de forma 100% determinista (sin desfase ni caída de frames).
    Devuelve True si se completó con éxito, o False si Playwright/Chromium no está disponible.
    """
    try:
        from playwright.sync_api import sync_playwright
    except Exception as e:
        print(f"   ℹ️ Playwright no disponible ({e}), usando motor 3D perspectiva nativo...")
        return False

    three_js_path = os.path.join(packager.assets_dir, "three.min.js")
    three_js_code = ""
    if os.path.exists(three_js_path):
        with open(three_js_path, "r", encoding="utf-8", errors="ignore") as tf:
            three_js_code = tf.read()

    lcd_font_b64 = ""
    if os.path.exists(packager.lcd_font_path):
        with open(packager.lcd_font_path, "rb") as ff:
            lcd_font_b64 = base64.b64encode(ff.read()).decode("ascii")

    temp_html_path = os.path.abspath(output_mp4_path + ".cafe80s_render.html")
    html_content = build_cafe80s_threejs_html(
        payload_dict,
        three_js_code=three_js_code,
        lcd_font_b64=lcd_font_b64,
        offline_render_mode=True,
    )
    with open(temp_html_path, "w", encoding="utf-8") as hf:
        hf.write(html_content)

    duration_sec = total_vframes / float(fps)
    frames_spec = []
    prev_idx = 2
    for i in range(total_vframes):
        snap_idx = int(np.clip(round(positions[i]), 0, len(packager.rgba_ladder) - 1))
        frames_spec.append(
            {
                "tSec": round(i / float(fps), 4),
                "totalDur": round(duration_sec, 4),
                "snapIdx": snap_idx,
                "prevIdx": prev_idx,
                "normVol": round(float(norm_rms[i]), 4),
            }
        )
        prev_idx = snap_idx

    ffmpeg_cmd = [
        packager.ffmpeg_path,
        "-y",
        "-f",
        "image2pipe",
        "-vcodec",
        "mjpeg",
        "-r",
        str(fps),
        "-i",
        "-",
        "-i",
        final_audio_for_mux,
        "-c:v",
        "libx264",
        "-pix_fmt",
        "yuv420p",
        "-crf",
        "17",
        "-preset",
        "fast",
        "-c:a",
        "aac",
        "-b:a",
        "192k",
        "-shortest",
        output_mp4_path,
    ]

    try:
        file_url = "file:///" + temp_html_path.replace("\\", "/")
        with sync_playwright() as p:
            browser = p.chromium.launch(
                headless=True,
                args=[
                    "--enable-webgl",
                    "--ignore-gpu-blocklist",
                    "--use-gl=angle",
                    "--disable-web-security",
                ],
            )
            context = browser.new_context(viewport={"width": 720, "height": 1280})
            page = context.new_page()
            page.goto(file_url, wait_until="load", timeout=45000)
            page.wait_for_function("() => window.isReady === true", timeout=20000)

            proc = subprocess.Popen(
                ffmpeg_cmd,
                stdin=subprocess.PIPE,
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
            )

            batch_size = 24
            for b_start in range(0, total_vframes, batch_size):
                batch = frames_spec[b_start : b_start + batch_size]
                data_urls = page.evaluate("(b) => window.renderOfflineBatch(b)", batch)
                for d_url in data_urls:
                    _, b64_part = d_url.split(",", 1)
                    proc.stdin.write(base64.b64decode(b64_part))

            proc.stdin.close()
            proc.wait(timeout=60)
            context.close()
            browser.close()

        if os.path.exists(temp_html_path):
            os.remove(temp_html_path)
        return proc.returncode == 0 and os.path.exists(output_mp4_path)
    except Exception as e:
        print(f"   ⚠️ Aviso en render Three.js headless ({e}), activando respaldo 3D OpenCV...")
        if os.path.exists(temp_html_path):
            try:
                os.remove(temp_html_path)
            except Exception:
                pass
        return False


def render_cafe80s_tv_frame_cv2_fallback(
    diner_bg_bgr,
    char_screen_bgr,
    frame_idx,
    t_sec,
    vol,
    active_scene_idx,
    is_cta_scene=False,
):
    """
    Respaldo de Proyección en Perspectiva 3D Real (OpenCV / NumPy) para entornos Linux CI
    donde no haya navegador Chromium instalado:
    Proyecta la carcasa 3D de la tele JVC del Café 80's (con sus aletas rojas, corona perforada,
    bandeja inferior y tubo CRT con warpPerspective 3D) sobre el fondo del Café de los 80's.
    """
    H, W = diner_bg_bgr.shape[:2]
    out = (diner_bg_bgr.astype(np.float32) * 0.56).astype(np.uint8)

    # Ángulos 3D según la escena + balanceo físico
    scene_yaw = [-0.08, 0.16, -0.12, -0.16, 0.06][active_scene_idx % 5]
    yaw = scene_yaw + math.sin(t_sec * 1.25) * 0.06
    pitch = 0.04 + math.cos(t_sec * 1.5) * 0.03 + vol * 0.035
    cy_center = 395 if is_cta_scene else 435
    cx_center = int(W // 2 + yaw * 65)

    # Dimensiones de la pantalla CRT proyectada en 3D
    sw, sh = 410, 315
    dx_persp = int(yaw * 42)
    dy_persp = int(pitch * 26)

    pts_dst = np.float32(
        [
            [cx_center - sw // 2 + dx_persp, cy_center - sh // 2 + max(0, dy_persp)],
            [cx_center + sw // 2 + dx_persp, cy_center - sh // 2 - max(0, -dy_persp)],
            [cx_center + sw // 2 - dx_persp, cy_center + sh // 2 + max(0, -dy_persp)],
            [cx_center - sw // 2 - dx_persp, cy_center + sh // 2 - max(0, dy_persp)],
        ]
    )

    # 1. Corona triangular superior con 3 círculos perforados
    crown_pts = np.array(
        [
            [int(pts_dst[0][0] - 25), int(pts_dst[0][1] - 32)],
            [int(pts_dst[1][0] + 25), int(pts_dst[1][1] - 32)],
            [cx_center + 28, int(pts_dst[0][1] - 115)],
            [cx_center - 28, int(pts_dst[0][1] - 115)],
        ],
        dtype=np.int32,
    )
    cv2.fillConvexPoly(out, crown_pts, (52, 78, 72), cv2.LINE_AA)
    cv2.polylines(out, [crown_pts], True, (0, 255, 204), 2, cv2.LINE_AA)
    for hx_off, hy_off, hr in [(-78, -60, 18), (0, -74, 22), (78, -60, 18)]:
        cv2.circle(out, (cx_center + hx_off, int(pts_dst[0][1] + hy_off)), hr, (22, 24, 34), -1, cv2.LINE_AA)
        cv2.circle(out, (cx_center + hx_off, int(pts_dst[0][1] + hy_off)), hr, (180, 200, 190), 2, cv2.LINE_AA)

    # 2. Aletas laterales rojas JVC (BTTF2 Café 80's Wings)
    left_wing = np.array(
        [
            [int(pts_dst[0][0] - 18), int(pts_dst[0][1] - 24)],
            [int(pts_dst[0][0] - 98), int(pts_dst[0][1] - 10)],
            [int(pts_dst[3][0] - 78), int(pts_dst[3][1] - 15)],
            [int(pts_dst[3][0] - 18), int(pts_dst[3][1] + 10)],
        ],
        dtype=np.int32,
    )
    right_wing = np.array(
        [
            [int(pts_dst[1][0] + 18), int(pts_dst[1][1] - 24)],
            [int(pts_dst[1][0] + 98), int(pts_dst[1][1] - 10)],
            [int(pts_dst[2][0] + 78), int(pts_dst[2][1] - 15)],
            [int(pts_dst[2][0] + 18), int(pts_dst[2][1] + 10)],
        ],
        dtype=np.int32,
    )
    cv2.fillConvexPoly(out, left_wing, (26, 20, 125), cv2.LINE_AA)
    cv2.fillConvexPoly(out, right_wing, (26, 20, 125), cv2.LINE_AA)
    cv2.polylines(out, [left_wing], True, (0, 255, 204), 2, cv2.LINE_AA)
    cv2.polylines(out, [right_wing], True, (0, 255, 204), 2, cv2.LINE_AA)

    # 3. Marco de carcasa CRT y bandeja inferior roja con franja amarilla/lima
    pad = 22
    bezel_pts = pts_dst + np.float32([[-pad, -pad], [pad, -pad], [pad, pad + 18], [-pad, pad + 18]])
    cv2.fillConvexPoly(out, bezel_pts.astype(np.int32), (20, 22, 28), cv2.LINE_AA)
    cv2.polylines(out, [bezel_pts.astype(np.int32)], True, (180, 190, 200), 3, cv2.LINE_AA)

    tray_y1 = int(pts_dst[3][1] + 32)
    tray_y2 = tray_y1 + 54
    cv2.rectangle(out, (cx_center - 190, tray_y1), (cx_center + 190, tray_y2), (28, 22, 138), -1)
    cv2.rectangle(out, (cx_center - 190, tray_y1 + 26), (cx_center + 190, tray_y1 + 38), (0, 210, 255), -1)
    cv2.rectangle(out, (cx_center - 190, tray_y1), (cx_center + 190, tray_y2), (0, 255, 204), 2)

    # 4. Proyectar el video del personaje adentro de la pantalla CRT 3D con warpPerspective
    ch_h, ch_w = char_screen_bgr.shape[:2]
    pts_src = np.float32([[0, 0], [ch_w, 0], [ch_w, ch_h], [0, ch_h]])
    M_p = cv2.getPerspectiveTransform(pts_src, pts_dst)
    warped_screen = cv2.warpPerspective(char_screen_bgr, M_p, (W, H))

    mask = np.zeros((H, W), dtype=np.uint8)
    cv2.fillConvexPoly(mask, pts_dst.astype(np.int32), 255)
    out = np.where(mask[:, :, None] > 0, warped_screen, out)
    cv2.polylines(out, [pts_dst.astype(np.int32)], True, (0, 255, 204), 2, cv2.LINE_AA)
    return out
