import {
  AbsoluteFill,
  Audio,
  interpolate,
  Sequence,
  spring,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from 'remotion';
import './style.css';

export const ClaudeDesign: React.FC = () => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();

  // Animaciones de contadores (Metrics)
  const uptime = interpolate(frame - 360, [0, 60], [0, 99.8], {extrapolateRight: 'clamp'});
  const latency = interpolate(frame - 370, [0, 60], [100, 4.7], {extrapolateRight: 'clamp'});
  const accuracy = interpolate(frame - 380, [0, 60], [0, 98], {extrapolateRight: 'clamp'});

  return (
    <AbsoluteFill style={{backgroundColor: '#03060E', color: '#EEE8F5'}}>
      {/* Pistas de Audio */}
      <Audio src={staticFile('music.mp3')} volume={0.15} />
      {/* Carga la voz de ElevenLabs. Si no existe, pon la de edge: voice30s.mp3 */}
      <Audio src={staticFile('voice30s_eleven.mp3')} volume={1} />

      {/* Fondo Cyberpunk Glow */}
      <AbsoluteFill style={{opacity: 0.15, backgroundImage: 'radial-gradient(ellipse at 50% 30%, #D4A84B 0%, transparent 70%)'}} />

      {/* LOGO ARRIBA (ADAPTADO A VERTICAL) */}
      <Sequence from={0} durationInFrames={900}>
        <div style={{position: 'absolute', top: 80, left: 0, width: '100%', display: 'flex', justifyContent: 'center', zIndex: 10}}>
          <div className="logo">
            <div className="logo-mark" style={{
              transform: `scale(${spring({fps, frame, config: {damping: 12}})})`
            }}>A</div>
            <span style={{opacity: interpolate(frame, [10, 20], [0, 1])}}>Antigravity</span>
          </div>
        </div>
      </Sequence>

      {/* ESCENA 1: HERO (0 - 12 segundos = 0 - 360 frames) */}
      <Sequence from={0} durationInFrames={360}>
        <AbsoluteFill style={{justifyContent: 'center', alignItems: 'center', textAlign: 'center', padding: '0 60px'}}>
          <div
            className="badge"
            style={{
              opacity: interpolate(frame, [15, 30], [0, 1]),
              transform: `translateY(${interpolate(frame, [15, 30], [40, 0])}px)`
            }}
          >
            <div className="bdot"></div>
            Intelligence by Design
          </div>

          <h1
            style={{
              fontSize: 100, // Ajustado para vertical
              opacity: interpolate(frame, [30, 50], [0, 1]),
              transform: `translateY(${interpolate(frame, [30, 50], [40, 0])}px)`
            }}
          >
            La Nueva Forma<br />
            <span className="g">de Hacer Videos</span>
          </h1>

          <p
            className="sub"
            style={{
              fontSize: 28,
              opacity: interpolate(frame, [50, 70], [0, 1]),
              transform: `translateY(${interpolate(frame, [50, 70], [40, 0])}px)`
            }}
          >
            Todo es 100% automatizado a través de Antigravity. Ya no necesitas horas de edición manual.
          </p>
        </AbsoluteFill>
      </Sequence>

      {/* ESCENA 2: MÉTRICAS ANIMADAS (12 - 20 segundos = 360 - 600 frames) */}
      <Sequence from={360} durationInFrames={240}>
        <AbsoluteFill style={{justifyContent: 'center', alignItems: 'center', padding: '0 60px', top: -50}}>
          <div style={{opacity: interpolate(frame - 360, [0, 15], [0, 1]), textAlign: 'center'}}>
            <div className="slabel" style={{justifyContent: 'center', marginBottom: 30}}>Métricas en Tiempo Real</div>
            <div className="stitle" style={{fontSize: 60}}>Precisión Absoluta</div>
          </div>

          <div style={{display: 'flex', flexDirection: 'column', gap: 40, width: '100%', marginTop: 40}}>
            {/* Uptime */}
            <div style={{background: '#070D1B', padding: '40px', border: '1px solid #1A2A45', borderRadius: 20, textAlign: 'center', opacity: interpolate(frame - 360, [0, 15], [0, 1]), transform: `translateY(${interpolate(frame - 360, [0, 15], [30, 0])}px)`}}>
              <div style={{fontSize: 70, fontWeight: 800, color: '#F0C76A'}}>{uptime.toFixed(1)}%</div>
              <div className="fnum">UPTIME RELIABILITY</div>
            </div>
            
            {/* Latency */}
            <div style={{background: '#070D1B', padding: '40px', border: '1px solid #1A2A45', borderRadius: 20, textAlign: 'center', opacity: interpolate(frame - 370, [0, 15], [0, 1]), transform: `translateY(${interpolate(frame - 370, [0, 15], [30, 0])}px)`}}>
              <div style={{fontSize: 70, fontWeight: 800, color: '#2FE8C3'}}>{latency.toFixed(1)}ms</div>
              <div className="fnum">RESPONSE LATENCY</div>
            </div>

            {/* Accuracy */}
            <div style={{background: '#070D1B', padding: '40px', border: '1px solid #1A2A45', borderRadius: 20, textAlign: 'center', opacity: interpolate(frame - 380, [0, 15], [0, 1]), transform: `translateY(${interpolate(frame - 380, [0, 15], [30, 0])}px)`}}>
              <div style={{fontSize: 70, fontWeight: 800, color: '#D4A84B'}}>{accuracy.toFixed(0)}%</div>
              <div className="fnum">DESIGN ACCURACY</div>
            </div>
          </div>
        </AbsoluteFill>
      </Sequence>

      {/* ESCENA 3: CARACTERÍSTICAS VERTICALES Y CTA FINAL (20 - 30 segundos = 600 - 900 frames) */}
      <Sequence from={600} durationInFrames={300}>
        <AbsoluteFill style={{justifyContent: 'center', alignItems: 'center', textAlign: 'center', padding: '0 60px'}}>
          <div
            className="badge"
            style={{
              opacity: interpolate(frame - 600, [0, 15], [0, 1]),
              transform: `scale(${spring({fps, frame: frame - 600, config: {damping: 12}})})`
            }}
          >
            <div className="bdot"></div>
            Motor Creativo Escalar
          </div>

          <h1
            style={{
              fontSize: 100,
              opacity: interpolate(frame - 615, [0, 15], [0, 1]),
              transform: `translateY(${interpolate(frame - 615, [0, 15], [40, 0])}px)`
            }}
          >
            ¿Estás listo?<br />
            <span className="g">Sube de Nivel</span>
          </h1>

          <div style={{marginTop: 60, opacity: interpolate(frame - 630, [0, 15], [0, 1])}}>
            <svg style={{width: 80, height: 80, stroke: '#D4A84B', fill: 'none', strokeWidth: 1.5}} viewBox="0 0 24 24">
              <path strokeDasharray={100} strokeDashoffset={interpolate(frame - 630, [0, 45], [100, 0], {extrapolateRight: 'clamp'})} strokeLinecap="round" strokeLinejoin="round" d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
            </svg>
          </div>
        </AbsoluteFill>
      </Sequence>
    </AbsoluteFill>
  );
};
