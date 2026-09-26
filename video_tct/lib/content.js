'use strict';
const FPS = 30;
function validateScript(data) {
  if (!data || !Array.isArray(data.scenes) || data.scenes.length !== 5) throw new Error('El guion debe contener 5 escenas.');
  const types = ['title', 'image_text', 'insight', 'image_text', 'cta'];
  const fields = [['text1','text2'], ['title'], ['title','body'], ['title'], ['headline','sub','btn']];
  data.scenes.forEach((s,i) => {
    if(s.type !== types[i]) throw new Error(`Tipo incorrecto en escena ${i+1}.`);
    for(const key of ['voice_text', ...fields[i]]) if(typeof s[key] !== 'string' || !s[key].trim()) throw new Error(`Falta ${key} en escena ${i+1}.`);
    if(s.voice_text.length > (s.type==='cta'?300:200)) throw new Error('Locución demasiado larga.');
    for(const key of fields[i]) if(s[key].length > (key === 'body' || key === 'sub' ? 120 : 55)) throw new Error(`Texto demasiado largo: ${key}.`);
    if(s.key_points && (!Array.isArray(s.key_points) || s.key_points.length > 3 || s.key_points.some(p=>typeof p!=='string'||p.length>36))) throw new Error('Puntos clave inválidos.');
  });
  return data;
}
function createTimeline(scenes, durations) {
  let frame = 0;
  if(durations.length !== scenes.length) throw new Error('Falta audio de una escena.');
  const result = scenes.map((scene,i) => {
    if(!Number.isFinite(durations[i]) || durations[i]<=0) throw new Error('Duración de audio inválida.');
    const audioFrames = Math.ceil(durations[i]*FPS);
    const frames = audioFrames + (i === scenes.length-1 ? 30 : 6);
    const start = frame / FPS;
    frame += frames;
    return {...scene, start, end:frame/FPS, audio_duration:durations[i], durationInFrames:frames, audio:`public/voice_scene_${i+1}.mp3`};
  });
  if(frame/FPS > 90) throw new Error('El Reel supera el límite editorial de 90 segundos.');
  return {scenes:result,total_frames:frame,total_duration_sec:frame/FPS};
}
function buildCaption(data) {
  const hook = data.scenes[0].text1 + ' ' + data.scenes[0].text2;
  const script = data.scenes.map(s=>s.voice_text).join(' ');
  const source = data.source_url ? `\n\nFuente: ${data.source_url}` : '';
  const footer = '\n\nTalento con Tarifa · IA y negocios con criterio.\n#TalentoConTarifa #InteligenciaArtificial #Automatizacion';
  const available = 2200 - hook.length - source.length - footer.length - 2;
  return `${hook}\n\n${script.slice(0,available)}${source}${footer}`;
}
function escapeHtml(value) { return String(value).replace(/[&<>"']/g, c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
module.exports = {FPS,validateScript,createTimeline,buildCaption,escapeHtml};
