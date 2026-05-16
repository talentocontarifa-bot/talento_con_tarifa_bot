import {
  AbsoluteFill,
  Audio,
  Sequence,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
  spring,
  interpolate,
  random
} from 'remotion';
import React from 'react';

const loadFonts = () => {
  if (typeof window !== 'undefined') {
    const link = document.createElement('link');
    link.href = 'https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,300;0,400;0,500;0,600;1,300;1,400;1,500&family=Inter:wght@300;400;700&display=swap';
    link.rel = 'stylesheet';
    document.head.appendChild(link);
  }
};
loadFonts();

const COLORS = {
  bg: '#022C22',
  text: '#FDFCFB',
  accent: '#C5A059',
  accentDark: '#B08C4A',
};

// ==========================================
// BACKGROUND (SUBTLE)
// ==========================================
const AbstractGrid: React.FC = () => {
  return (
    <AbsoluteFill style={{ justifyContent: 'center', alignItems: 'center', opacity: 0.05 }}>
      {new Array(11).fill(true).map((_, i) => (
        <div key={`v-${i}`} style={{ position: 'absolute', left: `${i * 10}%`, top: 0, bottom: 0, width: '1px', backgroundColor: COLORS.text }} />
      ))}
      {new Array(21).fill(true).map((_, i) => (
        <div key={`h-${i}`} style={{ position: 'absolute', top: `${i * 5}%`, left: 0, right: 0, height: '1px', backgroundColor: COLORS.text }} />
      ))}
    </AbsoluteFill>
  );
}

const Sparks: React.FC = () => {
  const frame = useCurrentFrame();
  return (
    <AbsoluteFill style={{ opacity: 0.6 }}>
      {new Array(30).fill(true).map((_, i) => {
        const x = random(`x-${i}`) * 1080;
        const startY = 1920 + random(`y-${i}`) * 1000;
        const speed = 1 + random(`speed-${i}`) * 3;
        const size = 2 + random(`size-${i}`) * 3;
        const currentY = startY - (frame * speed);
        const opacity = interpolate(currentY, [0, 1920], [0, 0.8], { extrapolateRight: 'clamp' });

        return (
          <div
            key={i}
            style={{
              position: 'absolute', left: x, top: currentY,
              width: size, height: size * 2, borderRadius: '10px',
              backgroundColor: COLORS.accent, opacity,
            }}
          />
        );
      })}
    </AbsoluteFill>
  );
};

// ==========================================
// CONTINUOUSLY ANIMATED DECORATORS
// ==========================================
const TopDataChart: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // Endless panning for the chart
  const panX = (frame * 2) % 460;

  return (
    <div style={{ position: 'absolute', top: '80px', left: '80px', right: '80px', height: '150px', opacity: 0.7, zIndex: 0, overflow: 'hidden' }}>
      {/* Label */}
      <div style={{ fontFamily: '"Inter", sans-serif', fontSize: '14px', letterSpacing: '0.4em', color: COLORS.accent, textTransform: 'uppercase', marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '10px' }}>
        <div style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: COLORS.accent, opacity: Math.sin(frame / 10) > 0 ? 1 : 0.3 }} />
        Procesamiento Neuronal Activo
      </div>
      
      {/* Continuously Scrolling Line Chart */}
      <div style={{ width: '200%', height: '100px', transform: `translateX(-${panX}px)`, display: 'flex' }}>
        <svg width="460" height="100" viewBox="0 0 460 100" preserveAspectRatio="none">
          <line x1="0" y1="25" x2="460" y2="25" stroke={COLORS.text} strokeOpacity="0.1" strokeWidth="1" strokeDasharray="5 5" />
          <line x1="0" y1="50" x2="460" y2="50" stroke={COLORS.text} strokeOpacity="0.1" strokeWidth="1" strokeDasharray="5 5" />
          <line x1="0" y1="75" x2="460" y2="75" stroke={COLORS.text} strokeOpacity="0.1" strokeWidth="1" strokeDasharray="5 5" />
          <path d="M 0 80 Q 50 60 100 70 T 200 40 T 300 80 T 400 20 T 460 80" fill="none" stroke={COLORS.accent} strokeWidth="3" style={{ filter: `drop-shadow(0 0 5px ${COLORS.accent})` }} />
        </svg>
        {/* Seamless duplicate */}
        <svg width="460" height="100" viewBox="0 0 460 100" preserveAspectRatio="none">
          <line x1="0" y1="25" x2="460" y2="25" stroke={COLORS.text} strokeOpacity="0.1" strokeWidth="1" strokeDasharray="5 5" />
          <line x1="0" y1="50" x2="460" y2="50" stroke={COLORS.text} strokeOpacity="0.1" strokeWidth="1" strokeDasharray="5 5" />
          <line x1="0" y1="75" x2="460" y2="75" stroke={COLORS.text} strokeOpacity="0.1" strokeWidth="1" strokeDasharray="5 5" />
          <path d="M 0 80 Q 50 60 100 70 T 200 40 T 300 80 T 400 20 T 460 80" fill="none" stroke={COLORS.accent} strokeWidth="3" style={{ filter: `drop-shadow(0 0 5px ${COLORS.accent})` }} />
        </svg>
      </div>
    </div>
  );
};

const BottomDataStats: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // Dynamic fluctuating stat
  const baseStat = 98.4;
  const fluctuation = Math.sin(frame / 15) * 0.3 + Math.cos(frame / 7) * 0.2;
  const currentStat = (baseStat + fluctuation).toFixed(1);

  return (
    <div style={{ position: 'absolute', bottom: '80px', left: '80px', right: '80px', display: 'flex', justifyContent: 'space-between', opacity: 0.8, zIndex: 0 }}>
      
      {/* Left Animated Stat */}
      <div>
        <div style={{ fontFamily: '"Playfair Display", serif', fontSize: '50px', color: COLORS.accent, marginBottom: '5px' }}>
          {currentStat}<span style={{ fontSize: '20px' }}>%</span>
        </div>
        <div style={{ width: '100px', height: '1px', backgroundColor: COLORS.accentDark, marginBottom: '10px' }} />
        <div style={{ fontFamily: '"Inter", sans-serif', fontSize: '12px', letterSpacing: '0.2em', color: COLORS.text, textTransform: 'uppercase' }}>
          Eficiencia Operativa
        </div>
      </div>

      {/* Right Continuously Oscillating Bars */}
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: '8px', height: '80px' }}>
        {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => {
          // Continuous sine wave animation for each bar with phase offset
          const sine = Math.sin((frame / 10) + i);
          const height = interpolate(sine, [-1, 1], [10, 60]);
          
          return (
            <div key={i} style={{
              width: '8px', height: `${height}px`,
              backgroundColor: i >= 5 ? COLORS.accent : COLORS.text,
              opacity: i >= 5 ? 1 : 0.3,
              borderRadius: '2px 2px 0 0'
            }} />
          );
        })}
      </div>

    </div>
  );
}

// ==========================================
// TEXT ANIMATION (WORD BY WORD)
// ==========================================
const AnimatedWord: React.FC<{ word: string; index: number; delay: number }> = ({ word, index, delay }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  
  const pop = spring({
    frame: frame - delay - (index * 4),
    fps,
    config: { damping: 14, mass: 0.6 }
  });

  const translateY = interpolate(pop, [0, 1], [20, 0]);
  const opacity = interpolate(pop, [0, 1], [0, 1]);

  return (
    <span style={{
      display: 'inline-block',
      transform: `translateY(${translateY}px)`,
      opacity,
      marginRight: '22px',
      marginBottom: '5px'
    }}>
      {word}
    </span>
  );
}

const StaggeredText: React.FC<{
  text: string;
  isAccent?: boolean;
  delay?: number;
}> = ({ text, isAccent, delay = 0 }) => {
  const words = text.split(' ');
  
  return (
    <div style={{
      fontFamily: '"Playfair Display", serif',
      fontSize: '85px',
      fontWeight: isAccent ? 500 : 400,
      fontStyle: isAccent ? 'italic' : 'normal',
      color: isAccent ? COLORS.accent : COLORS.text,
      textAlign: 'center',
      lineHeight: 1.15,
      display: 'flex',
      flexWrap: 'wrap',
      justifyContent: 'center',
    }}>
      {words.map((w, i) => <AnimatedWord key={i} word={w} index={i} delay={delay} />)}
    </div>
  );
};

// ==========================================
// MAIN COMPOSITION
// ==========================================
export const VeronikaPromo: React.FC = () => {
  return (
    <AbsoluteFill style={{ backgroundColor: COLORS.bg, overflow: 'hidden' }}>
      <Audio src={staticFile('veronika_voice.mp3')} />
      
      {/* BACKGROUND & DECORATORS */}
      <AbstractGrid />
      <Sparks />
      
      {/* CONTINUOUS TOP AND BOTTOM ANIMATIONS */}
      <TopDataChart />
      <BottomDataStats />

      {/* FOREGROUND TEXT (PERFECTLY CENTERED, RETIMED TO 26s AUDIO) */}
      <AbsoluteFill style={{ zIndex: 10 }}>
        
        {/* Intro (0s - 4s) */}
        <Sequence from={0} durationInFrames={120}>
          <AbsoluteFill style={{ justifyContent: 'center', alignItems: 'center', padding: '0 80px' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              <StaggeredText text="Hola," delay={0} />
              <StaggeredText text="Verónica Madrazo." isAccent delay={10} />
            </div>
          </AbsoluteFill>
        </Sequence>

        {/* Part 1 (4s - 9s) */}
        <Sequence from={120} durationInFrames={150}>
          <AbsoluteFill style={{ justifyContent: 'center', alignItems: 'center', padding: '0 80px' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              <StaggeredText text="Este video fue diseñado" delay={0} />
              <StaggeredText text="completamente" isAccent delay={20} />
              <StaggeredText text="de manera automática." delay={40} />
            </div>
          </AbsoluteFill>
        </Sequence>

        {/* Part 2: AI & Antigravity (9s - 13s) */}
        <Sequence from={270} durationInFrames={120}>
          <AbsoluteFill style={{ justifyContent: 'center', alignItems: 'center', padding: '0 80px' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              <StaggeredText text="Con Inteligencia Artificial" delay={0} />
              <StaggeredText text="& Antigravity." isAccent delay={20} />
            </div>
          </AbsoluteFill>
        </Sequence>

        {/* Part 3 (13s - 17s) */}
        <Sequence from={390} durationInFrames={120}>
          <AbsoluteFill style={{ justifyContent: 'center', alignItems: 'center', padding: '0 80px' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              <StaggeredText text="Pronto te diré cómo..." delay={0} />
              <StaggeredText text="y sabrás mucho más." delay={20} />
            </div>
          </AbsoluteFill>
        </Sequence>

        {/* Part 4 (17s - 21s) */}
        <Sequence from={510} durationInFrames={120}>
          <AbsoluteFill style={{ justifyContent: 'center', alignItems: 'center', padding: '0 80px' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              <StaggeredText text="Pero míralo por ti misma:" delay={0} />
              <StaggeredText text="La fluidez," delay={20} />
              <StaggeredText text="el diseño..." isAccent delay={40} />
            </div>
          </AbsoluteFill>
        </Sequence>

        {/* Part 5 (21s - 24s) */}
        <Sequence from={630} durationInFrames={90}>
          <AbsoluteFill style={{ justifyContent: 'center', alignItems: 'center', padding: '0 80px' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              <StaggeredText text="Verdaderamente" delay={0} />
              <StaggeredText text="Impresionante." isAccent delay={20} />
            </div>
          </AbsoluteFill>
        </Sequence>

        {/* Ending (24s - 26.5s) */}
        <Sequence from={720}>
          <AbsoluteFill style={{ justifyContent: 'center', alignItems: 'center', padding: '0 80px' }}>
           <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              <StaggeredText text="El futuro ya está aquí." delay={0} />
              <StaggeredText text="Nos vemos pronto." delay={20} />
            </div>
          </AbsoluteFill>
        </Sequence>

      </AbsoluteFill>
    </AbsoluteFill>
  );
};
