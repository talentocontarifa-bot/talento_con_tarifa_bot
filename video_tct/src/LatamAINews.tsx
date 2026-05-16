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
  Img
} from 'remotion';
import newsData from './news_data.json';

const TitleScene: React.FC<{ text1: string, text2: string }> = ({ text1, text2 }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const scale = spring({ fps, frame, config: { damping: 12 } });

  return (
    <AbsoluteFill style={{ justifyContent: 'center', alignItems: 'center' }}>
      <div style={{ backgroundColor: '#000', color: '#FFF', padding: '40px 80px', border: '10px solid #FFF', boxShadow: '15px 15px 0px rgba(0,0,0,1)', transform: `scale(${scale}) rotate(-2deg)`, textAlign: 'center' }}>
        <h1 style={{ fontSize: '80px', margin: 0, textTransform: 'uppercase' }}>{text1}</h1>
        <h2 style={{ fontSize: '60px', margin: 0, color: newsData.theme_color }}>{text2}</h2>
      </div>
    </AbsoluteFill>
  );
};

const ImageTextScene: React.FC<{ text: string, imageFile: string }> = ({ text, imageFile }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const slideText = spring({ fps, frame, config: { damping: 15 } });
  const kenBurns = interpolate(frame, [0, 300], [1, 1.15], { extrapolateRight: 'clamp' });

  return (
    <AbsoluteFill>
      <Img src={staticFile(imageFile)} style={{ width: '100%', height: '100%', objectFit: 'cover', position: 'absolute', transform: `scale(${kenBurns})` }} />
      <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: '50%', background: 'linear-gradient(transparent, #000)' }} />
      
      <div style={{ position: 'absolute', bottom: '100px', left: '50px', transform: `translateY(${interpolate(slideText, [0, 1], [300, 0])}px)` }}>
        <div style={{ backgroundColor: newsData.theme_color, padding: '20px 40px', display: 'inline-block', border: '8px solid #000' }}>
          <h2 style={{ fontSize: '60px', margin: 0, color: '#000', textTransform: 'uppercase' }}>{text}</h2>
        </div>
      </div>
    </AbsoluteFill>
  );
};

const PercentageScene: React.FC<{ number: number, text: string }> = ({ number, text }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const scalePercent = spring({ fps, frame, config: { damping: 12 } });
  const animatedNumber = Math.floor(interpolate(frame, [0, 60], [0, number], { extrapolateRight: 'clamp', extrapolateLeft: 'clamp' }));

  return (
    <AbsoluteFill style={{ backgroundColor: '#000', justifyContent: 'center', alignItems: 'center' }}>
      <h2 style={{ fontSize: '60px', color: '#FFF', textTransform: 'uppercase', letterSpacing: '5px' }}>{text}</h2>
      <div style={{ transform: `scale(${scalePercent})` }}>
        <h1 style={{ fontSize: '350px', margin: '-50px 0', color: newsData.theme_color, textShadow: '15px 15px 0px #FFF' }}>
          {animatedNumber}%
        </h1>
      </div>
    </AbsoluteFill>
  );
};

const CtaScene: React.FC<{ text: string }> = ({ text }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const moveCtaY = spring({ fps, frame, config: { damping: 15 } });

  return (
    <AbsoluteFill style={{ backgroundColor: '#000', color: newsData.theme_color, justifyContent: 'center', alignItems: 'center' }}>
      <div style={{ transform: `translateY(${interpolate(moveCtaY, [0, 1], [1000, 0])}px)`, textAlign: 'center' }}>
        <Img src={staticFile('tct_logo.svg')} style={{ width: '300px', height: '300px', margin: '0 auto 40px auto' }} />
        <h1 style={{ fontSize: '80px', textTransform: 'uppercase', margin: 0 }}>{text}</h1>
        <div style={{ marginTop: '60px', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: newsData.theme_color, border: '8px solid #FFF', padding: '20px 40px', boxShadow: '15px 15px 0px rgba(255,255,255,1)' }}>
          <Img src={staticFile('tct_logo.svg')} style={{ width: '80px', height: '80px', marginRight: '30px' }} />
          <div style={{ color: '#000', fontSize: '50px', fontWeight: 'bold' }}>
            TALENTOCONTARIFA.LAT
          </div>
        </div>
      </div>
    </AbsoluteFill>
  );
};

export const LatamAINews: React.FC = () => {
  let accumulatedFrames = 0;

  return (
    <AbsoluteFill style={{ backgroundColor: newsData.theme_color, fontFamily: 'sans-serif' }}>
      
      {/* Audio: Voz Recortada + Track Industrial Rave */}
      <Audio src={staticFile('news_voice.mp3')} volume={1.5} />
      <Audio src={staticFile('tct_music.mp3')} volume={0.15} />

      {/* WATERMARK */}
      <div style={{ position: 'absolute', top: '50px', right: '50px', zIndex: 100 }}>
        <Img 
          src={staticFile('tct_logo.svg')} 
          style={{ width: '120px', height: '120px', filter: 'drop-shadow(4px 4px 0px rgba(0,0,0,1))' }} 
        />
      </div>

      {newsData.scenes.map((scene: any, i: number) => {
        const from = accumulatedFrames;
        accumulatedFrames += scene.durationInFrames;
        
        return (
          <Sequence key={i} from={from} durationInFrames={scene.durationInFrames}>
            {scene.type === 'title' && <TitleScene text1={scene.text1} text2={scene.text2} />}
            {scene.type === 'image_text' && <ImageTextScene text={scene.text} imageFile={`scene_${i}.png`} />}
            {scene.type === 'big_percentage' && <PercentageScene number={scene.number} text={scene.text} />}
            {scene.type === 'cta' && <CtaScene text={scene.text} />}
          </Sequence>
        );
      })}

    </AbsoluteFill>
  );
};
