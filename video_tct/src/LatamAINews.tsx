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
  useCurrentFrame as useFrame,
} from 'remotion';
import newsData from './news_data.json';

const TC = newsData.theme_color;

// ─────────────────────────────────────────────
// ELEMENTOS DECORATIVOS GLOBALES
// ─────────────────────────────────────────────

/** Líneas de ruido/scanlines para sensación de broadcast en vivo */
const Scanlines: React.FC = () => (
  <div
    style={{
      position: 'absolute', inset: 0, zIndex: 50, pointerEvents: 'none',
      background: 'repeating-linear-gradient(0deg, transparent, transparent 3px, rgba(0,0,0,0.15) 3px, rgba(0,0,0,0.15) 4px)',
    }}
  />
);

/** Ticker "EN VIVO" parpadeante */
const LiveBadge: React.FC = () => {
  const frame = useCurrentFrame();
  const blink = Math.floor(frame / 15) % 2 === 0;
  return (
    <div style={{
      position: 'absolute', top: 55, left: 55, zIndex: 200,
      display: 'flex', alignItems: 'center', gap: '18px',
      backgroundColor: '#FF0000', padding: '14px 30px',
      border: '5px solid #000', boxShadow: '6px 6px 0 #000',
    }}>
      <div style={{
        width: 24, height: 24, borderRadius: '50%',
        backgroundColor: blink ? '#FFF' : 'transparent',
        border: '3px solid #FFF', transition: 'background 0.1s',
      }} />
      <span style={{ fontSize: 36, fontWeight: 900, color: '#FFF', letterSpacing: 6, fontFamily: 'monospace' }}>
        EN VIVO
      </span>
    </div>
  );
};

/** Marca de agua TCT esquina superior derecha */
const Watermark: React.FC = () => (
  <div style={{ position: 'absolute', top: 50, right: 50, zIndex: 200 }}>
    <Img
      src={staticFile('tct_logo.svg')}
      style={{ width: 100, height: 100, filter: `drop-shadow(4px 4px 0px ${TC})` }}
    />
  </div>
);

/** Barra de progreso inferior (progresa durante toda la escena) */
const SceneProgressBar: React.FC<{ durationInFrames: number }> = ({ durationInFrames }) => {
  const frame = useCurrentFrame();
  const progress = interpolate(frame, [0, durationInFrames], [0, 100], { extrapolateRight: 'clamp' });
  return (
    <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, zIndex: 300, height: 14, backgroundColor: '#000' }}>
      <div style={{ height: '100%', width: `${progress}%`, backgroundColor: TC, transition: 'width 0.1s' }} />
    </div>
  );
};

/** Ruido estático animado — aparece 8 frames al corte de escena */
const GlitchOverlay: React.FC = () => {
  const frame = useCurrentFrame();
  if (frame > 8) return null;
  const opacity = interpolate(frame, [0, 8], [0.6, 0], { extrapolateRight: 'clamp' });
  return (
    <div style={{
      position: 'absolute', inset: 0, zIndex: 400, opacity,
      background: `repeating-linear-gradient(
        90deg,
        transparent 0px, transparent ${Math.random() * 80 + 20}px,
        ${TC} ${Math.random() * 80 + 20}px, ${TC} ${Math.random() * 80 + 24}px
      )`,
      mixBlendMode: 'overlay',
    }} />
  );
};

// ─────────────────────────────────────────────
// ESCENA 1: TÍTULO — "Breaking News" estilo broadcast
// ─────────────────────────────────────────────
const TitleScene: React.FC<{ text1: string; text2: string; durationInFrames: number }> = ({ text1, text2, durationInFrames }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // text1 entra desde abajo (rebote elástico)
  const t1Y = spring({ fps, frame, from: 300, to: 0, config: { damping: 10, stiffness: 120 } });
  // text2 entra desde arriba con delay
  const t2Y = spring({ fps, frame: Math.max(0, frame - 8), from: -200, to: 0, config: { damping: 12 } });
  // Rectángulo de fondo se expande desde el centro
  const rectScale = spring({ fps, frame, from: 0, to: 1, config: { damping: 14 } });
  // Líneas decorativas que se dibujan de izquierda a derecha
  const lineW = interpolate(frame, [5, 25], [0, 100], { extrapolateRight: 'clamp' });

  // Rotación leve pendular que oscila toda la escena
  const tilt = interpolate(frame, [0, durationInFrames], [-1.5, 1.5], { extrapolateRight: 'clamp' });

  return (
    <AbsoluteFill style={{ backgroundColor: '#000', justifyContent: 'center', alignItems: 'center' }}>
      <GlitchOverlay />
      <Scanlines />
      <LiveBadge />
      <Watermark />
      <SceneProgressBar durationInFrames={durationInFrames} />

      {/* Caja principal girada */}
      <div style={{
        transform: `rotate(${tilt}deg) scale(${rectScale})`,
        textAlign: 'center', position: 'relative',
      }}>
        {/* Bloque color sólido detrás del text1 */}
        <div style={{
          backgroundColor: TC, padding: '20px 60px',
          border: '12px solid #FFF', boxShadow: '20px 20px 0 #FFF',
          marginBottom: 0,
          transform: `translateY(${t1Y}px)`,
        }}>
          <h1 style={{
            fontSize: 130, margin: 0, color: '#000',
            fontFamily: 'Impact, sans-serif', letterSpacing: -4,
            textTransform: 'uppercase', lineHeight: 1,
          }}>
            {text1}
          </h1>
        </div>

        {/* Líneas decorativas horizontales */}
        <div style={{ display: 'flex', justifyContent: 'center', gap: 12, margin: '16px 0' }}>
          {[1, 2, 3, 4].map(n => (
            <div key={n} style={{
              height: 8, width: `${lineW * (n % 2 === 0 ? 0.8 : 0.5)}px`,
              backgroundColor: n % 2 === 0 ? '#FFF' : TC, border: '3px solid #000',
            }} />
          ))}
        </div>

        {/* text2 en caja blanca */}
        <div style={{
          backgroundColor: '#FFF', padding: '14px 50px',
          border: '10px solid #000', boxShadow: '-14px 14px 0 ' + TC,
          transform: `translateY(${t2Y}px)`,
        }}>
          <h2 style={{
            fontSize: 80, margin: 0, color: '#000',
            fontFamily: 'Impact, sans-serif',
            textTransform: 'uppercase', letterSpacing: 2,
          }}>
            {text2}
          </h2>
        </div>
      </div>
    </AbsoluteFill>
  );
};

// ─────────────────────────────────────────────
// ESCENA 2: IMAGEN + TEXTO — Pantalla dividida brutal
// ─────────────────────────────────────────────
const ImageTextScene: React.FC<{ text: string; imageFile: string; durationInFrames: number }> = ({ text, imageFile, durationInFrames }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const kenBurns = interpolate(frame, [0, durationInFrames], [1.08, 1.2], { extrapolateRight: 'clamp' });

  // Panel inferior sube desde abajo
  const panelY = spring({ fps, frame, from: 800, to: 0, config: { damping: 16 } });
  // Texto aparece con delay
  const textOpacity = interpolate(frame, [8, 20], [0, 1], { extrapolateRight: 'clamp' });
  const textX = spring({ fps, frame: Math.max(0, frame - 8), from: -100, to: 0, config: { damping: 14 } });

  // Borde de color que recorre el perímetro de la imagen (efecto "outline reveal")
  const borderProgress = interpolate(frame, [2, 22], [0, 100], { extrapolateRight: 'clamp' });

  return (
    <AbsoluteFill>
      <GlitchOverlay />

      {/* IMAGEN con Ken Burns */}
      <Img
        src={staticFile(imageFile)}
        style={{ width: '100%', height: '75%', objectFit: 'cover', transform: `scale(${kenBurns})`, transformOrigin: 'center center' }}
      />

      {/* Degradado inferior */}
      <div style={{ position: 'absolute', bottom: '25%', left: 0, right: 0, height: 260, background: 'linear-gradient(transparent, #000)' }} />

      {/* PANEL INFERIOR — sube desde abajo */}
      <div style={{
        position: 'absolute', bottom: 0, left: 0, right: 0, height: '30%',
        backgroundColor: '#000', borderTop: `14px solid ${TC}`,
        transform: `translateY(${panelY}px)`, padding: '30px 50px',
        display: 'flex', flexDirection: 'column', justifyContent: 'center',
      }}>
        {/* Línea decorativa que se dibuja */}
        <div style={{ width: `${borderProgress}%`, height: 6, backgroundColor: TC, marginBottom: 20 }} />

        <div style={{
          opacity: textOpacity, transform: `translateX(${textX}px)`,
          display: 'flex', alignItems: 'flex-start', gap: 20,
        }}>
          {/* Bloque de color lateral — detalle neo-brutalista */}
          <div style={{ width: 16, height: 100, backgroundColor: TC, flexShrink: 0, marginTop: 4 }} />
          <h2 style={{
            fontSize: 70, margin: 0, color: '#FFF',
            fontFamily: 'Impact, sans-serif',
            textTransform: 'uppercase', lineHeight: 1.05,
          }}>
            {text}
          </h2>
        </div>
      </div>

      <Watermark />
      <SceneProgressBar durationInFrames={durationInFrames} />
      <Scanlines />
    </AbsoluteFill>
  );
};

// ─────────────────────────────────────────────
// ESCENA 3: PORCENTAJE — Contador dramático con explosión
// ─────────────────────────────────────────────
const PercentageScene: React.FC<{ number: number; text: string; durationInFrames: number }> = ({ number, text, durationInFrames }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // Número cuenta rápido los primeros 40 frames, luego frena dramáticamente
  const animatedNumber = Math.floor(
    interpolate(frame, [0, 40, 55], [0, number * 1.1, number], {
      extrapolateRight: 'clamp', extrapolateLeft: 'clamp',
    })
  );

  // Escala "punch" al llegar al número final
  const punch = spring({ fps, frame: Math.max(0, frame - 52), from: 0.8, to: 1, config: { damping: 6, stiffness: 400 } });

  // Texto descriptivo aparece tarde
  const textY = spring({ fps, frame: Math.max(0, frame - 30), from: 80, to: 0, config: { damping: 12 } });

  // Fondo con rayas diagonales animadas (se desplazan)
  const stripeOffset = frame * 2;

  return (
    <AbsoluteFill style={{ backgroundColor: '#000', justifyContent: 'center', alignItems: 'center', overflow: 'hidden' }}>
      <GlitchOverlay />

      {/* Fondo de rayas diagonales */}
      <div style={{
        position: 'absolute', inset: 0,
        backgroundImage: `repeating-linear-gradient(
          45deg,
          transparent, transparent 40px,
          ${TC}18 40px, ${TC}18 44px
        )`,
        backgroundPosition: `${stripeOffset}px ${stripeOffset}px`,
      }} />

      {/* Cruz decorativa central */}
      <div style={{ position: 'absolute', width: 8, height: '100%', backgroundColor: `${TC}30` }} />
      <div style={{ position: 'absolute', height: 8, width: '100%', backgroundColor: `${TC}30` }} />

      {/* NÚMERO GIGANTE */}
      <div style={{ zIndex: 10, textAlign: 'center', transform: `scale(${punch})` }}>
        <div style={{ position: 'relative', display: 'inline-block' }}>
          {/* Sombra neo-brutalista del número */}
          <h1 style={{
            fontSize: 400, margin: 0, lineHeight: 0.85,
            fontFamily: 'Impact, sans-serif',
            color: 'transparent',
            WebkitTextStroke: `8px ${TC}`,
            position: 'absolute', top: 12, left: 12,
          }}>
            {animatedNumber}%
          </h1>
          <h1 style={{
            fontSize: 400, margin: 0, lineHeight: 0.85,
            fontFamily: 'Impact, sans-serif',
            color: TC,
            position: 'relative',
          }}>
            {animatedNumber}%
          </h1>
        </div>

        {/* Texto descriptivo */}
        <div style={{
          transform: `translateY(${textY}px)`,
          marginTop: 40,
          backgroundColor: '#FFF', padding: '16px 60px',
          border: '8px solid #000', boxShadow: `10px 10px 0 ${TC}`,
          display: 'inline-block',
        }}>
          <h2 style={{
            fontSize: 60, margin: 0, color: '#000',
            fontFamily: 'Impact, sans-serif', textTransform: 'uppercase',
          }}>
            {text}
          </h2>
        </div>
      </div>

      <LiveBadge />
      <Watermark />
      <SceneProgressBar durationInFrames={durationInFrames} />
      <Scanlines />
    </AbsoluteFill>
  );
};

// ─────────────────────────────────────────────
// ESCENA 4: CTA — Cortina de cierre épica
// ─────────────────────────────────────────────
const CtaScene: React.FC<{ text: string; durationInFrames: number }> = ({ text, durationInFrames }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // Cortina de color que barre de arriba a abajo
  const curtainH = interpolate(frame, [0, 18], [0, 100], { extrapolateRight: 'clamp' });

  // Logo entra con rebote
  const logoScale = spring({ fps, frame: Math.max(0, frame - 14), from: 0, to: 1, config: { damping: 8, stiffness: 300 } });

  // Texto se revela con delay
  const textOpacity = interpolate(frame, [22, 35], [0, 1], { extrapolateRight: 'clamp' });
  const textY = spring({ fps, frame: Math.max(0, frame - 22), from: 50, to: 0, config: { damping: 14 } });

  // URL desliza desde abajo al final
  const urlY = spring({ fps, frame: Math.max(0, frame - 38), from: 300, to: 0, config: { damping: 12 } });

  // Rotación dramática del logo
  const logoRotate = spring({ fps, frame: Math.max(0, frame - 14), from: -180, to: 0, config: { damping: 10 } });

  return (
    <AbsoluteFill style={{ backgroundColor: '#000', justifyContent: 'center', alignItems: 'center', overflow: 'hidden' }}>
      <GlitchOverlay />
      <Scanlines />

      {/* CORTINA de entrada */}
      <div style={{
        position: 'absolute', top: 0, left: 0, right: 0,
        height: `${curtainH}%`, backgroundColor: TC,
        zIndex: 5,
      }} />

      {/* Patrón de puntos de fondo */}
      <div style={{
        position: 'absolute', inset: 0, zIndex: 1,
        backgroundImage: `radial-gradient(${TC}40 2px, transparent 2px)`,
        backgroundSize: '40px 40px',
      }} />

      {/* CONTENIDO centrado */}
      <div style={{ zIndex: 20, textAlign: 'center', padding: '0 80px' }}>

        {/* Logo TCT girando */}
        <div style={{
          transform: `scale(${logoScale}) rotate(${logoRotate}deg)`,
          marginBottom: 40, display: 'inline-block',
        }}>
          <div style={{
            backgroundColor: TC, padding: 30,
            border: '10px solid #FFF', boxShadow: '16px 16px 0 #FFF',
            display: 'inline-block',
          }}>
            <Img src={staticFile('tct_logo.svg')} style={{ width: 180, height: 180 }} />
          </div>
        </div>

        {/* Frase CTA */}
        <div style={{ opacity: textOpacity, transform: `translateY(${textY}px)` }}>
          <h1 style={{
            fontSize: 90, margin: '0 0 16px 0', color: '#FFF',
            fontFamily: 'Impact, sans-serif', textTransform: 'uppercase',
            lineHeight: 1,
            textShadow: `6px 6px 0 ${TC}`,
          }}>
            {text}
          </h1>
        </div>

        {/* Separador */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, margin: '30px 0', justifyContent: 'center' }}>
          <div style={{ flex: 1, height: 6, backgroundColor: TC }} />
          <div style={{ width: 20, height: 20, backgroundColor: '#FFF', transform: 'rotate(45deg)' }} />
          <div style={{ flex: 1, height: 6, backgroundColor: TC }} />
        </div>

        {/* URL — entra desde abajo */}
        <div style={{ transform: `translateY(${urlY}px)` }}>
          <div style={{
            backgroundColor: TC, padding: '22px 50px',
            border: '10px solid #FFF', boxShadow: '14px 14px 0 #FFF',
            display: 'inline-flex', alignItems: 'center', gap: 24,
          }}>
            <div style={{ width: 18, height: 18, backgroundColor: '#000', borderRadius: '50%' }} />
            <span style={{ fontSize: 52, fontWeight: 900, color: '#000', fontFamily: 'monospace', letterSpacing: 2 }}>
              TALENTOCONTARIFA.LAT
            </span>
            <div style={{ width: 18, height: 18, backgroundColor: '#000', borderRadius: '50%' }} />
          </div>
        </div>

      </div>

      <SceneProgressBar durationInFrames={durationInFrames} />
    </AbsoluteFill>
  );
};

// ─────────────────────────────────────────────
// COMPOSITOR PRINCIPAL
// ─────────────────────────────────────────────
export const LatamAINews: React.FC = () => {
  let accumulatedFrames = 0;

  return (
    <AbsoluteFill style={{ backgroundColor: '#000', fontFamily: 'Impact, Arial Black, sans-serif' }}>

      {/* AUDIO */}
      <Audio src={staticFile('news_voice.mp3')} volume={1.4} />
      <Audio src={staticFile('tct_music.mp3')} volume={0.12} />

      {/* ESCENAS — cada una montada en su Sequence */}
      {newsData.scenes.map((scene: any, i: number) => {
        const from = accumulatedFrames;
        accumulatedFrames += scene.durationInFrames;

        return (
          <Sequence key={i} from={from} durationInFrames={scene.durationInFrames}>
            {scene.type === 'title' && (
              <TitleScene text1={scene.text1} text2={scene.text2} durationInFrames={scene.durationInFrames} />
            )}
            {scene.type === 'image_text' && (
              <ImageTextScene text={scene.text} imageFile={`scene_${i}.png`} durationInFrames={scene.durationInFrames} />
            )}
            {scene.type === 'big_percentage' && (
              <PercentageScene number={scene.number} text={scene.text} durationInFrames={scene.durationInFrames} />
            )}
            {scene.type === 'cta' && (
              <CtaScene text={scene.text} durationInFrames={scene.durationInFrames} />
            )}
          </Sequence>
        );
      })}

    </AbsoluteFill>
  );
};
