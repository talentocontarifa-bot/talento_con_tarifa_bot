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
import newsData from './news_data.json';

const TC = newsData.theme_color;

// ═══════════════════════════════════════════════════════
// EFECTOS GLOBALES
// ═══════════════════════════════════════════════════════

/** Scanlines estilo CRT broadcast */
const Scanlines: React.FC = () => (
  <div style={{
    position: 'absolute', inset: 0, zIndex: 50, pointerEvents: 'none',
    background: 'repeating-linear-gradient(0deg, transparent, transparent 3px, rgba(0,0,0,0.13) 3px, rgba(0,0,0,0.13) 4px)',
  }} />
);

/** Glitch de corte entre escenas — 10 frames + aberración cromática */
const GlitchCut: React.FC = () => {
  const frame = useCurrentFrame();
  if (frame > 10) return null;

  const opacity = interpolate(frame, [0, 10], [1, 0], { extrapolateRight: 'clamp' });
  // Desplazamiento RGB split
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
};

/** Glitch periódico de imagen — desplazamiento aleatorio cada N frames */
const ImageGlitch: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const frame = useCurrentFrame();

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

/** Badge "EN VIVO" parpadeante */
const LiveBadge: React.FC = () => {
  const frame = useCurrentFrame();
  const blink = Math.floor(frame / 15) % 2 === 0;
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

/** Barra de progreso de escena */
const ProgressBar: React.FC<{ dur: number }> = ({ dur }) => {
  const frame = useCurrentFrame();
  const pct = interpolate(frame, [0, dur], [0, 100], { extrapolateRight: 'clamp' });
  return (
    <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, zIndex: 300, height: 12, backgroundColor: '#111' }}>
      <div style={{ height: '100%', width: `${pct}%`, backgroundColor: TC }} />
    </div>
  );
};

// ═══════════════════════════════════════════════════════
// ESCENA TÍTULO — Breaking News con chromatic aberration en texto
// ═══════════════════════════════════════════════════════
const TitleScene: React.FC<{ text1: string; text2: string; dur: number }> = ({ text1, text2, dur }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const t1Y = spring({ fps, frame, from: 400, to: 0, config: { damping: 9, stiffness: 100 } });
  const t2Y = spring({ fps, frame: Math.max(0, frame - 10), from: -300, to: 0, config: { damping: 11 } });
  const scaleIn = spring({ fps, frame, from: 0, to: 1, config: { damping: 13 } });
  const tilt = interpolate(frame, [0, dur], [-2, 2]);
  const lineW = interpolate(frame, [8, 30], [0, 100], { extrapolateRight: 'clamp' });

  // Chromatic aberration en el título: capas RGB separadas
  const aberration = interpolate(frame, [0, 6, 12], [14, 0, 4], { extrapolateRight: 'clamp' });

  return (
    <AbsoluteFill style={{ backgroundColor: '#000', justifyContent: 'center', alignItems: 'center' }}>
      <GlitchCut />
      <Scanlines />
      <LiveBadge />
      <Watermark />
      <ProgressBar dur={dur} />

      <div style={{ transform: `rotate(${tilt}deg) scale(${scaleIn})`, textAlign: 'center' }}>

        {/* TEXT1 con aberración cromática */}
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
          {/* Texto principal en caja de color */}
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

        {/* Líneas decorativas animadas */}
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

        {/* TEXT2 en caja blanca */}
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
      </div>
    </AbsoluteFill>
  );
};

// ═══════════════════════════════════════════════════════
// ESCENA IMAGEN — Imagen + key_points secuenciales + panel inferior
// ═══════════════════════════════════════════════════════
const ImageTextScene: React.FC<{ text: string; imageFile: string; keyPoints: string[]; dur: number }> = ({ text, imageFile, keyPoints, dur }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const kenBurns = interpolate(frame, [0, dur], [1.0, 1.18], { extrapolateRight: 'clamp' });
  const panelY = spring({ fps, frame, from: 900, to: 0, config: { damping: 15 } });
  const lineW = interpolate(frame, [5, 25], [0, 100], { extrapolateRight: 'clamp' });

  // Cada key_point aparece con un retardo escalonado
  // Distribuidos en el primer 65% de la escena para que se lean bien
  const pointInterval = Math.floor(dur * 0.22); // cada punto dura ~22% de la escena

  const points = (keyPoints || []).slice(0, 3);

  return (
    <AbsoluteFill>
      <GlitchCut />

      {/* IMAGEN con Ken Burns + glitch periódico */}
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '72%', overflow: 'hidden' }}>
        <ImageGlitch>
          <Img
            src={staticFile(imageFile)}
            style={{ width: '100%', height: '100%', objectFit: 'cover', transform: `scale(${kenBurns})` }}
          />
        </ImageGlitch>
      </div>

      {/* ── KEY POINTS secuenciales sobre la imagen ── */}
      {points.map((point, idx) => {
        const startAt = 6 + idx * pointInterval;
        const exitAt = startAt + pointInterval - 4;

        // Entrada: sube desde abajo con spring
        const entryY = spring({ fps, frame: Math.max(0, frame - startAt), from: 120, to: 0, config: { damping: 12 } });
        // Salida: se va hacia arriba
        const exitY = frame > exitAt
          ? interpolate(frame, [exitAt, exitAt + 8], [0, -140], { extrapolateRight: 'clamp' })
          : 0;
        const opacity = frame < startAt
          ? 0
          : frame > exitAt + 6 ? 0 : 1;

        // Posición horizontal alterna: izq / der / izq
        const isRight = idx % 2 === 1;
        // Número de badge
        const badgeNum = idx + 1;

        // Icono según posición — neo-brutalista
        const icons = ['▶', '◆', '★'];

        return (
          <div
            key={idx}
            style={{
              position: 'absolute',
              // Posiciones verticales escalonadas en el área de la imagen
              top: `${14 + idx * 16}%`,
              left: isRight ? 'auto' : '40px',
              right: isRight ? '40px' : 'auto',
              zIndex: 100 + idx,
              opacity,
              transform: `translateY(${entryY + exitY}px)`,
              maxWidth: '580px',
            }}
          >
            {/* Número de secuencia */}
            <div style={{
              display: 'inline-flex', alignItems: 'center', gap: 0,
              filter: 'drop-shadow(6px 6px 0px rgba(0,0,0,0.9))',
            }}>
              {/* Badge numerado */}
              <div style={{
                backgroundColor: TC, width: 60, height: 60,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                border: '5px solid #000', flexShrink: 0,
              }}>
                <span style={{ fontSize: 32, fontWeight: 900, color: '#000', fontFamily: 'Impact, sans-serif' }}>
                  {badgeNum}
                </span>
              </div>
              {/* Texto del punto */}
              <div style={{
                backgroundColor: '#000', padding: '12px 22px',
                border: '5px solid #000',
                borderLeft: 'none',
              }}>
                <span style={{
                  fontSize: 48, color: '#FFF',
                  fontFamily: 'Impact, sans-serif',
                  textTransform: 'uppercase', letterSpacing: 1,
                  lineHeight: 1,
                }}>
                  <TypeReveal text={point} startFrame={startAt} style={{ color: '#FFF' }} />
                </span>
              </div>
              {/* Acento de color al final */}
              <div style={{
                width: 12, height: 60,
                backgroundColor: TC,
                border: '5px solid #000',
                borderLeft: 'none',
                flexShrink: 0,
              }} />
            </div>
          </div>
        );
      })}

      {/* Degradado al panel inferior */}
      <div style={{ position: 'absolute', top: '58%', left: 0, right: 0, height: '18%', background: 'linear-gradient(transparent, #000)' }} />

      {/* PANEL INFERIOR con título de la escena */}
      <div style={{
        position: 'absolute', bottom: 0, left: 0, right: 0, height: '30%',
        backgroundColor: '#000', borderTop: `12px solid ${TC}`,
        transform: `translateY(${panelY}px)`,
        padding: '22px 50px',
        display: 'flex', flexDirection: 'column', justifyContent: 'center',
      }}>
        <div style={{ height: 6, width: `${lineW}%`, backgroundColor: TC, marginBottom: 16 }} />
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 18 }}>
          <div style={{ width: 14, flexShrink: 0, alignSelf: 'stretch', backgroundColor: TC, minHeight: 70 }} />
          <h2 style={{
            fontSize: 64, margin: 0, color: '#FFF',
            fontFamily: 'Impact, sans-serif', textTransform: 'uppercase', lineHeight: 1.05,
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
// ESCENA PORCENTAJE — Contador con overshoot + fondo animado
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

  // Aberración cromática en el número cuando llega al valor final
  const ab = frame > 56 ? interpolate(frame, [56, 62], [10, 0], { extrapolateRight: 'clamp' }) : 0;

  return (
    <AbsoluteFill style={{ backgroundColor: '#000', justifyContent: 'center', alignItems: 'center', overflow: 'hidden' }}>
      <GlitchCut />

      {/* Fondo de rayas diagonales en movimiento */}
      <div style={{
        position: 'absolute', inset: 0,
        backgroundImage: `repeating-linear-gradient(45deg, transparent, transparent 38px, ${TC}15 38px, ${TC}15 42px)`,
        backgroundPosition: `${stripeOffset}px ${stripeOffset}px`,
      }} />

      {/* Cruz decorativa */}
      <div style={{ position: 'absolute', width: 6, height: '100%', backgroundColor: `${TC}25` }} />
      <div style={{ position: 'absolute', height: 6, width: '100%', backgroundColor: `${TC}25` }} />

      {/* NÚMERO */}
      <div style={{ zIndex: 10, textAlign: 'center', transform: `scale(${punch})` }}>
        <div style={{ position: 'relative', display: 'inline-block' }}>
          {/* Canal R aberración */}
          <h1 style={{
            fontSize: 380, margin: 0, lineHeight: 0.85,
            fontFamily: 'Impact, sans-serif',
            color: 'rgba(255,0,80,0.5)',
            position: 'absolute', top: 0, left: ab,
          }}>{animatedNum}%</h1>
          {/* Canal B aberración */}
          <h1 style={{
            fontSize: 380, margin: 0, lineHeight: 0.85,
            fontFamily: 'Impact, sans-serif',
            color: 'rgba(0,200,255,0.5)',
            position: 'absolute', top: 0, left: -ab,
          }}>{animatedNum}%</h1>
          {/* Número principal */}
          <h1 style={{
            fontSize: 380, margin: 0, lineHeight: 0.85,
            fontFamily: 'Impact, sans-serif', color: TC,
            position: 'relative',
            textShadow: `10px 10px 0 rgba(255,255,255,0.15)`,
          }}>{animatedNum}%</h1>
        </div>

        {/* Etiqueta */}
        <div style={{
          transform: `translateY(${textY}px)`, marginTop: 30,
          backgroundColor: '#FFF', padding: '14px 55px',
          border: '8px solid #000', boxShadow: `10px 10px 0 ${TC}`,
          display: 'inline-block',
        }}>
          <h2 style={{
            fontSize: 58, margin: 0, color: '#000',
            fontFamily: 'Impact, sans-serif', textTransform: 'uppercase',
          }}>{text}</h2>
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
// ESCENA CTA — SIEMPRE FIJO, copy de firma de IA
// ═══════════════════════════════════════════════════════
const CtaScene: React.FC<{ dur: number }> = ({ dur }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const curtainH = interpolate(frame, [0, 20], [0, 100], { extrapolateRight: 'clamp' });
  const logoScale = spring({ fps, frame: Math.max(0, frame - 16), from: 0, to: 1, config: { damping: 7, stiffness: 280 } });
  const logoRotate = spring({ fps, frame: Math.max(0, frame - 16), from: -180, to: 0, config: { damping: 10 } });
  const headlineY = spring({ fps, frame: Math.max(0, frame - 28), from: 60, to: 0, config: { damping: 13 } });
  const subY = spring({ fps, frame: Math.max(0, frame - 40), from: 80, to: 0, config: { damping: 13 } });
  const urlY = spring({ fps, frame: Math.max(0, frame - 52), from: 200, to: 0, config: { damping: 12 } });
  const headlineOpacity = interpolate(frame, [28, 42], [0, 1], { extrapolateRight: 'clamp' });

  // Parpadeo sutil del badge IA
  const badgePulse = interpolate(frame % 30, [0, 15, 30], [1, 0.7, 1]);

  return (
    <AbsoluteFill style={{ backgroundColor: '#000', justifyContent: 'center', alignItems: 'center', overflow: 'hidden' }}>
      <GlitchCut />
      <Scanlines />

      {/* Cortina de entrada */}
      <div style={{
        position: 'absolute', top: 0, left: 0, right: 0,
        height: `${curtainH}%`, backgroundColor: TC, zIndex: 5,
      }} />

      {/* Fondo de puntos */}
      <div style={{
        position: 'absolute', inset: 0, zIndex: 1,
        backgroundImage: `radial-gradient(${TC}35 2px, transparent 2px)`,
        backgroundSize: '42px 42px',
      }} />

      {/* Contenido */}
      <div style={{ zIndex: 20, textAlign: 'center', padding: '0 70px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 0 }}>

        {/* Logo TCT rotando */}
        <div style={{ transform: `scale(${logoScale}) rotate(${logoRotate}deg)`, marginBottom: 36 }}>
          <div style={{
            backgroundColor: TC, padding: 28,
            border: '10px solid #FFF', boxShadow: '16px 16px 0 #FFF',
            display: 'inline-block',
          }}>
            <Img src={staticFile('tct_logo.svg')} style={{ width: 160, height: 160 }} />
          </div>
        </div>

        {/* Headline principal */}
        <div style={{ opacity: headlineOpacity, transform: `translateY(${headlineY}px)`, marginBottom: 16 }}>
          <h1 style={{
            fontSize: 76, margin: 0, color: '#FFF',
            fontFamily: 'Impact, sans-serif', textTransform: 'uppercase',
            lineHeight: 1, textShadow: `6px 6px 0 ${TC}`,
          }}>
            ESTE VIDEO FUE CREADO
          </h1>
          <h1 style={{
            fontSize: 76, margin: 0, color: TC,
            fontFamily: 'Impact, sans-serif', textTransform: 'uppercase',
            lineHeight: 1, textShadow: `6px 6px 0 #FFF`,
          }}>
            100% CON IA. AUTOMÁTICO.
          </h1>
        </div>

        {/* Subtexto */}
        <div style={{ transform: `translateY(${subY}px)`, marginBottom: 32, maxWidth: 900 }}>
          <p style={{
            fontSize: 40, margin: 0, color: '#CCC',
            fontFamily: 'Arial, sans-serif', lineHeight: 1.3,
            fontStyle: 'italic',
          }}>
            Imagina lo que <span style={{ color: TC, fontStyle: 'normal', fontWeight: 900 }}>tu negocio</span> podría
            hacer con este superpoder.
          </p>
        </div>

        {/* Separador */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, width: '80%', marginBottom: 32 }}>
          <div style={{ flex: 1, height: 5, backgroundColor: TC }} />
          <div style={{ width: 18, height: 18, backgroundColor: '#FFF', transform: 'rotate(45deg)' }} />
          <div style={{ flex: 1, height: 5, backgroundColor: TC }} />
        </div>

        {/* Badge IA pulsante */}
        <div style={{ transform: `translateY(${urlY}px)`, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 20 }}>
          <div style={{
            opacity: badgePulse,
            backgroundColor: '#000', border: `4px solid ${TC}`,
            padding: '8px 30px', display: 'inline-block',
          }}>
            <span style={{ fontSize: 28, color: TC, fontFamily: 'monospace', letterSpacing: 4 }}>
              ✦ POWERED BY AI ✦
            </span>
          </div>

          {/* URL / CTA de contacto */}
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
