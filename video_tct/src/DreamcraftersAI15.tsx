import {
  AbsoluteFill, Audio, Img, Sequence, staticFile,
  useCurrentFrame, useVideoConfig, spring, interpolate, random,
} from 'remotion';
import React from 'react';

// ADN Visual: Talento con Tarifa — Neo-Brutalist
// #C0FF00 Neon | #0A0A0A Black | #F0F0F0 White | Inter 900 + JetBrains Mono
const loadFonts = () => {
  if (typeof window === 'undefined') return;
  const l = document.createElement('link');
  l.href = 'https://fonts.googleapis.com/css2?family=Inter:wght@400;700;900&family=JetBrains+Mono:wght@400;700&display=swap';
  l.rel = 'stylesheet';
  document.head.appendChild(l);
};
loadFonts();

const C = { black: '#0A0A0A', white: '#F0F0F0', neon: '#C0FF00', neonDim: '#8AB800' };

// ── BACKGROUND ──────────────────────────────────────────────
const Background: React.FC = () => (
  <AbsoluteFill style={{ backgroundColor: C.black, overflow: 'hidden' }}>
    <svg width="1080" height="1920" style={{ position: 'absolute', top: 0, left: 0, opacity: 0.06 }}>
      {Array.from({ length: 36 }).map((_, i) => (
        <line key={`d${i}`} x1={i * 60 - 400} y1={0} x2={i * 60 + 400} y2={1920} stroke={C.neon} strokeWidth="1" />
      ))}
      {Array.from({ length: 96 }).map((_, i) => (
        <line key={`h${i}`} x1={0} y1={i * 20} x2={1080} y2={i * 20} stroke={C.white} strokeWidth="0.4" />
      ))}
    </svg>
    {/* Corner brackets */}
    <svg width="140" height="140" style={{ position: 'absolute', top: 60, left: 60 }}>
      <polyline points="0,70 0,0 70,0" fill="none" stroke={C.neon} strokeWidth="5" />
    </svg>
    <svg width="140" height="140" style={{ position: 'absolute', bottom: 60, right: 60 }}>
      <polyline points="140,70 140,140 70,140" fill="none" stroke={C.neon} strokeWidth="5" />
    </svg>
  </AbsoluteFill>
);

// ── GLITCH ────────────────────────────────────────────────────
const Glitch: React.FC = () => {
  const frame = useCurrentFrame();
  if (frame % 9 !== 0 && frame % 17 !== 0) return null;
  return (
    <AbsoluteFill style={{ pointerEvents: 'none', zIndex: 99 }}>
      {[0, 1, 2].map(i => (
        <div key={i} style={{
          position: 'absolute',
          top: random(`gy-${frame}-${i}`) * 1920,
          left: 0, right: 0,
          height: 3 + random(`gh-${frame}-${i}`) * 18,
          backgroundColor: C.neon, opacity: 0.07,
          transform: `translateX(${(random(`gx-${frame}-${i}`) - 0.5) * 40}px)`,
        }} />
      ))}
    </AbsoluteFill>
  );
};

// ── PARTICLES ─────────────────────────────────────────────────
const Particles: React.FC = () => {
  const frame = useCurrentFrame();
  return (
    <AbsoluteFill style={{ pointerEvents: 'none' }}>
      {Array.from({ length: 20 }).map((_, i) => {
        const x = random(`px${i}`) * 1080;
        const speed = 2 + random(`ps${i}`) * 4;
        const size = 2 + random(`pz${i}`) * 4;
        const y = (1920 + random(`py${i}`) * 800) - frame * speed;
        const op = interpolate(y, [300, 1000], [0, 0.7], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
        const neon = random(`pc${i}`) > 0.5;
        return (
          <div key={i} style={{
            position: 'absolute', left: x, top: y,
            width: size, height: size, borderRadius: '50%',
            backgroundColor: neon ? C.neon : C.white, opacity: op,
            boxShadow: neon ? `0 0 8px ${C.neon}` : 'none',
          }} />
        );
      })}
    </AbsoluteFill>
  );
};

// ── MARQUEE ───────────────────────────────────────────────────
const Marquee: React.FC<{ y: number; text: string; reverse?: boolean }> = ({ y, text, reverse }) => {
  const frame = useCurrentFrame();
  const offset = (frame * 2.5) % 900;
  return (
    <div style={{
      position: 'absolute', top: y, left: 0, right: 0, height: 46,
      overflow: 'hidden', backgroundColor: `${C.black}DD`,
      borderTop: `1px solid ${C.neon}33`, borderBottom: `1px solid ${C.neon}33`,
      display: 'flex', alignItems: 'center',
    }}>
      <div style={{
        transform: `translateX(${reverse ? offset : -offset}px)`,
        whiteSpace: 'nowrap',
        fontFamily: '"JetBrains Mono", monospace',
        fontSize: 16, fontWeight: 700, letterSpacing: '0.35em',
        color: C.neon, textTransform: 'uppercase', opacity: 0.85,
      }}>
        {`${text} ■ `.repeat(10)}
      </div>
    </div>
  );
};

// ── HUD ───────────────────────────────────────────────────────
const HUD: React.FC = () => {
  const frame = useCurrentFrame();
  const pulse = Math.sin(frame / 8) * 0.5 + 0.5;
  return (
    <div style={{
      position: 'absolute', bottom: 140, left: 80, right: 80,
      display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', zIndex: 5,
    }}>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 5 }}>
        {Array.from({ length: 10 }).map((_, i) => {
          const h = interpolate(Math.sin(frame / 8 + i * 0.8), [-1, 1], [6, 55]);
          return <div key={i} style={{
            width: 9, height: h, borderRadius: '2px 2px 0 0',
            backgroundColor: i % 3 === 0 ? C.neon : C.white,
            opacity: i % 3 === 0 ? 1 : 0.2,
            boxShadow: i % 3 === 0 ? `0 0 10px ${C.neon}` : 'none',
          }} />;
        })}
      </div>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 10,
        fontFamily: '"JetBrains Mono", monospace', fontSize: 15,
        color: C.white, letterSpacing: '0.3em', textTransform: 'uppercase', opacity: 0.65,
      }}>
        <div style={{
          width: 9, height: 9, borderRadius: '50%', backgroundColor: C.neon,
          opacity: pulse, boxShadow: `0 0 14px ${C.neon}`,
        }} />
        DREAMCRAFTERS.LAT
      </div>
    </div>
  );
};

// ── BIG WORD ─────────────────────────────────────────────────
const BW: React.FC<{ text: string; sf: number; fs?: number; outline?: boolean; color?: string; d?: number }> = ({
  text, sf, fs = 140, outline = false, color, d = 0,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const p = spring({ frame: frame - sf - d, fps, config: { damping: 11, mass: 0.5, stiffness: 220 } });
  return (
    <div style={{
      fontFamily: '"Inter", sans-serif', fontWeight: 900, fontSize: fs, lineHeight: 0.88,
      color: outline ? 'transparent' : (color ?? C.white),
      WebkitTextStroke: outline ? `2px ${color ?? C.neon}` : 'none',
      textTransform: 'uppercase', letterSpacing: '-0.04em',
      transform: `translateY(${interpolate(p, [0, 1], [50, 0])}px) scale(${interpolate(p, [0, 1], [0.85, 1])})`,
      opacity: interpolate(p, [0, 0.3], [0, 1], { extrapolateRight: 'clamp' }),
      display: 'inline-block',
    }}>{text}</div>
  );
};

// ═══════════════════════════════════════════════════════════
//  ESCENA 1 — 0s a 5s (frames 0–150): "ESTE VIDEO / CON IA"
// ═══════════════════════════════════════════════════════════
const Scene1: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const labelOp = spring({ frame: frame - 5, fps, config: { damping: 18 } });

  return (
    <AbsoluteFill style={{ justifyContent: 'center', alignItems: 'flex-start', padding: '0 80px', paddingTop: 500 }}>
      <div style={{
        fontFamily: '"JetBrains Mono", monospace', fontSize: 18, color: C.neon,
        letterSpacing: '0.4em', textTransform: 'uppercase', marginBottom: 28, opacity: labelOp,
      }}>
        // AI_CONTENT_V2.0
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <BW text="Este" sf={0} fs={170} />
        <BW text="video" sf={0} fs={170} outline color={C.neon} d={4} />
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 16, marginTop: 8 }}>
          <BW text="con" sf={0} fs={110} d={8} />
          {/* "IA" en bloque sólido neón */}
          <div style={{
            backgroundColor: C.neon,
            padding: '4px 28px',
            transform: `scaleX(${spring({ frame: frame - 12, fps: fps, config: { damping: 10, stiffness: 300 } })})`,
            transformOrigin: 'left',
          }}>
            <BW text="IA" sf={12} fs={160} color={C.black} />
          </div>
        </div>
      </div>
    </AbsoluteFill>
  );
};

// ═══════════════════════════════════════════════════════════
//  ESCENA 2 — 5s a 10s (frames 150–300): CEREBRO + PLUS
// ═══════════════════════════════════════════════════════════
const Scene2: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const brainE = spring({ frame: frame - 8, fps, config: { damping: 14, mass: 1.1 } });
  const brainY = interpolate(brainE, [0, 1], [280, 0]);
  const brainFloat = Math.sin(frame / 16) * 14;
  const brainRot = Math.sin(frame / 28) * 5;

  return (
    <AbsoluteFill style={{ justifyContent: 'center', alignItems: 'flex-start', padding: '0 80px', paddingTop: 280 }}>
      {/* Cerebro flotante */}
      <div style={{
        position: 'absolute', right: -50, top: 60, width: 560,
        transform: `translateY(${brainY + brainFloat}px) rotate(${brainRot}deg)`,
        opacity: interpolate(brainE, [0, 0.4], [0, 1], { extrapolateRight: 'clamp' }),
        filter: `drop-shadow(0 0 50px ${C.neon}66)`,
        zIndex: 3,
      }}>
        <Img src={staticFile('cerebro.webp')} style={{ width: '100%', height: 'auto' }} />
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, position: 'relative', zIndex: 4 }}>
        <BW text="La auto-" sf={0} fs={125} />
        <BW text="matización" sf={0} fs={98} outline color={C.neon} d={5} />
        <BW text="= el gran" sf={0} fs={105} d={10} />
        <div style={{ display: 'flex', alignItems: 'center', gap: 18, marginTop: 6 }}>
          <BW text="PLUS" sf={0} fs={180} color={C.neon} d={16} />
          <div style={{
            width: 10, height: 10, borderRadius: '50%', backgroundColor: C.neon,
            boxShadow: `0 0 22px ${C.neon}`, opacity: Math.sin(frame / 5) > 0 ? 1 : 0.3, marginBottom: 25,
          }} />
        </div>
        <BW text="para tu negocio." sf={0} fs={70} d={22} />
      </div>
    </AbsoluteFill>
  );
};

// ═══════════════════════════════════════════════════════════
//  ESCENA 3 — 10s a 15s (frames 300–450): CTA + LOGO TCT
// ═══════════════════════════════════════════════════════════
const Scene3: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const logoE = spring({ frame: frame - 55, fps, config: { damping: 16, stiffness: 180 } });
  const lineScale = interpolate(frame, [18, 34], [0, 1], { extrapolateRight: 'clamp' });
  const urlOp = interpolate(frame, [38, 52], [0, 0.85], { extrapolateRight: 'clamp' });

  return (
    <AbsoluteFill>
      {/* Flash de entrada */}
      <div style={{
        position: 'absolute', inset: 0, backgroundColor: C.neon,
        opacity: interpolate(frame, [0, 10], [0.35, 0], { extrapolateRight: 'clamp' }),
      }} />

      <AbsoluteFill style={{ justifyContent: 'center', alignItems: 'flex-start', padding: '0 80px', paddingTop: 280 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <BW text="¿Quieres" sf={0} fs={128} />
          <BW text="saber" sf={0} fs={128} outline color={C.neon} d={4} />
          <BW text="cómo?" sf={0} fs={128} d={8} />

          {/* Línea divisora animada */}
          <div style={{
            height: 4, backgroundColor: C.neon, marginTop: 28, marginBottom: 28,
            transformOrigin: 'left', transform: `scaleX(${lineScale})`,
            boxShadow: `0 0 24px ${C.neon}`,
          }} />

          <BW text="Contáctame." sf={28} fs={100} color={C.neon} />

          {/* URL */}
          <div style={{
            fontFamily: '"JetBrains Mono", monospace', fontSize: 24, color: C.white,
            letterSpacing: '0.28em', textTransform: 'uppercase', opacity: urlOp, marginTop: 18,
          }}>
            dreamcrafters.lat
          </div>

          {/* Logo TCT */}
          <div style={{
            marginTop: 55, display: 'flex', alignItems: 'center', gap: 20,
            transform: `scale(${interpolate(logoE, [0, 1], [0, 1])})`,
            transformOrigin: 'left center',
            opacity: interpolate(logoE, [0, 0.5], [0, 1], { extrapolateRight: 'clamp' }),
          }}>
            <div style={{ width: 72, height: 72, filter: 'invert(1) sepia(1) saturate(12) hue-rotate(30deg) brightness(1.3)' }}>
              <Img src={staticFile('tct_icon.svg')} style={{ width: '100%', height: '100%' }} />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <span style={{
                fontFamily: '"Inter", sans-serif', fontWeight: 900, fontSize: 26,
                color: C.white, letterSpacing: '-0.02em', textTransform: 'uppercase',
              }}>Talento con Tarifa</span>
              <span style={{
                fontFamily: '"JetBrains Mono", monospace', fontSize: 13, color: C.neon,
                letterSpacing: '0.3em', textTransform: 'uppercase', opacity: 0.8,
              }}>dreamcrafters.lat</span>
            </div>
          </div>
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

// ═══════════════════════════════════════════════════════════
//  MAIN — 15s = 450 frames @ 30fps
// ═══════════════════════════════════════════════════════════
export const DreamcraftersAI15: React.FC = () => {
  const frame = useCurrentFrame();

  // Fade general de volumen en últimos 1.5s
  const volFade = interpolate(frame, [405, 450], [1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });

  return (
    <AbsoluteFill style={{ backgroundColor: C.black, overflow: 'hidden' }}>
      {/* ── AUDIO ── */}
      <Audio src={staticFile('dc15s_voice.mp3')} volume={volFade} />
      <Audio
        src={staticFile('industrial_rave.mp3')}
        volume={interpolate(frame, [0, 25, 405, 450], [0, 0.2, 0.2, 0], {
          extrapolateLeft: 'clamp', extrapolateRight: 'clamp',
        })}
      />

      {/* ── CAPAS BASE ── */}
      <Background />
      <Particles />
      <Glitch />

      {/* ── TICKERS ── */}
      <Sequence from={8}>
        <Marquee y={78} text="DREAMCRAFTERS · IA · AUTOMATIZACIÓN · CONTENIDO" />
      </Sequence>
      <Sequence from={15}>
        <Marquee y={1840} text="HECHO CON INTELIGENCIA ARTIFICIAL · CONTÁCTAME" reverse />
      </Sequence>

      {/* ── HUD ── */}
      <HUD />

      {/* ── ESCENAS ── */}
      <Sequence from={0} durationInFrames={150}>
        <Scene1 />
      </Sequence>

      <Sequence from={150} durationInFrames={150}>
        <Scene2 />
      </Sequence>

      <Sequence from={300} durationInFrames={150}>
        <Scene3 />
      </Sequence>

      {/* Timecode dev */}
      <div style={{
        position: 'absolute', top: 138, right: 78,
        fontFamily: '"JetBrains Mono", monospace', fontSize: 15,
        color: C.neon, opacity: 0.45, letterSpacing: '0.2em',
      }}>
        {String(Math.floor(frame / 30)).padStart(2, '0')}:{String(frame % 30).padStart(2, '0')}
      </div>
    </AbsoluteFill>
  );
};
