import React from 'react';
import {
  AbsoluteFill,
  Audio,
  interpolate,
  Sequence,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
  spring,
  Img,
} from 'remotion';
import { Lottie } from '@remotion/lottie';
import starLottie from '../public/lottie/star.json';
import ellipseLottie from '../public/lottie/ellipse.json';
import newsData from './news_data.json';

const TC = newsData.theme_color;
// @ts-ignore
const LAYOUT = newsData.layout_type || 'neo_brutalist';

// ═══════════════════════════════════════════════════════
// EFECTOS GLOBALES
// ═══════════════════════════════════════════════════════

/** Scanlines estilo CRT broadcast (solo en neo_brutalist) */
const Scanlines: React.FC = () => {
  if (LAYOUT !== 'neo_brutalist') return null;
  return (
    <div style={{
      position: 'absolute', inset: 0, zIndex: 50, pointerEvents: 'none',
      background: 'repeating-linear-gradient(0deg, transparent, transparent 3px, rgba(0,0,0,0.13) 3px, rgba(0,0,0,0.13) 4px)',
    }} />
  );
};

/** Transición / Corte entre escenas */
const GlitchCut: React.FC = () => {
  const frame = useCurrentFrame();
  if (frame > 10) return null;

  const opacity = interpolate(frame, [0, 10], [1, 0], { extrapolateRight: 'clamp' });

  if (LAYOUT === 'neo_brutalist') {
    const shift = interpolate(frame, [0, 5, 10], [20, 0, 8]);
    return (
      <>
        {/* Canal R corrido a la derecha */}
        <div style={{
          position: 'absolute', inset: 0, zIndex: 500, opacity: opacity * 0.6,
          backgroundColor: '#FF0000', mixBlendMode: 'screen',
          transform: `translateX(${shift}px)`,
        }} />
        {/* Canal B corrido a la izquierda */}
        <div style={{
          position: 'absolute', inset: 0, zIndex: 500, opacity: opacity * 0.6,
          backgroundColor: '#0000FF', mixBlendMode: 'screen',
          transform: `translateX(${-shift}px)`,
        }} />
        {/* Ruido horizontal */}
        <div style={{
          position: 'absolute', zIndex: 501,
          top: `${(frame * 137) % 80}%`,
          left: 0, right: 0, height: '3%',
          backgroundColor: TC, opacity: opacity * 0.8,
          mixBlendMode: 'overlay',
        }} />
      </>
    );
  } else if (LAYOUT === 'glassmorphism') {
    // Un resplandor de neón suave que se desvanece
    return (
      <div style={{
        position: 'absolute', inset: 0, zIndex: 500, opacity,
        background: `radial-gradient(circle, ${TC}90 0%, transparent 70%)`,
        pointerEvents: 'none',
      }} />
    );
  } else {
    // minimal_clean: simple fade out de una cortina negra
    return (
      <div style={{
        position: 'absolute', inset: 0, zIndex: 500, opacity,
        backgroundColor: '#000', pointerEvents: 'none',
      }} />
    );
  }
};

/** Glitch periódico de imagen (solo en neo_brutalist) */
const ImageGlitch: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const frame = useCurrentFrame();

  if (LAYOUT !== 'neo_brutalist') {
    return <div style={{ position: 'relative', width: '100%', height: '100%', overflow: 'hidden' }}>{children}</div>;
  }

  // Dispara cada 47 frames, dura 4 frames
  const cycle = frame % 47;
  const active = cycle < 4;
  const shift = active ? ((cycle * 13) % 30) - 15 : 0;
  const skew = active ? ((cycle * 7) % 6) - 3 : 0;

  return (
    <div style={{
      position: 'relative', width: '100%', height: '100%',
      transform: active ? `translateX(${shift}px) skewX(${skew}deg)` : 'none',
      overflow: 'hidden',
    }}>
      {children}
      {/* Franja horizontal de glitch sobre la imagen */}
      {active && (
        <div style={{
          position: 'absolute',
          top: `${(frame * 53) % 75}%`,
          left: 0, right: 0, height: '5%',
          backgroundColor: TC, opacity: 0.4, mixBlendMode: 'overlay',
        }} />
      )}
    </div>
  );
};

/** Texto con efecto "typing reveal" letra a letra */
const TypeReveal: React.FC<{ text: string; startFrame: number; style?: React.CSSProperties }> = ({ text, startFrame, style }) => {
  const frame = useCurrentFrame();
  const charsToShow = Math.floor(interpolate(
    frame, [startFrame, startFrame + text.length * 2],
    [0, text.length], { extrapolateRight: 'clamp', extrapolateLeft: 'clamp' }
  ));
  const cursor = Math.floor(frame / 8) % 2 === 0 && charsToShow < text.length;

  return (
    <span style={style}>
      {text.substring(0, charsToShow)}
      {cursor && <span style={{ opacity: 0.8 }}>|</span>}
    </span>
  );
};

/** Badge "EN VIVO" adaptable */
const LiveBadge: React.FC = () => {
  const frame = useCurrentFrame();
  const blink = Math.floor(frame / 15) % 2 === 0;

  if (LAYOUT === 'minimal_clean') {
    return (
      <div style={{
        position: 'absolute', top: 55, left: 55, zIndex: 200,
        display: 'flex', alignItems: 'center', gap: 10,
        backgroundColor: '#1E1E1E', padding: '10px 20px',
        borderRadius: '30px', border: '1px solid rgba(255,255,255,0.1)',
      }}>
        <div style={{
          width: 14, height: 14, borderRadius: '50%',
          backgroundColor: blink ? '#FF3366' : 'transparent',
          border: '2px solid #FF3366',
        }} />
        <span style={{ fontSize: 24, fontWeight: 700, color: '#FFF', letterSpacing: 2, fontFamily: 'sans-serif' }}>
          LIVE
        </span>
      </div>
    );
  }

  if (LAYOUT === 'glassmorphism') {
    return (
      <div style={{
        position: 'absolute', top: 55, left: 55, zIndex: 200,
        display: 'flex', alignItems: 'center', gap: 12,
        background: 'rgba(255, 255, 255, 0.08)',
        backdropFilter: 'blur(12px)',
        padding: '12px 24px',
        borderRadius: '16px',
        border: '1.5px solid rgba(255, 255, 255, 0.15)',
        boxShadow: `0 4px 20px ${TC}25`,
      }}>
        <div style={{
          width: 16, height: 16, borderRadius: '50%',
          backgroundColor: blink ? '#FF0055' : '#444',
          boxShadow: blink ? `0 0 10px #FF0055` : 'none',
        }} />
        <span style={{ fontSize: 26, fontWeight: 800, color: '#FFF', letterSpacing: 3, fontFamily: 'monospace' }}>
          EN VIVO
        </span>
      </div>
    );
  }

  // neo_brutalist default
  return (
    <div style={{
      position: 'absolute', top: 55, left: 55, zIndex: 200,
      display: 'flex', alignItems: 'center', gap: 18,
      backgroundColor: '#FF0000', padding: '14px 28px',
      border: '5px solid #000', boxShadow: '6px 6px 0 #000',
    }}>
      <div style={{
        width: 22, height: 22, borderRadius: '50%',
        backgroundColor: blink ? '#FFF' : 'transparent',
        border: '3px solid #FFF',
      }} />
      <span style={{ fontSize: 34, fontWeight: 900, color: '#FFF', letterSpacing: 6, fontFamily: 'monospace' }}>
        EN VIVO
      </span>
    </div>
  );
};

/** Watermark TCT */
const Watermark: React.FC = () => (
  <div style={{ position: 'absolute', top: 50, right: 50, zIndex: 200 }}>
    <Img src={staticFile('tct_logo.svg')} style={{ width: 100, height: 100, filter: `drop-shadow(4px 4px 0px ${TC})` }} />
  </div>
);

/** Barra de progreso adaptable */
const ProgressBar: React.FC<{ dur: number }> = ({ dur }) => {
  const frame = useCurrentFrame();
  const pct = interpolate(frame, [0, dur], [0, 100], { extrapolateRight: 'clamp' });

  if (LAYOUT === 'minimal_clean') {
    return (
      <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, zIndex: 300, height: 8, backgroundColor: '#222' }}>
        <div style={{ height: '100%', width: `${pct}%`, backgroundColor: TC, borderRadius: '0 4px 4px 0' }} />
      </div>
    );
  }

  if (LAYOUT === 'glassmorphism') {
    return (
      <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, zIndex: 300, height: 10, backgroundColor: 'rgba(255,255,255,0.05)' }}>
        <div style={{ 
          height: '100%', width: `${pct}%`, backgroundColor: TC, 
          boxShadow: `0 0 15px ${TC}`,
          transition: 'width 0.1s linear'
        }} />
      </div>
    );
  }

  return (
    <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, zIndex: 300, height: 12, backgroundColor: '#111' }}>
      <div style={{ height: '100%', width: `${pct}%`, backgroundColor: TC }} />
    </div>
  );
};

// ═══════════════════════════════════════════════════════
// ESCENA TÍTULO
// ═══════════════════════════════════════════════════════
const TitleScene: React.FC<{ text1: string; text2: string; dur: number }> = ({ text1, text2, dur }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const t1Y = spring({ fps, frame, from: 400, to: 0, config: { damping: 9, stiffness: 100 } });
  const t2Y = spring({ fps, frame: Math.max(0, frame - 10), from: -300, to: 0, config: { damping: 11 } });
  const scaleIn = spring({ fps, frame, from: 0, to: 1, config: { damping: 13 } });
  const tilt = LAYOUT === 'neo_brutalist' ? interpolate(frame, [0, dur], [-2, 2]) : 0;
  const lineW = interpolate(frame, [8, 30], [0, 100], { extrapolateRight: 'clamp' });
  const aberration = interpolate(frame, [0, 6, 12], [14, 0, 4], { extrapolateRight: 'clamp' });

  let bgStyle: React.CSSProperties = { backgroundColor: '#000' };
  if (LAYOUT === 'minimal_clean') {
    bgStyle = { backgroundColor: '#121212' };
  } else if (LAYOUT === 'glassmorphism') {
    bgStyle = { background: 'radial-gradient(circle at center, #18092a 0%, #06020c 100%)' };
  }

  return (
    <AbsoluteFill style={{ ...bgStyle, justifyContent: 'center', alignItems: 'center' }}>
      <GlitchCut />
      <Scanlines />
      <LiveBadge />
      <Watermark />
      <ProgressBar dur={dur} />

      {/* Brillo de fondo para glassmorphism */}
      {LAYOUT === 'glassmorphism' && (
        <div style={{
          position: 'absolute', width: 450, height: 450, borderRadius: '50%',
          backgroundColor: `${TC}15`, filter: 'blur(100px)', zIndex: 1,
          transform: `scale(${interpolate(frame, [0, dur], [0.8, 1.2])})`,
        }} />
      )}

      <div style={{ transform: `rotate(${tilt}deg) scale(${scaleIn})`, textAlign: 'center', zIndex: 10 }}>
        {/* Animación Lottie de estrella girando / latiendo */}
        <div style={{ width: 160, height: 160, margin: '0 auto 20px', filter: LAYOUT === 'neo_brutalist' ? 'drop-shadow(6px 6px 0px #000)' : 'none' }}>
          <Lottie animationData={starLottie} />
        </div>

        {/* --- NEO BRUTALIST --- */}
        {LAYOUT === 'neo_brutalist' && (
          <>
            <div style={{ transform: `translateY(${t1Y}px)`, position: 'relative', display: 'inline-block', marginBottom: 12 }}>
              {/* Sombra R */}
              <h1 style={{
                fontSize: 140, margin: 0, color: 'rgba(255,0,80,0.6)',
                fontFamily: 'Impact, sans-serif', textTransform: 'uppercase', lineHeight: 1,
                position: 'absolute', top: 0, left: aberration, width: '100%',
              }}>{text1}</h1>
              {/* Sombra B */}
              <h1 style={{
                fontSize: 140, margin: 0, color: 'rgba(0,200,255,0.6)',
                fontFamily: 'Impact, sans-serif', textTransform: 'uppercase', lineHeight: 1,
                position: 'absolute', top: 0, left: -aberration, width: '100%',
              }}>{text1}</h1>
              {/* Texto principal */}
              <div style={{
                backgroundColor: TC, padding: '20px 60px',
                border: '12px solid #FFF', boxShadow: '18px 18px 0 #FFF',
                position: 'relative',
              }}>
                <h1 style={{
                  fontSize: 140, margin: 0, color: '#000',
                  fontFamily: 'Impact, sans-serif', textTransform: 'uppercase', lineHeight: 1,
                }}>{text1}</h1>
              </div>
            </div>

            {/* Líneas decorativas */}
            <div style={{ display: 'flex', justifyContent: 'center', gap: 14, margin: '14px 0' }}>
              {[0.4, 0.7, 0.5, 0.8, 0.3].map((w, n) => (
                <div key={n} style={{
                  height: 8, width: `${lineW * w * 1.2}px`,
                  backgroundColor: n % 2 === 0 ? '#FFF' : TC,
                  border: '2px solid #000',
                  transform: n % 2 === 0 ? 'skewX(-8deg)' : 'skewX(8deg)',
                }} />
              ))}
            </div>

            {/* Subtítulo */}
            <div style={{
              transform: `translateY(${t2Y}px)`,
              backgroundColor: '#FFF', padding: '14px 50px',
              border: '10px solid #000', boxShadow: `-16px 16px 0 ${TC}`,
              display: 'inline-block',
            }}>
              <h2 style={{
                fontSize: 88, margin: 0, color: '#000',
                fontFamily: 'Impact, sans-serif', textTransform: 'uppercase',
              }}>{text2}</h2>
            </div>
          </>
        )}

        {/* --- MINIMAL CLEAN --- */}
        {LAYOUT === 'minimal_clean' && (
          <div style={{ padding: '0 40px', textAlign: 'left', borderLeft: `12px solid ${TC}`, display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ transform: `translateY(${t1Y}px)` }}>
              <h1 style={{
                fontSize: 110, margin: 0, color: '#FFF',
                fontFamily: 'system-ui, -apple-system, sans-serif', fontWeight: 900,
                textTransform: 'uppercase', lineHeight: 1.05,
              }}>{text1}</h1>
            </div>
            <div style={{ height: 4, width: `${lineW}%`, backgroundColor: 'rgba(255,255,255,0.2)', margin: '10px 0' }} />
            <div style={{ transform: `translateY(${t2Y}px)` }}>
              <h2 style={{
                fontSize: 70, margin: 0, color: TC,
                fontFamily: 'system-ui, -apple-system, sans-serif', fontWeight: 700,
                textTransform: 'uppercase', lineHeight: 1.1,
              }}>{text2}</h2>
            </div>
          </div>
        )}

        {/* --- GLASSMORPHISM --- */}
        {LAYOUT === 'glassmorphism' && (
          <div style={{
            background: 'rgba(255, 255, 255, 0.05)',
            backdropFilter: 'blur(20px)',
            border: '1px solid rgba(255, 255, 255, 0.12)',
            boxShadow: '0 12px 40px rgba(0, 0, 0, 0.4)',
            padding: '50px 60px',
            borderRadius: '30px',
            display: 'flex',
            flexDirection: 'column',
            gap: 20,
            maxWidth: 900,
          }}>
            <div style={{ transform: `translateY(${t1Y}px)` }}>
              <h1 style={{
                fontSize: 115, margin: 0, color: '#FFF',
                fontFamily: 'system-ui, -apple-system, sans-serif', fontWeight: 900,
                textTransform: 'uppercase', lineHeight: 1,
                textShadow: `0 0 20px ${TC}90`,
              }}>{text1}</h1>
            </div>
            <div style={{ display: 'flex', justifyContent: 'center' }}>
              <div style={{ height: 3, width: `${lineW * 0.7}%`, background: `linear-gradient(90deg, transparent, ${TC}, transparent)` }} />
            </div>
            <div style={{ transform: `translateY(${t2Y}px)` }}>
              <h2 style={{
                fontSize: 75, margin: 0, color: '#FFF',
                fontFamily: 'system-ui, -apple-system, sans-serif', fontWeight: 500,
                textTransform: 'uppercase', letterSpacing: 4,
              }}>{text2}</h2>
            </div>
          </div>
        )}

      </div>
    </AbsoluteFill>
  );
};

// ═══════════════════════════════════════════════════════
// ESCENA IMAGEN + KEY POINTS
// ═══════════════════════════════════════════════════════
const ImageTextScene: React.FC<{ text: string; imageFile: string; keyPoints: string[]; dur: number }> = ({ text, imageFile, keyPoints, dur }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const kenBurns = interpolate(frame, [0, dur], [1.0, 1.18], { extrapolateRight: 'clamp' });
  const panelY = spring({ fps, frame, from: 900, to: 0, config: { damping: 15 } });
  const lineW = interpolate(frame, [5, 25], [0, 100], { extrapolateRight: 'clamp' });

  // Aparecen de manera escalonada en el primer 65% de la escena
  const pointInterval = Math.floor(dur * 0.22);
  const points = (keyPoints || []).slice(0, 3);

  let panelStyle: React.CSSProperties = {
    position: 'absolute', bottom: 0, left: 0, right: 0, height: '30%',
    backgroundColor: '#000', borderTop: `12px solid ${TC}`,
    padding: '22px 50px',
    display: 'flex', flexDirection: 'column', justifyContent: 'center',
  };

  if (LAYOUT === 'minimal_clean') {
    panelStyle = {
      position: 'absolute', bottom: '30px', left: '30px', right: '30px', height: '24%',
      backgroundColor: '#1E1E1E', borderRadius: '20px',
      borderLeft: `10px solid ${TC}`,
      padding: '25px 40px',
      display: 'flex', flexDirection: 'column', justifyContent: 'center',
      boxShadow: '0 8px 30px rgba(0,0,0,0.5)',
    };
  } else if (LAYOUT === 'glassmorphism') {
    panelStyle = {
      position: 'absolute', bottom: '30px', left: '30px', right: '30px', height: '24%',
      background: 'rgba(255, 255, 255, 0.05)',
      backdropFilter: 'blur(20px)',
      border: '1.5px solid rgba(255, 255, 255, 0.12)',
      borderRadius: '24px',
      padding: '25px 40px',
      display: 'flex', flexDirection: 'column', justifyContent: 'center',
      boxShadow: '0 10px 40px rgba(0,0,0,0.6)',
    };
  }

  return (
    <AbsoluteFill style={{ backgroundColor: LAYOUT === 'neo_brutalist' ? '#000' : '#121212' }}>
      <GlitchCut />

      {/* Imagen principal */}
      <div style={{
        position: 'absolute', top: 0, left: 0, right: 0,
        height: LAYOUT === 'neo_brutalist' ? '72%' : '76%',
        overflow: 'hidden',
      }}>
        <ImageGlitch>
          <Img
            src={staticFile(imageFile)}
            style={{ width: '100%', height: '100%', objectFit: 'cover', transform: `scale(${kenBurns})` }}
          />
        </ImageGlitch>
      </div>

      {/* Degradado para disolver la imagen con el fondo */}
      <div style={{
        position: 'absolute',
        top: LAYOUT === 'neo_brutalist' ? '58%' : '50%',
        left: 0, right: 0,
        height: '26%',
        background: `linear-gradient(transparent, ${LAYOUT === 'minimal_clean' ? '#121212' : '#000'})`,
      }} />

      {/* Resplandor neón decorativo para glassmorphism */}
      {LAYOUT === 'glassmorphism' && (
        <div style={{
          position: 'absolute', width: 350, height: 350, borderRadius: '50%',
          backgroundColor: `${TC}20`, filter: 'blur(80px)',
          bottom: '15%', right: '10%', zIndex: 1
        }} />
      )}

      {/* KEY POINTS SECUENCIALES */}
      {points.map((point, idx) => {
        const startAt = 6 + idx * pointInterval;
        const exitAt = startAt + pointInterval - 4;

        const entryY = spring({ fps, frame: Math.max(0, frame - startAt), from: 120, to: 0, config: { damping: 12 } });
        const exitY = frame > exitAt ? interpolate(frame, [exitAt, exitAt + 8], [0, -140], { extrapolateRight: 'clamp' }) : 0;
        const opacity = frame < startAt ? 0 : frame > exitAt + 6 ? 0 : 1;

        const isRight = idx % 2 === 1;
        const badgeNum = idx + 1;

        if (LAYOUT === 'neo_brutalist') {
          return (
            <div
              key={idx}
              style={{
                position: 'absolute',
                top: `${14 + idx * 16}%`,
                left: isRight ? 'auto' : '40px',
                right: isRight ? '40px' : 'auto',
                zIndex: 100 + idx,
                opacity,
                transform: `translateY(${entryY + exitY}px)`,
                maxWidth: '580px',
              }}
            >
              <div style={{ display: 'inline-flex', alignItems: 'center', filter: 'drop-shadow(6px 6px 0px rgba(0,0,0,0.9))' }}>
                <div style={{
                  position: 'relative', width: 72, height: 72, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                  backgroundColor: '#000', border: '5px solid #000',
                }}>
                  <div style={{ position: 'absolute', inset: 0, zIndex: 0 }}>
                    <Lottie animationData={ellipseLottie} />
                  </div>
                  <span style={{ position: 'relative', zIndex: 1, fontSize: 32, fontWeight: 900, color: '#FFF', fontFamily: 'Impact, sans-serif' }}>
                    {badgeNum}
                  </span>
                </div>
                <div style={{ backgroundColor: '#000', padding: '12px 22px', border: '5px solid #000', borderLeft: 'none' }}>
                  <span style={{ fontSize: 48, color: '#FFF', fontFamily: 'Impact, sans-serif', textTransform: 'uppercase', letterSpacing: 1, lineHeight: 1 }}>
                    <TypeReveal text={point} startFrame={startAt} style={{ color: '#FFF' }} />
                  </span>
                </div>
                <div style={{ width: 12, height: 72, backgroundColor: TC, border: '5px solid #000', borderLeft: 'none', flexShrink: 0 }} />
              </div>
            </div>
          );
        }

        if (LAYOUT === 'minimal_clean') {
          return (
            <div
              key={idx}
              style={{
                position: 'absolute',
                top: `${14 + idx * 15}%`,
                left: '40px',
                zIndex: 100 + idx,
                opacity,
                transform: `translateY(${entryY + exitY}px)`,
                maxWidth: '650px',
              }}
            >
              <div style={{
                display: 'flex', alignItems: 'center', gap: 18,
                backgroundColor: '#1E1E1E', padding: '14px 28px',
                borderRadius: '16px', border: '1px solid rgba(255,255,255,0.08)',
                boxShadow: '0 4px 15px rgba(0,0,0,0.3)',
              }}>
                <div style={{
                  position: 'relative', width: 48, height: 48, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                }}>
                  <div style={{ position: 'absolute', inset: -6, zIndex: 0 }}>
                    <Lottie animationData={ellipseLottie} />
                  </div>
                  <span style={{ position: 'relative', zIndex: 1, fontSize: 24, fontWeight: 900, color: '#FFF', fontFamily: 'sans-serif' }}>
                    {badgeNum}
                  </span>
                </div>
                <span style={{ fontSize: 42, fontWeight: 700, color: '#FFF', fontFamily: 'sans-serif', textTransform: 'uppercase' }}>
                  <TypeReveal text={point} startFrame={startAt} style={{ color: '#FFF' }} />
                </span>
              </div>
            </div>
          );
        }

        // glassmorphism
        return (
          <div
            key={idx}
            style={{
              position: 'absolute',
              top: `${14 + idx * 15}%`,
              left: isRight ? 'auto' : '50px',
              right: isRight ? '50px' : 'auto',
              zIndex: 100 + idx,
              opacity,
              transform: `translateY(${entryY + exitY}px)`,
              maxWidth: '620px',
            }}
          >
            <div style={{
              display: 'flex', alignItems: 'center', gap: 16,
              background: 'rgba(255, 255, 255, 0.06)',
              backdropFilter: 'blur(16px)',
              padding: '16px 28px',
              borderRadius: '20px',
              border: '1px solid rgba(255, 255, 255, 0.12)',
              boxShadow: `0 4px 25px ${TC}15`,
            }}>
              <div style={{
                position: 'relative', width: 56, height: 56, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
              }}>
                <div style={{ position: 'absolute', inset: -6, zIndex: 0 }}>
                  <Lottie animationData={starLottie} />
                </div>
                <div style={{
                  position: 'relative', zIndex: 1, background: `linear-gradient(135deg, ${TC}, #FFF)`, width: 38, height: 38, borderRadius: '12px',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  boxShadow: `0 0 10px ${TC}60`,
                }}>
                  <span style={{ fontSize: 20, fontWeight: 900, color: '#000', fontFamily: 'monospace' }}>
                    {badgeNum}
                  </span>
                </div>
              </div>
              <span style={{ fontSize: 42, fontWeight: 800, color: '#FFF', fontFamily: 'sans-serif', textTransform: 'uppercase', textShadow: '0 0 8px rgba(255,255,255,0.3)' }}>
                <TypeReveal text={point} startFrame={startAt} style={{ color: '#FFF' }} />
              </span>
            </div>
          </div>
        );
      })}

      {/* PANEL INFERIOR */}
      <div style={{
        ...panelStyle,
        transform: `translateY(${panelY}px)`,
      }}>
        {LAYOUT === 'neo_brutalist' && <div style={{ height: 6, width: `${lineW}%`, backgroundColor: TC, marginBottom: 16 }} />}
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 18 }}>
          {LAYOUT !== 'glassmorphism' && <div style={{ width: 14, flexShrink: 0, alignSelf: 'stretch', backgroundColor: TC, minHeight: 70 }} />}
          <h2 style={{
            fontSize: LAYOUT === 'neo_brutalist' ? 64 : 52, margin: 0, color: '#FFF',
            fontFamily: LAYOUT === 'neo_brutalist' ? 'Impact, sans-serif' : 'system-ui, -apple-system, sans-serif',
            fontWeight: LAYOUT === 'neo_brutalist' ? 'normal' : 800,
            textTransform: 'uppercase', lineHeight: 1.1,
            textShadow: LAYOUT === 'glassmorphism' ? `0 0 10px ${TC}60` : 'none',
          }}>
            <TypeReveal text={text} startFrame={4} style={{ color: '#FFF' }} />
          </h2>
        </div>
      </div>

      <Watermark />
      <ProgressBar dur={dur} />
      <Scanlines />
    </AbsoluteFill>
  );
};

// ═══════════════════════════════════════════════════════
// ESCENA PORCENTAJE
// ═══════════════════════════════════════════════════════
const PercentageScene: React.FC<{ number: number; text: string; dur: number }> = ({ number, text, dur }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const animatedNum = Math.floor(
    interpolate(frame, [0, 45, 60], [0, number * 1.12, number], { extrapolateRight: 'clamp', extrapolateLeft: 'clamp' })
  );
  const punch = spring({ fps, frame: Math.max(0, frame - 55), from: 0.8, to: 1, config: { damping: 5, stiffness: 500 } });
  const textY = spring({ fps, frame: Math.max(0, frame - 35), from: 100, to: 0, config: { damping: 12 } });
  const stripeOffset = frame * 2.5;

  const ab = LAYOUT === 'neo_brutalist' && frame > 56 ? interpolate(frame, [56, 62], [10, 0], { extrapolateRight: 'clamp' }) : 0;

  let bgStyle: React.CSSProperties = { backgroundColor: '#000' };
  if (LAYOUT === 'minimal_clean') {
    bgStyle = { backgroundColor: '#121212' };
  } else if (LAYOUT === 'glassmorphism') {
    bgStyle = { background: 'radial-gradient(circle at center, #1b0a2c 0%, #06020c 100%)' };
  }

  return (
    <AbsoluteFill style={{ ...bgStyle, justifyContent: 'center', alignItems: 'center', overflow: 'hidden' }}>
      <GlitchCut />

      {/* Fondo de rayas diagonales (solo en neo_brutalist) */}
      {LAYOUT === 'neo_brutalist' && (
        <div style={{
          position: 'absolute', inset: 0,
          backgroundImage: `repeating-linear-gradient(45deg, transparent, transparent 38px, ${TC}15 38px, ${TC}15 42px)`,
          backgroundPosition: `${stripeOffset}px ${stripeOffset}px`,
        }} />
      )}

      {/* Luces de ambiente (solo en glassmorphism) */}
      {LAYOUT === 'glassmorphism' && (
        <>
          <div style={{
            position: 'absolute', width: 500, height: 500, borderRadius: '50%',
            backgroundColor: `${TC}15`, filter: 'blur(100px)', top: '10%', left: '10%',
            transform: `scale(${interpolate(frame, [0, dur], [0.9, 1.2])})`,
          }} />
          <div style={{
            position: 'absolute', width: 400, height: 400, borderRadius: '50%',
            backgroundColor: 'rgba(255, 0, 255, 0.08)', filter: 'blur(90px)', bottom: '15%', right: '15%',
            transform: `scale(${interpolate(frame, [0, dur], [1.1, 0.8])})`,
          }} />
        </>
      )}

      {/* Cruces decorativas (solo en neo_brutalist) */}
      {LAYOUT === 'neo_brutalist' && (
        <>
          <div style={{ position: 'absolute', width: 6, height: '100%', backgroundColor: `${TC}25` }} />
          <div style={{ position: 'absolute', height: 6, width: '100%', backgroundColor: `${TC}25` }} />
        </>
      )}

      {/* Número y Etiqueta */}
      <div style={{ zIndex: 10, textAlign: 'center', transform: `scale(${punch})` }}>
        <div style={{ position: 'relative', display: 'inline-block' }}>
          {LAYOUT === 'neo_brutalist' ? (
            <>
              {/* R Aberration */}
              <h1 style={{
                fontSize: 380, margin: 0, lineHeight: 0.85,
                fontFamily: 'Impact, sans-serif', color: 'rgba(255,0,80,0.5)',
                position: 'absolute', top: 0, left: ab,
              }}>{animatedNum}%</h1>
              {/* B Aberration */}
              <h1 style={{
                fontSize: 380, margin: 0, lineHeight: 0.85,
                fontFamily: 'Impact, sans-serif', color: 'rgba(0,200,255,0.5)',
                position: 'absolute', top: 0, left: -ab,
              }}>{animatedNum}%</h1>
              {/* Número central */}
              <h1 style={{
                fontSize: 380, margin: 0, lineHeight: 0.85,
                fontFamily: 'Impact, sans-serif', color: TC,
                position: 'relative',
                textShadow: `10px 10px 0 rgba(255,255,255,0.15)`,
              }}>{animatedNum}%</h1>
            </>
          ) : (
            <h1 style={{
              fontSize: 340, margin: 0, lineHeight: 0.85,
              fontFamily: 'system-ui, -apple-system, sans-serif', fontWeight: 900,
              color: TC, position: 'relative',
              textShadow: LAYOUT === 'glassmorphism' ? `0 0 40px ${TC}80` : 'none',
            }}>{animatedNum}%</h1>
          )}
        </div>

        {/* ETIQUETA */}
        <div style={{ transform: `translateY(${textY}px)`, marginTop: 30 }}>
          {LAYOUT === 'neo_brutalist' && (
            <div style={{
              backgroundColor: '#FFF', padding: '14px 55px',
              border: '8px solid #000', boxShadow: `10px 10px 0 ${TC}`,
              display: 'inline-block',
            }}>
              <h2 style={{ fontSize: 58, margin: 0, color: '#000', fontFamily: 'Impact, sans-serif', textTransform: 'uppercase' }}>
                {text}
              </h2>
            </div>
          )}

          {LAYOUT === 'minimal_clean' && (
            <div style={{
              backgroundColor: '#1E1E1E', padding: '16px 45px',
              borderRadius: '16px', border: '1px solid rgba(255,255,255,0.1)',
              display: 'inline-block',
              boxShadow: '0 4px 20px rgba(0,0,0,0.3)',
            }}>
              <h2 style={{ fontSize: 44, margin: 0, color: '#FFF', fontFamily: 'sans-serif', fontWeight: 700, textTransform: 'uppercase' }}>
                {text}
              </h2>
            </div>
          )}

          {LAYOUT === 'glassmorphism' && (
            <div style={{
              background: 'rgba(255, 255, 255, 0.05)',
              backdropFilter: 'blur(16px)',
              padding: '18px 50px',
              borderRadius: '20px',
              border: '1px solid rgba(255,255,255,0.12)',
              boxShadow: `0 8px 30px rgba(0,0,0,0.4)`,
              display: 'inline-block',
            }}>
              <h2 style={{ fontSize: 46, margin: 0, color: '#FFF', fontFamily: 'sans-serif', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 2 }}>
                {text}
              </h2>
            </div>
          )}
        </div>
      </div>

      <LiveBadge />
      <Watermark />
      <ProgressBar dur={dur} />
      <Scanlines />
    </AbsoluteFill>
  );
};

// ═══════════════════════════════════════════════════════
// ESCENA CTA (CIERRE)
// ═══════════════════════════════════════════════════════
const CtaScene: React.FC<{ dur: number }> = ({ dur }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const curtainH = interpolate(frame, [0, 20], [0, 100], { extrapolateRight: 'clamp' });
  const logoScale = spring({ fps, frame: Math.max(0, frame - 16), from: 0, to: 1, config: { damping: 7, stiffness: 280 } });
  const logoRotate = spring({ fps, frame: Math.max(0, frame - 16), from: LAYOUT === 'neo_brutalist' ? -180 : 0, to: 0, config: { damping: 10 } });
  const headlineY = spring({ fps, frame: Math.max(0, frame - 28), from: 60, to: 0, config: { damping: 13 } });
  const subY = spring({ fps, frame: Math.max(0, frame - 40), from: 80, to: 0, config: { damping: 13 } });
  const urlY = spring({ fps, frame: Math.max(0, frame - 52), from: 200, to: 0, config: { damping: 12 } });
  const headlineOpacity = interpolate(frame, [28, 42], [0, 1], { extrapolateRight: 'clamp' });

  const badgePulse = interpolate(frame % 30, [0, 15, 30], [1, 0.7, 1]);

  let bgStyle: React.CSSProperties = { backgroundColor: '#000' };
  if (LAYOUT === 'minimal_clean') {
    bgStyle = { backgroundColor: '#121212' };
  } else if (LAYOUT === 'glassmorphism') {
    bgStyle = { background: 'radial-gradient(circle at center, #1b0a2c 0%, #06020c 100%)' };
  }

  return (
    <AbsoluteFill style={{ ...bgStyle, justifyContent: 'center', alignItems: 'center', overflow: 'hidden' }}>
      <GlitchCut />
      <Scanlines />

      {/* Cortina de transición para neo_brutalist y minimal_clean */}
      {LAYOUT !== 'glassmorphism' && (
        <div style={{
          position: 'absolute', top: 0, left: 0, right: 0,
          height: `${curtainH}%`, backgroundColor: TC, zIndex: 5,
        }} />
      )}

      {/* Fondo de puntos (solo en neo_brutalist) */}
      {LAYOUT === 'neo_brutalist' && (
        <div style={{
          position: 'absolute', inset: 0, zIndex: 1,
          backgroundImage: `radial-gradient(${TC}35 2px, transparent 2px)`,
          backgroundSize: '42px 42px',
        }} />
      )}

      {/* Luces neón en Cierre (solo en glassmorphism) */}
      {LAYOUT === 'glassmorphism' && (
        <>
          <div style={{
            position: 'absolute', width: 600, height: 600, borderRadius: '50%',
            backgroundColor: `${TC}10`, filter: 'blur(120px)', zIndex: 1,
            transform: `scale(${interpolate(frame, [0, dur], [0.8, 1.1])})`,
          }} />
          <div style={{
            position: 'absolute', width: 450, height: 450, borderRadius: '50%',
            backgroundColor: 'rgba(255, 0, 255, 0.06)', filter: 'blur(100px)', zIndex: 1,
            bottom: '10%', left: '10%',
          }} />
        </>
      )}

      {/* Contenedor de contenido */}
      <div style={{ zIndex: 20, textAlign: 'center', padding: '0 70px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 0 }}>

        {/* LOGO DE TCT */}
        <div style={{ transform: `scale(${logoScale}) rotate(${logoRotate}deg)`, marginBottom: 36 }}>
          {LAYOUT === 'neo_brutalist' && (
            <div style={{
              backgroundColor: TC, padding: 28,
              border: '10px solid #FFF', boxShadow: '16px 16px 0 #FFF',
              display: 'inline-block',
            }}>
              <Img src={staticFile('tct_logo.svg')} style={{ width: 160, height: 160 }} />
            </div>
          )}

          {LAYOUT === 'minimal_clean' && (
            <div style={{
              backgroundColor: '#1E1E1E', padding: 24,
              borderRadius: '24px', border: '1px solid rgba(255,255,255,0.1)',
              display: 'inline-block',
              boxShadow: '0 8px 30px rgba(0,0,0,0.5)',
            }}>
              <Img src={staticFile('tct_logo.svg')} style={{ width: 140, height: 140 }} />
            </div>
          )}

          {LAYOUT === 'glassmorphism' && (
            <div style={{
              background: 'rgba(255, 255, 255, 0.05)',
              backdropFilter: 'blur(20px)',
              border: '1.5px solid rgba(255, 255, 255, 0.15)',
              padding: 28,
              borderRadius: '32px',
              display: 'inline-block',
              boxShadow: `0 10px 40px ${TC}20`,
            }}>
              <Img src={staticFile('tct_logo.svg')} style={{ width: 140, height: 140, filter: `drop-shadow(0 0 10px ${TC}50)` }} />
            </div>
          )}
        </div>

        {/* TITULARES */}
        <div style={{ opacity: headlineOpacity, transform: `translateY(${headlineY}px)`, marginBottom: 16 }}>
          {LAYOUT === 'neo_brutalist' ? (
            <>
              <h1 style={{ fontSize: 76, margin: 0, color: '#FFF', fontFamily: 'Impact, sans-serif', textTransform: 'uppercase', lineHeight: 1, textShadow: `6px 6px 0 ${TC}` }}>
                ESTE VIDEO FUE CREADO
              </h1>
              <h1 style={{ fontSize: 76, margin: 0, color: TC, fontFamily: 'Impact, sans-serif', textTransform: 'uppercase', lineHeight: 1, textShadow: `6px 6px 0 #FFF` }}>
                100% CON IA. AUTOMÁTICO.
              </h1>
            </>
          ) : (
            <>
              <h1 style={{
                fontSize: 54, margin: 0, color: '#FFF',
                fontFamily: 'system-ui, -apple-system, sans-serif', fontWeight: 900,
                textTransform: 'uppercase', lineHeight: 1.1,
                textShadow: LAYOUT === 'glassmorphism' ? `0 0 15px rgba(255,255,255,0.4)` : 'none',
              }}>
                ESTE VIDEO FUE CREADO
              </h1>
              <h1 style={{
                fontSize: 54, margin: 0, color: TC,
                fontFamily: 'system-ui, -apple-system, sans-serif', fontWeight: 900,
                textTransform: 'uppercase', lineHeight: 1.1,
                textShadow: LAYOUT === 'glassmorphism' ? `0 0 25px ${TC}80` : 'none',
              }}>
                100% CON IA Y AUTOMÁTICO
              </h1>
            </>
          )}
        </div>

        {/* SUBTEXTO */}
        <div style={{ transform: `translateY(${subY}px)`, marginBottom: 32, maxWidth: 900 }}>
          <p style={{
            fontSize: LAYOUT === 'neo_brutalist' ? 40 : 34, margin: 0, color: '#CCC',
            fontFamily: LAYOUT === 'neo_brutalist' ? 'Arial, sans-serif' : 'system-ui, sans-serif',
            lineHeight: 1.3, fontStyle: 'italic',
          }}>
            Imagina lo que <span style={{ color: TC, fontStyle: 'normal', fontWeight: 900 }}>tu negocio</span> podría hacer con este superpoder.
          </p>
        </div>

        {/* SEPARADOR */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, width: '80%', marginBottom: 32 }}>
          <div style={{ flex: 1, height: LAYOUT === 'neo_brutalist' ? 5 : 2, backgroundColor: TC }} />
          <div style={{
            width: 18, height: 18, backgroundColor: '#FFF',
            transform: 'rotate(45deg)', border: LAYOUT === 'neo_brutalist' ? 'none' : `2px solid ${TC}`
          }} />
          <div style={{ flex: 1, height: LAYOUT === 'neo_brutalist' ? 5 : 2, backgroundColor: TC }} />
        </div>

        {/* URL / CTA DE CONTACTO */}
        <div style={{ transform: `translateY(${urlY}px)`, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 20 }}>
          <div style={{
            opacity: badgePulse,
            backgroundColor: '#000', border: `4px solid ${TC}`,
            padding: '8px 30px', display: 'inline-block',
            borderRadius: LAYOUT === 'neo_brutalist' ? '0' : '30px',
          }}>
            <span style={{ fontSize: 24, color: TC, fontFamily: 'monospace', letterSpacing: 4 }}>
              ✦ POWERED BY AI ✦
            </span>
          </div>

          {LAYOUT === 'neo_brutalist' && (
            <div style={{
              backgroundColor: TC, padding: '22px 48px',
              border: '10px solid #FFF', boxShadow: '14px 14px 0 #FFF',
              display: 'inline-flex', alignItems: 'center', gap: 22,
            }}>
              <div style={{ width: 16, height: 16, backgroundColor: '#000', borderRadius: '50%' }} />
              <span style={{ fontSize: 48, fontWeight: 900, color: '#000', fontFamily: 'monospace', letterSpacing: 2 }}>
                TALENTOCONTARIFA.LAT
              </span>
              <div style={{ width: 16, height: 16, backgroundColor: '#000', borderRadius: '50%' }} />
            </div>
          )}

          {LAYOUT === 'minimal_clean' && (
            <div style={{
              backgroundColor: '#1E1E1E', padding: '20px 45px',
              borderRadius: '20px', border: `3px solid ${TC}`,
              display: 'inline-flex', alignItems: 'center', gap: 20,
              boxShadow: '0 8px 25px rgba(0,0,0,0.4)',
            }}>
              <span style={{ fontSize: 40, fontWeight: 800, color: '#FFF', fontFamily: 'monospace', letterSpacing: 1 }}>
                TALENTOCONTARIFA.LAT
              </span>
            </div>
          )}

          {LAYOUT === 'glassmorphism' && (
            <div style={{
              background: 'rgba(255, 255, 255, 0.05)',
              backdropFilter: 'blur(20px)',
              padding: '24px 50px',
              borderRadius: '24px',
              border: '1.5px solid rgba(255, 255, 255, 0.15)',
              display: 'inline-flex', alignItems: 'center', gap: 20,
              boxShadow: `0 8px 30px ${TC}30`,
            }}>
              <span style={{ fontSize: 40, fontWeight: 900, color: '#FFF', fontFamily: 'monospace', letterSpacing: 2, textShadow: `0 0 12px ${TC}` }}>
                TALENTOCONTARIFA.LAT
              </span>
            </div>
          )}
        </div>

      </div>

      <ProgressBar dur={dur} />
    </AbsoluteFill>
  );
};

// ═══════════════════════════════════════════════════════
// COMPOSITOR PRINCIPAL
// ═══════════════════════════════════════════════════════
export const LatamAINews: React.FC = () => {
  let accumulatedFrames = 0;

  return (
    <AbsoluteFill style={{ backgroundColor: '#000', fontFamily: 'Impact, Arial Black, sans-serif' }}>

      <Audio src={staticFile('news_voice.mp3')} volume={1.4} />
      <Audio src={staticFile('tct_music.mp3')} volume={0.11} />

      {newsData.scenes.map((scene: any, i: number) => {
        const from = accumulatedFrames;
        accumulatedFrames += scene.durationInFrames;
        const dur = scene.durationInFrames;

        return (
          <Sequence key={i} from={from} durationInFrames={dur}>
            {scene.type === 'title' && <TitleScene text1={scene.text1} text2={scene.text2} dur={dur} />}
            {scene.type === 'image_text' && <ImageTextScene text={scene.text} imageFile={`scene_${i}.png`} keyPoints={scene.key_points || []} dur={dur} />}
            {scene.type === 'big_percentage' && <PercentageScene number={scene.number} text={scene.text} dur={dur} />}
            {/* CTA siempre ignora el 'text' de Gemini y usa el copy fijo de firma */}
            {scene.type === 'cta' && <CtaScene dur={dur} />}
          </Sequence>
        );
      })}

    </AbsoluteFill>
  );
};
