import {
  AbsoluteFill,
  Audio,
  Img,
  Sequence,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
  spring,
  interpolate,
  random,
} from 'remotion';
import React from 'react';

// ============================================================
//  ADN VISUAL: TALENTO CON TARIFA → NEO-BRUTALIST DISRUPTIVO
//  #C0FF00 Neon Green | #0A0A0A Brutal Black | #F0F0F0 Gallery White
//  Tipografía: Inter Black + JetBrains Mono
// ============================================================

const loadFonts = () => {
  if (typeof window !== 'undefined') {
    const link = document.createElement('link');
    link.href =
      'https://fonts.googleapis.com/css2?family=Inter:wght@400;700;900&family=JetBrains+Mono:wght@400;700&display=swap';
    link.rel = 'stylesheet';
    document.head.appendChild(link);
  }
};
loadFonts();

const C = {
  black: '#0A0A0A',
  white: '#F0F0F0',
  neon: '#C0FF00',
  neonDim: '#8AB800',
  red: '#FF2D55',
};

// ============================================================
//  BACKGROUND: SCANLINES + DIAGONAL GRID
// ============================================================
const BrutalBackground: React.FC = () => {
  const frame = useCurrentFrame();

  return (
    <AbsoluteFill style={{ backgroundColor: C.black, overflow: 'hidden' }}>
      {/* Diagonal grid lines */}
      <svg
        width="1080"
        height="1920"
        style={{ position: 'absolute', top: 0, left: 0, opacity: 0.07 }}
      >
        {Array.from({ length: 40 }).map((_, i) => (
          <line
            key={`d-${i}`}
            x1={i * 60 - 400}
            y1={0}
            x2={i * 60 + 400}
            y2={1920}
            stroke={C.neon}
            strokeWidth="1"
          />
        ))}
        {/* Horizontal scanlines */}
        {Array.from({ length: 96 }).map((_, i) => (
          <line
            key={`h-${i}`}
            x1={0}
            y1={i * 20}
            x2={1080}
            y2={i * 20}
            stroke={C.white}
            strokeWidth="0.5"
          />
        ))}
      </svg>

      {/* Neon corner brackets — top left */}
      <svg
        width="180"
        height="180"
        style={{ position: 'absolute', top: 60, left: 60 }}
      >
        <polyline
          points="0,80 0,0 80,0"
          fill="none"
          stroke={C.neon}
          strokeWidth="4"
        />
      </svg>
      {/* bottom right */}
      <svg
        width="180"
        height="180"
        style={{ position: 'absolute', bottom: 60, right: 60 }}
      >
        <polyline
          points="180,100 180,180 100,180"
          fill="none"
          stroke={C.neon}
          strokeWidth="4"
        />
      </svg>

      {/* Neon horizontal rule animated pulse */}
      <div
        style={{
          position: 'absolute',
          top: '50%',
          left: 0,
          right: 0,
          height: '2px',
          background: `linear-gradient(90deg, transparent, ${C.neon}, transparent)`,
          opacity: 0.12,
        }}
      />
    </AbsoluteFill>
  );
};

// ============================================================
//  GLITCH NOISE OVERLAY
// ============================================================
const GlitchNoise: React.FC = () => {
  const frame = useCurrentFrame();
  const isGlitch = frame % 7 === 0 || frame % 13 === 0;

  if (!isGlitch) return null;

  return (
    <AbsoluteFill style={{ pointerEvents: 'none', zIndex: 99, mixBlendMode: 'screen' }}>
      {[0, 1, 2].map((i) => {
        const y = random(`gy-${frame}-${i}`) * 1920;
        const h = 4 + random(`gh-${frame}-${i}`) * 20;
        const x = (random(`gx-${frame}-${i}`) - 0.5) * 30;
        return (
          <div
            key={i}
            style={{
              position: 'absolute',
              top: y,
              left: 0,
              right: 0,
              height: h,
              backgroundColor: C.neon,
              opacity: 0.06,
              transform: `translateX(${x}px)`,
            }}
          />
        );
      })}
    </AbsoluteFill>
  );
};

// ============================================================
//  PARTICLE STREAM (left side, rising dots)
// ============================================================
const ParticleStream: React.FC = () => {
  const frame = useCurrentFrame();
  return (
    <AbsoluteFill style={{ pointerEvents: 'none' }}>
      {Array.from({ length: 25 }).map((_, i) => {
        const x = 40 + random(`px-${i}`) * 1000;
        const startY = 1920 + random(`psy-${i}`) * 800;
        const speed = 1.5 + random(`psp-${i}`) * 3.5;
        const size = 2 + random(`psz-${i}`) * 4;
        const currentY = startY - frame * speed;
        const opacity = interpolate(currentY, [200, 900], [0, 0.7], {
          extrapolateLeft: 'clamp',
          extrapolateRight: 'clamp',
        });
        const isNeon = random(`pc-${i}`) > 0.6;

        return (
          <div
            key={i}
            style={{
              position: 'absolute',
              left: x,
              top: currentY,
              width: size,
              height: size,
              borderRadius: '50%',
              backgroundColor: isNeon ? C.neon : C.white,
              opacity,
              boxShadow: isNeon ? `0 0 8px ${C.neon}` : 'none',
            }}
          />
        );
      })}
    </AbsoluteFill>
  );
};

// ============================================================
//  MARQUEE TICKER (top + bottom)
// ============================================================
const MarqueeTicker: React.FC<{ y: number; text: string; speed?: number; reverse?: boolean }> = ({
  y,
  text,
  speed = 3,
  reverse = false,
}) => {
  const frame = useCurrentFrame();
  const fullText = `${text} ■ ${text} ■ ${text} ■ ${text} ■ `;
  const offset = (frame * speed) % 700;
  const tx = reverse ? offset : -offset;

  return (
    <div
      style={{
        position: 'absolute',
        top: y,
        left: 0,
        right: 0,
        height: 48,
        overflow: 'hidden',
        borderTop: `1px solid ${C.neon}30`,
        borderBottom: `1px solid ${C.neon}30`,
        backgroundColor: `${C.black}CC`,
        display: 'flex',
        alignItems: 'center',
      }}
    >
      <div
        style={{
          transform: `translateX(${tx}px)`,
          whiteSpace: 'nowrap',
          fontFamily: '"JetBrains Mono", monospace',
          fontSize: 18,
          fontWeight: 700,
          letterSpacing: '0.3em',
          color: C.neon,
          textTransform: 'uppercase',
          opacity: 0.8,
        }}
      >
        {fullText.repeat(6)}
      </div>
    </div>
  );
};

// ============================================================
//  STAT COUNTER (bottom HUD)
// ============================================================
const BottomHUD: React.FC = () => {
  const frame = useCurrentFrame();
  const pulse = Math.sin(frame / 8) * 0.5 + 0.5;

  return (
    <div
      style={{
        position: 'absolute',
        bottom: 160,
        left: 80,
        right: 80,
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'flex-end',
        zIndex: 5,
      }}
    >
      {/* Oscilloscope bars */}
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6 }}>
        {Array.from({ length: 12 }).map((_, i) => {
          const h = interpolate(Math.sin(frame / 8 + i * 0.7), [-1, 1], [8, 60]);
          return (
            <div
              key={i}
              style={{
                width: 8,
                height: h,
                backgroundColor: i % 3 === 0 ? C.neon : C.white,
                opacity: i % 3 === 0 ? 1 : 0.25,
                borderRadius: '2px 2px 0 0',
                boxShadow: i % 3 === 0 ? `0 0 10px ${C.neon}` : 'none',
              }}
            />
          );
        })}
      </div>

      {/* Live indicator */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          fontFamily: '"JetBrains Mono", monospace',
          fontSize: 16,
          color: C.white,
          letterSpacing: '0.3em',
          textTransform: 'uppercase',
          opacity: 0.7,
        }}
      >
        <div
          style={{
            width: 10,
            height: 10,
            borderRadius: '50%',
            backgroundColor: C.neon,
            opacity: pulse,
            boxShadow: `0 0 12px ${C.neon}`,
          }}
        />
        DREAMCRAFTERS.LAT
      </div>
    </div>
  );
};

// ============================================================
//  HEADING: BIG BOLD NEO-BRUTAL TEXT BLOCK
// ============================================================
const BigWord: React.FC<{
  text: string;
  startFrame: number;
  fontSize?: number;
  outline?: boolean;
  color?: string;
  delay?: number;
}> = ({ text, startFrame, fontSize = 140, outline = false, color, delay = 0 }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const pop = spring({
    frame: frame - startFrame - delay,
    fps,
    config: { damping: 12, mass: 0.5, stiffness: 200 },
  });

  const ty = interpolate(pop, [0, 1], [60, 0]);
  const opacity = interpolate(pop, [0, 0.3], [0, 1], { extrapolateRight: 'clamp' });
  const scale = interpolate(pop, [0, 1], [0.8, 1]);

  const textColor = outline ? 'transparent' : (color ?? C.white);
  const stroke = outline ? `2px ${color ?? C.neon}` : 'none';

  return (
    <div
      style={{
        fontFamily: '"Inter", sans-serif',
        fontWeight: 900,
        fontSize,
        lineHeight: 0.9,
        color: textColor,
        WebkitTextStroke: stroke,
        textTransform: 'uppercase',
        letterSpacing: '-0.04em',
        transform: `translateY(${ty}px) scale(${scale})`,
        opacity,
        display: 'inline-block',
        willChange: 'transform',
      }}
    >
      {text}
    </div>
  );
};

// ============================================================
//  SCENE: INTRO — CODE LABEL + "ESTE VIDEO"
// ============================================================
const SceneIntro: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const labelOp = spring({ frame: frame - 5, fps, config: { damping: 18 } });

  return (
    <AbsoluteFill
      style={{
        justifyContent: 'center',
        alignItems: 'flex-start',
        padding: '0 80px',
        paddingTop: 520,
      }}
    >
      {/* Code label */}
      <div
        style={{
          fontFamily: '"JetBrains Mono", monospace',
          fontSize: 20,
          color: C.neon,
          letterSpacing: '0.4em',
          textTransform: 'uppercase',
          marginBottom: 30,
          opacity: labelOp,
        }}
      >
        // AI_POWERED_CONTENT_V1.0
      </div>

      {/* Main big title */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
        <BigWord text="Este" startFrame={0} fontSize={160} />
        <BigWord text="video" startFrame={0} fontSize={160} outline color={C.neon} delay={4} />
        <BigWord text="que ves..." startFrame={0} fontSize={100} color={C.white} delay={8} />
      </div>
    </AbsoluteFill>
  );
};

// ============================================================
//  SCENE: "HECHO CON IA"
// ============================================================
const SceneIA: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // Neon slash accent
  const slashScale = spring({ frame: frame - 5, fps, config: { damping: 10, stiffness: 300 } });

  return (
    <AbsoluteFill
      style={{
        justifyContent: 'center',
        alignItems: 'flex-start',
        padding: '0 80px',
        paddingTop: 480,
      }}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <BigWord text="hecho" startFrame={0} fontSize={150} />
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 16 }}>
          <BigWord text="con" startFrame={0} fontSize={110} delay={4} />
          {/* Big IA neon block */}
          <div
            style={{
              backgroundColor: C.neon,
              padding: '0 24px',
              transform: `scaleX(${slashScale})`,
              transformOrigin: 'left',
            }}
          >
            <BigWord text="IA" startFrame={5} fontSize={150} color={C.black} />
          </div>
        </div>
        <BigWord text="completa-" startFrame={0} fontSize={110} outline color={C.white} delay={10} />
        <BigWord text="mente." startFrame={0} fontSize={110} outline color={C.neon} delay={16} />
      </div>
    </AbsoluteFill>
  );
};

// ============================================================
//  SCENE: AUTOMATIZACIÓN = PLUS
// ============================================================
const ScenePlus: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // Brain mascot float animation
  const brainEntry = spring({ frame: frame - 10, fps, config: { damping: 14, mass: 1.2 } });
  const brainY = interpolate(brainEntry, [0, 1], [300, 0]);
  const brainFloat = Math.sin(frame / 18) * 12;
  const brainRotate = Math.sin(frame / 30) * 4;
  const brainScale = interpolate(brainEntry, [0, 1], [0.6, 1]);

  return (
    <AbsoluteFill
      style={{
        justifyContent: 'center',
        alignItems: 'flex-start',
        padding: '0 80px',
        paddingTop: 300,
      }}
    >
      {/* CEREBRO MASCOT — top right floating */}
      <div
        style={{
          position: 'absolute',
          right: -40,
          top: 80,
          width: 520,
          transform: `translateY(${brainY + brainFloat}px) rotate(${brainRotate}deg) scale(${brainScale})`,
          opacity: interpolate(brainEntry, [0, 0.4], [0, 1], { extrapolateRight: 'clamp' }),
          filter: `drop-shadow(0 0 40px ${C.neon}55)`,
          zIndex: 3,
        }}
      >
        <Img
          src={staticFile('cerebro.webp')}
          style={{ width: '100%', height: 'auto' }}
        />
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, position: 'relative', zIndex: 4 }}>
        <BigWord text="La auto-" startFrame={0} fontSize={130} />
        <BigWord text="matización" startFrame={0} fontSize={100} outline color={C.neon} delay={6} />
        <BigWord text="= el gran" startFrame={0} fontSize={110} delay={12} />
        <div style={{ display: 'flex', alignItems: 'center', gap: 20, marginTop: 8 }}>
          <BigWord text="PLUS" startFrame={0} fontSize={170} color={C.neon} delay={18} />
          <div
            style={{
              width: 8, height: 8, borderRadius: '50%',
              backgroundColor: C.neon,
              boxShadow: `0 0 20px ${C.neon}`,
              opacity: Math.sin(frame / 5) > 0 ? 1 : 0.3,
              marginBottom: 20,
            }}
          />
        </div>
        <BigWord text="para tu negocio." startFrame={0} fontSize={75} delay={24} />
      </div>
    </AbsoluteFill>
  );
};

// ============================================================
//  SCENE: CTA — "¿QUIERES SABER CÓMO?" + CONTACT
// ============================================================
const SceneCTA: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // TCT Logo animation
  const logoEntry = spring({ frame: frame - 50, fps, config: { damping: 16, stiffness: 180 } });
  const logoScale = interpolate(logoEntry, [0, 1], [0, 1]);
  const logoOp = interpolate(logoEntry, [0, 0.5], [0, 1], { extrapolateRight: 'clamp' });

  return (
    <AbsoluteFill>
      {/* Neon flash on enter */}
      <div
        style={{
          position: 'absolute', inset: 0,
          backgroundColor: C.neon,
          opacity: interpolate(frame, [0, 8], [0.3, 0], { extrapolateRight: 'clamp' }),
        }}
      />

      <AbsoluteFill
        style={{
          justifyContent: 'center',
          alignItems: 'flex-start',
          padding: '0 80px',
          paddingTop: 300,
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <BigWord text="¿Quieres" startFrame={0} fontSize={130} />
          <BigWord text="saber" startFrame={0} fontSize={130} outline color={C.neon} delay={4} />
          <BigWord text="cómo?" startFrame={0} fontSize={130} delay={8} />

          {/* Divider line */}
          <div
            style={{
              height: 3, backgroundColor: C.neon,
              marginTop: 30, marginBottom: 30,
              transformOrigin: 'left',
              transform: `scaleX(${interpolate(frame, [20, 35], [0, 1], { extrapolateRight: 'clamp' })})`,
              boxShadow: `0 0 20px ${C.neon}`,
            }}
          />

          <BigWord text="Contáctame." startFrame={30} fontSize={105} color={C.neon} />

          {/* URL label */}
          <div
            style={{
              fontFamily: '"JetBrains Mono", monospace',
              fontSize: 26, color: C.white,
              letterSpacing: '0.25em', textTransform: 'uppercase',
              opacity: interpolate(frame, [40, 55], [0, 0.8], { extrapolateRight: 'clamp' }),
              marginTop: 20,
            }}
          >
            dreamcrafters.lat
          </div>

          {/* TCT LOGO — appears at bottom after CTA */}
          <div
            style={{
              marginTop: 60,
              display: 'flex',
              alignItems: 'center',
              gap: 20,
              transform: `scale(${logoScale})`,
              transformOrigin: 'left center',
              opacity: logoOp,
            }}
          >
            {/* SVG Icon — neon tinted */}
            <div
              style={{
                width: 80, height: 80,
                filter: `invert(1) sepia(1) saturate(10) hue-rotate(30deg) brightness(1.2)`,
              }}
            >
              <Img src={staticFile('tct_icon.svg')} style={{ width: '100%', height: '100%' }} />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <span
                style={{
                  fontFamily: '"Inter", sans-serif',
                  fontWeight: 900, fontSize: 28,
                  color: C.white, letterSpacing: '-0.02em',
                  textTransform: 'uppercase',
                }}
              >
                Talento con Tarifa
              </span>
              <span
                style={{
                  fontFamily: '"JetBrains Mono", monospace',
                  fontSize: 14, color: C.neon,
                  letterSpacing: '0.3em', textTransform: 'uppercase',
                  opacity: 0.8,
                }}
              >
                dreamcrafters.lat
              </span>
            </div>
          </div>
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

// ============================================================
//  MAIN COMPOSITION — 30 SEGUNDOS @ 30FPS = 900 frames
// ============================================================
export const DreamcraftersAI: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // Overall volume fade out in last 1s
  const volume = interpolate(frame, [870, 900], [1, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  return (
    <AbsoluteFill style={{ backgroundColor: C.black, overflow: 'hidden' }}>
      {/* VOZ PRINCIPAL */}
      <Audio src={staticFile('dreamcrafters_ai_voice.mp3')} volume={volume} />

      {/* MÚSICA DE FONDO — volumen bajo para no tapar la voz */}
      <Audio
        src={staticFile('music.mp3')}
        volume={interpolate(frame, [0, 30, 870, 900], [0, 0.18, 0.18, 0], {
          extrapolateLeft: 'clamp',
          extrapolateRight: 'clamp',
        })}
        startFrom={0}
      />

      {/* PERSISTENT LAYERS */}
      <BrutalBackground />
      <ParticleStream />
      <GlitchNoise />

      {/* TOP TICKER: visible from frame 10 to end */}
      <Sequence from={10}>
        <MarqueeTicker y={80} text="DREAMCRAFTERS · IA · AUTOMATIZACIÓN · CONTENIDO" speed={2.5} />
      </Sequence>

      {/* BOTTOM TICKER: reverse direction */}
      <Sequence from={20}>
        <MarqueeTicker
          y={1840}
          text="HECHO CON INTELIGENCIA ARTIFICIAL · CONTACTA HOY"
          speed={2}
          reverse
        />
      </Sequence>

      {/* BOTTOM HUD always on */}
      <BottomHUD />

      {/* ──────────────────────────────────────────
          SCENE 1: 0s – 7s (frames 0–210)
          "Este video que ves..."
      ────────────────────────────────────────── */}
      <Sequence from={0} durationInFrames={210}>
        <SceneIntro />
      </Sequence>

      {/* ──────────────────────────────────────────
          SCENE 2: 7s – 14s (frames 210–420)
          "...hecho con IA completamente."
      ────────────────────────────────────────── */}
      <Sequence from={210} durationInFrames={210}>
        <SceneIA />
      </Sequence>

      {/* ──────────────────────────────────────────
          SCENE 3: 14s – 22s (frames 420–660)
          "La automatización = el gran PLUS para tu negocio."
      ────────────────────────────────────────── */}
      <Sequence from={420} durationInFrames={240}>
        <ScenePlus />
      </Sequence>

      {/* ──────────────────────────────────────────
          SCENE 4: 22s – 30s (frames 660–900)
          CTA: "¿Quieres saber cómo? Contáctame."
      ────────────────────────────────────────── */}
      <Sequence from={660} durationInFrames={240}>
        <SceneCTA />
      </Sequence>

      {/* FRAME COUNTER (dev helper) */}
      <div
        style={{
          position: 'absolute',
          top: 140,
          right: 80,
          fontFamily: '"JetBrains Mono", monospace',
          fontSize: 16,
          color: C.neon,
          opacity: 0.5,
          letterSpacing: '0.2em',
        }}
      >
        {String(Math.floor(frame / 30)).padStart(2, '0')}:{String(frame % 30).padStart(2, '0')}
      </div>
    </AbsoluteFill>
  );
};
