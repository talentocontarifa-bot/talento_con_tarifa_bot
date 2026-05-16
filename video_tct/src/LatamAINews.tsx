import {
  AbsoluteFill,
  Audio,
  interpolate,
  Sequence,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
  spring,
  Img
} from 'remotion';
import newsData from './news_data.json';

export const LatamAINews: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // Animaciones
  const scaleTitle = spring({ fps, frame, config: { damping: 12 } });
  
  const slideRobotText = spring({ fps, frame: frame - 200, config: { damping: 15 } });
  const kenBurnsRobot = interpolate(frame, [200, 500], [1, 1.15], { extrapolateRight: 'clamp' });

  const percentNumber = Math.floor(interpolate(frame - 500, [0, 60], [0, 50], { extrapolateRight: 'clamp', extrapolateLeft: 'clamp' }));
  const scalePercent = spring({ fps, frame: frame - 500, config: { damping: 12 } });

  const slideDataText = spring({ fps, frame: frame - 850, config: { damping: 15 } });
  const kenBurnsData = interpolate(frame, [850, 1200], [1, 1.15], { extrapolateRight: 'clamp' });

  const moveCtaY = spring({ fps, frame: frame - 1200, config: { damping: 15 } });

  return (
    <AbsoluteFill style={{ backgroundColor: '#CCFF00', fontFamily: 'sans-serif' }}>
      
      {/* Audio: Voz Recortada + Track Industrial Rave */}
      <Audio src={staticFile('news_voice.mp3')} volume={1.5} />
      <Audio src={staticFile('tct_music.mp3')} volume={0.15} />

      {/* WATERMARK: Logo persistente de Talento con Tarifa en la esquina superior derecha */}
      <div style={{ position: 'absolute', top: '50px', right: '50px', zIndex: 100 }}>
        <Img 
          src={staticFile('tct_logo.svg')} 
          style={{ 
            width: '120px', 
            height: '120px', 
            filter: 'drop-shadow(4px 4px 0px rgba(0,0,0,1))' 
          }} 
        />
      </div>

      {/* Escena 1: Título (Frames 0 - 200) */}
      <Sequence from={0} durationInFrames={200}>
        <AbsoluteFill style={{ justifyContent: 'center', alignItems: 'center' }}>
          <div style={{ backgroundColor: '#000', color: '#FFF', padding: '40px 80px', border: '10px solid #FFF', boxShadow: '15px 15px 0px rgba(0,0,0,1)', transform: `scale(${scaleTitle}) rotate(-2deg)`, textAlign: 'center' }}>
            <h1 style={{ fontSize: '80px', margin: 0, textTransform: 'uppercase' }}>{newsData.title_line1}</h1>
            <h2 style={{ fontSize: '60px', margin: 0, color: '#CCFF00' }}>{newsData.title_line2}</h2>
          </div>
        </AbsoluteFill>
      </Sequence>

      {/* Escena 2: Agentes Autónomos (Frames 200 - 500) */}
      <Sequence from={200} durationInFrames={300}>
        <AbsoluteFill>
          <Img src={staticFile('agent_robot.png')} style={{ width: '100%', height: '100%', objectFit: 'cover', position: 'absolute', transform: `scale(${kenBurnsRobot})` }} />
          <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: '40%', background: 'linear-gradient(transparent, #000)' }} />
          
          <div style={{ position: 'absolute', bottom: '100px', left: '50px', transform: `translateY(${interpolate(slideRobotText, [0, 1], [300, 0])}px)` }}>
            <div style={{ backgroundColor: '#CCFF00', padding: '20px 40px', display: 'inline-block', border: '8px solid #000' }}>
              <h2 style={{ fontSize: '70px', margin: 0, color: '#000', textTransform: 'uppercase' }}>Agentes Autónomos</h2>
            </div>
            <p style={{ fontSize: '45px', color: '#FFF', textShadow: '2px 2px 10px #000', fontWeight: 'bold', marginTop: '20px' }}>
              {newsData.bullet_points}
            </p>
          </div>
        </AbsoluteFill>
      </Sequence>

      {/* Escena 3: MOTION GRAPHIC - El Número Gigante Animado (Frames 500 - 850) */}
      <Sequence from={500} durationInFrames={350}>
        <AbsoluteFill style={{ backgroundColor: '#000', justifyContent: 'center', alignItems: 'center' }}>
          <h2 style={{ fontSize: '60px', color: '#FFF', textTransform: 'uppercase', letterSpacing: '5px' }}>{newsData.percentage_sub}</h2>
          <div style={{ transform: `scale(${scalePercent})` }}>
            <h1 style={{ fontSize: '350px', margin: '-50px 0', color: '#CCFF00', textShadow: '15px 15px 0px #FFF' }}>
              {Math.floor(interpolate(frame - 500, [0, 60], [0, newsData.percentage], { extrapolateRight: 'clamp', extrapolateLeft: 'clamp' }))}%
            </h1>
          </div>
          <p style={{ fontSize: '40px', color: '#FFF', marginTop: '20px' }}>Exigencia de los Inversores (ROI)</p>
        </AbsoluteFill>
      </Sequence>

      {/* Escena 4: Estructura de Datos (Frames 850 - 1200) */}
      <Sequence from={850} durationInFrames={350}>
        <AbsoluteFill>
          <Img src={staticFile('data_structure.png')} style={{ width: '100%', height: '100%', objectFit: 'cover', position: 'absolute', transform: `scale(${kenBurnsData})` }} />
          <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: '50%', background: 'linear-gradient(transparent, #000)' }} />
          
          <div style={{ position: 'absolute', bottom: '100px', left: '50px', transform: `translateX(${interpolate(slideDataText, [0, 1], [-500, 0])}px)` }}>
            <div style={{ backgroundColor: '#FFF', padding: '20px 40px', display: 'inline-block', border: '8px solid #000' }}>
              <h2 style={{ fontSize: '70px', margin: 0, color: '#000', textTransform: 'uppercase' }}>{newsData.data_text}</h2>
            </div>
            <p style={{ fontSize: '50px', color: '#CCFF00', textShadow: '5px 5px 0px #000', fontWeight: 'bold', marginTop: '20px' }}>
              {newsData.data_sub}
            </p>
          </div>
        </AbsoluteFill>
      </Sequence>

      {/* Escena 5: CTA (Frames 1200 - Final) */}
      <Sequence from={1200}>
        <AbsoluteFill style={{ backgroundColor: '#000', color: '#CCFF00', justifyContent: 'center', alignItems: 'center' }}>
          <div style={{ transform: `translateY(${interpolate(moveCtaY, [0, 1], [1000, 0])}px)`, textAlign: 'center' }}>
            {/* Logo grande en el CTA */}
            <Img src={staticFile('tct_logo.svg')} style={{ width: '300px', height: '300px', margin: '0 auto 40px auto' }} />
            
            <h1 style={{ fontSize: '80px', textTransform: 'uppercase', margin: 0 }}>{newsData.cta_text}</h1>
            
            <div style={{ marginTop: '60px', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: '#CCFF00', border: '8px solid #FFF', padding: '20px 40px', boxShadow: '15px 15px 0px rgba(255,255,255,1)' }}>
              <Img src={staticFile('tct_logo.svg')} style={{ width: '80px', height: '80px', marginRight: '30px' }} />
              <div style={{ color: '#000', fontSize: '50px', fontWeight: 'bold' }}>
                TALENTOCONTARIFA.LAT
              </div>
            </div>
          </div>
        </AbsoluteFill>
      </Sequence>

    </AbsoluteFill>
  );
};
