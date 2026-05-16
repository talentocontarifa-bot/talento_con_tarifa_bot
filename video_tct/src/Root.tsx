import {Composition} from 'remotion';
import {DreamcraftersAI15} from './DreamcraftersAI15';
import {DreamcraftersAI} from './DreamcraftersAI';
import {VeronikaPromo} from './VeronikaPromo';
import {LatamAINews} from './LatamAINews';
import newsData from './news_data.json';

export const RemotionRoot: React.FC = () => {
  // Calculamos la duración exacta sumando todos los frames que dictó Gemini
  const totalFrames = newsData.scenes.reduce((acc: number, scene: any) => acc + scene.durationInFrames, 0);

  return (
    <>
      {/* ⭐ ACTIVO: 15s ElevenLabs + Industrial Rave */}
      <Composition
        id="DreamcraftersAI15"
        component={DreamcraftersAI15}
        durationInFrames={450}
        fps={30}
        width={1080}
        height={1920}
      />

      {/* 30s versión anterior */}
      <Composition
        id="DreamcraftersAI"
        component={DreamcraftersAI}
        durationInFrames={900}
        fps={30}
        width={1080}
        height={1920}
      />

      {/* Composición anterior */}
      <Composition
        id="VeronikaPromo"
        component={VeronikaPromo}
        durationInFrames={900}
        fps={30}
        width={1080}
        height={1920}
      />
      
      {/* Nueva Noticia IA LATAM 2026 - 100% DINÁMICO */}
      <Composition
        id="LatamAINews"
        component={LatamAINews}
        durationInFrames={totalFrames} // La duración la decide Gemini ahora
        fps={30}
        width={1080}
        height={1920}
      />
    </>
  );
};
