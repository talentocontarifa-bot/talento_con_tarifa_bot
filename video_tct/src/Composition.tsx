import { AbsoluteFill, useCurrentFrame, interpolate, spring, useVideoConfig, Audio, staticFile, Sequence, Easing } from "remotion";

export const MyComposition = () => {
  return (
    <AbsoluteFill className="bg-slate-950 flex flex-col items-center justify-center overflow-hidden">
      
      {/* FONDO GALAXY: Estrellas animadas con puro CSS */}
      <GalaxyBackground />

      {/* MÚSICA DE FONDO: Empieza desde el frame 0, loop infinito, volumen 20% */}
      <Audio src={staticFile("music.mp3")} volume={0.2} loop />

      {/* AUDIO DE LA VOZ: Arranca en el frame 20 */}
      <Sequence from={20}>
        <Audio src={staticFile("edge_voice.mp3")} volume={1} />
      </Sequence>

      {/* ESCENA 1: Atención Gamers (20 a 100) */}
      <Sequence from={20} durationInFrames={100}>
        <GamerIntro />
      </Sequence>

      {/* ESCENA 2: Darío 6 Años (100 a 200) */}
      <Sequence from={100} durationInFrames={120}>
        <DarioScene />
      </Sequence>

      {/* ESCENA 3: Piscina Intergaláctica (200 a 330) */}
      <Sequence from={200} durationInFrames={130}>
        <PoolScene />
      </Sequence>

      {/* ESCENA 4: CTA Dreamcrafters (330 a 450) */}
      <Sequence from={330} durationInFrames={120}>
        <CTAScene />
      </Sequence>

    </AbsoluteFill>
  );
};

// ==========================================
// COMPONENTES DE LA INVITACIÓN MARIO GALAXY
// ==========================================

const GalaxyBackground = () => {
  const frame = useCurrentFrame();
  const yScroll = (frame * 2) % 1920; // Scroll infinito lento
  
  // Generamos algunas "estrellas" estáticas en posiciones aleatorias 
  // (usamos un array fijo para no romper React)
  const stars = Array.from({ length: 50 }).map((_, i) => ({
    x: (Math.sin(i * 123) * 50 + 50) + '%',
    y: (Math.cos(i * 321) * 50 + 50) + '%',
    size: (i % 3) * 2 + 2,
    blinkOffset: i * 5
  }));

  return (
    <AbsoluteFill className="bg-gradient-to-b from-blue-950 via-indigo-950 to-purple-950">
      <div 
        className="absolute w-full h-[200%] opacity-40"
        style={{ transform: `translateY(${-yScroll}px)` }}
      >
        {stars.map((s, i) => {
          const blink = interpolate(
            Math.sin((frame + s.blinkOffset) * 0.1),
            [-1, 1],
            [0.2, 1]
          );
          return (
            <div 
              key={i}
              className="absolute bg-white rounded-full shadow-[0_0_10px_white]"
              style={{
                left: s.x,
                top: s.y,
                width: s.size,
                height: s.size,
                opacity: blink
              }}
            />
          )
        })}
      </div>
    </AbsoluteFill>
  );
};

const GamerIntro = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // Rebote violento estilo videojuego
  const scale = spring({ fps, frame: frame - 10, config: { damping: 8, stiffness: 200 } });
  const fadeOut = interpolate(frame, [80, 100], [1, 0], { extrapolateRight: "clamp" });

  return (
    <AbsoluteFill className="flex flex-col items-center justify-center p-10" style={{ opacity: fadeOut }}>
      <div 
        className="bg-yellow-400 border-8 border-white rounded-3xl p-10 shadow-[0_20px_0_#b45309]"
        style={{ transform: `scale(${scale}) rotate(-5deg)` }}
      >
        <h1 className="text-red-600 text-[6rem] font-black uppercase text-center leading-none" style={{ textShadow: '4px 4px 0 white, -4px -4px 0 white, 4px -4px 0 white, -4px 4px 0 white' }}>
          ¡ATENCIÓN<br/>GAMERS!
        </h1>
      </div>
    </AbsoluteFill>
  );
};

const DarioScene = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  
  const scale = spring({ fps, frame, config: { damping: 12 } });
  const fadeOut = interpolate(frame, [100, 120], [1, 0], { extrapolateRight: "clamp" });

  // Texto saltarín
  const nameOffset = Math.sin(frame * 0.3) * 20;

  return (
    <AbsoluteFill className="flex flex-col items-center justify-center p-10" style={{ opacity: fadeOut, transform: `scale(${scale})` }}>
      <h2 
        className="text-[9rem] font-black text-white uppercase tracking-tighter"
        style={{ 
          transform: `translateY(${nameOffset}px)`,
          textShadow: '0 20px 0 #1d4ed8, 0 30px 50px rgba(0,0,0,0.8)' 
        }}
      >
        DARÍO
      </h2>
      <div className="bg-red-600 text-white text-6xl font-black px-12 py-6 rounded-full mt-10 border-8 border-white shadow-[0_15px_0_#991b1b]">
        ¡CUMPLE 6 AÑOS!
      </div>
    </AbsoluteFill>
  );
};

const PoolScene = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  
  const slideIn = spring({ fps, frame, config: { damping: 14 } });
  const y = interpolate(slideIn, [0, 1], [500, 0]);
  const fadeOut = interpolate(frame, [110, 130], [1, 0], { extrapolateRight: "clamp" });

  return (
    <AbsoluteFill className="flex flex-col items-center justify-center p-12" style={{ opacity: fadeOut }}>
      <div 
        className="w-full bg-cyan-400 border-[10px] border-white rounded-[3rem] p-12 text-center shadow-[0_20px_50px_rgba(34,211,238,0.5)]"
        style={{ transform: `translateY(${y}px)` }}
      >
        <span className="text-8xl">🏊‍♂️🌌</span>
        <h3 className="text-white text-6xl font-black uppercase mt-8 leading-tight drop-shadow-xl">
          PISCINA<br/>INTERGALÁCTICA
        </h3>
        <p className="text-blue-900 text-5xl font-black mt-6 bg-yellow-300 rounded-full py-4 px-8 inline-block transform -rotate-2">
          SÁBADO 24 DE MAYO
        </p>
      </div>
    </AbsoluteFill>
  );
};

const CTAScene = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  
  const scale = spring({ fps, frame: frame - 10, config: { damping: 10 } });

  return (
    <AbsoluteFill className="flex flex-col items-center justify-center" style={{ transform: `scale(${scale})` }}>
      <div className="w-48 h-48 bg-white rounded-full flex items-center justify-center mb-10 shadow-[0_0_100px_white]">
        <span className="text-8xl">🎟️</span>
      </div>
      <h2 className="text-white text-6xl font-black uppercase tracking-widest text-center leading-tight drop-shadow-2xl">
        CONSIGUE TU<br/>INVITACIÓN EN
      </h2>
      <div className="mt-8 bg-gradient-to-r from-purple-600 to-pink-500 text-white text-5xl font-black px-12 py-6 rounded-full border-4 border-white shadow-[0_15px_30px_rgba(219,39,119,0.5)]">
        DREAMCRAFTERS.LAT
      </div>
    </AbsoluteFill>
  );
};
