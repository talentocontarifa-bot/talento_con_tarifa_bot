'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { validateScript, escapeHtml: esc } = require('../lib/content');
const {scene:motionScene}=require('../../video_shared/motion');
const root = path.join(__dirname, '..');
function compose(data) {
 validateScript(data);
 require('node:child_process').execFileSync(process.env.PYTHON_PATH||'python',[path.join(root,'../video_shared/synthesize_sfx.py'),path.join(root,'public/sfx_code')],{timeout:30000});
 if(!Number.isFinite(data.total_duration_sec)||data.total_duration_sec<=0)throw new Error('Timeline inválida');
 let previous=0;
 for(const scene of data.scenes){
  if(!Number.isFinite(scene.start)||!Number.isFinite(scene.end)||scene.start!==previous||scene.end<=scene.start)throw new Error('Escenas no contiguas');
  previous=scene.end;
 }
 if(Math.abs(previous-data.total_duration_sec)>.001)throw new Error('Duración final inconsistente');
 const mediaPath = value => {
  if(!/^public\/[a-zA-Z0-9_./-]+$/.test(value)||value.includes('..')) throw new Error('Ruta de recurso inválida');
  if(!fs.existsSync(path.join(root,value))) throw new Error(`Falta recurso: ${value}`);
  return value;
 };
 const duration=data.total_duration_sec;
 const labels=['LA PREGUNTA','EL CONTEXTO','LO QUE IMPORTA','TU SIGUIENTE PASO','EL MOMENTO ES AHORA'];
 fs.mkdirSync(path.join(root,'compositions'),{recursive:true});
 const scenes=data.scenes.map((s,i)=>{
  const headline = s.type==='title' ? `${s.text1} ${s.text2}` : s.type==='cta' ? s.headline : s.title;
  const graphic=data.visual_mode==='graphics'||!s.image||s.type==='insight'||s.type==='cta';
  const design=motionScene({index:i,id:`scene-${i}`,duration:s.end-s.start,headline,body:s.body||s.sub,key_points:s.key_points,type:s.type});
  const img = !graphic && s.image ? mediaPath(s.image) : null;
  const visual = s.type==='cta' ? '<div class="ending-mark"><img src="public/tct_logo.svg" alt="Talento con Tarifa"><span>HECHO CON IA · CONECTA CON NOSOTROS</span></div>' : graphic ? design.art : `<div class="picture"><img id="photo-${i}" data-layout-allow-overflow src="${esc(img)}" alt="" /></div>`;
  const body = s.body || s.sub || '';
  const bullets = (s.key_points||[]).map((p,k)=>`<li><span>0${k+1}</span>${esc(p)}</li>`).join('');
  const markup = `<section id="scene-${i}" data-composition-id="scene-${i}" data-duration="${s.end-s.start}" data-width="1080" data-height="1920" class="scene scene-${s.type} motion-scene ${design.palette} role-${design.role} ${headline.length>55?'long-title':''}"><div class="scene-inner" id="inner-${i}">${visual}<div class="top-shade"></div><div class="bottom-shade"></div><div class="editorial"><p class="eyebrow">${labels[i]} <span>0${i+1} / 05</span></p><h1>${design.headline}</h1>${body?`<p class="body-copy">${esc(body)}</p>`:''}${bullets?`<ul>${bullets}</ul>`:''}${s.type==='cta'?`<div class="action">${esc(s.btn)} <span>↗</span></div>`:''}</div><div class="image-note" style="${graphic?'display:none':''}">${s.image_kind==='article'?'IMAGEN DE LA FUENTE':'IMAGEN ILUSTRATIVA'}</div>${design.decoration}</div></section>`;
  const motion = design.motion;
  fs.writeFileSync(path.join(root,`compositions/scene-${i}.html`),`<!doctype html><html><body><template><style>#scene-${i}{position:absolute;inset:0;width:100%;height:100%;}</style>${markup}<script>${motion}</script></template></body></html>`);
  return `<div id="host-${i}" class="clip" data-composition-id="scene-${i}" data-composition-src="compositions/scene-${i}.html" data-start="${s.start}" data-duration="${s.end-s.start}" data-width="1080" data-height="1920" data-track-index="0"></div>`;
 }).join('\n');
 const captions=data.scenes.map((s,i)=>`<p id="caption-${i}" class="clip caption" data-start="${s.start}" data-duration="${s.audio_duration}" data-track-index="2">${esc(s.type==='cta'?'Conéctate con nosotros en talentocontarifa.lat':s.voice_text)}</p>`).join('\n');
 const audio=data.scenes.filter(s=>s.audio).map((s,i)=>`<audio id="voice-${i}" class="clip" src="${esc(mediaPath(s.audio))}" data-start="${s.start}" data-duration="${s.audio_duration}" data-track-index="3" data-volume="1"></audio>`).join('\n');
 const music = data.preview_only ? '' : `<audio id="music" class="clip" src="public/music_shiny_tech.mp3" data-start="0" data-duration="${duration}" data-track-index="4" data-volume="0.12" data-automation="${esc(JSON.stringify({version:1,lanes:[{target:'volume',points:[{t:0,v:0},{t:1,v:.12},{t:duration-1,v:.12},{t:duration,v:0}]}]}))}"></audio>`;
 const effects=data.scenes.flatMap((s,i)=>{
  const kind=i%2?'swish':'hit';
  const clips=[`<audio id="sfx-${i}" class="clip" src="public/sfx_code/${kind}.wav" data-start="${s.start}" data-duration="${kind==='hit'?.24:.32}" data-volume="0.25" data-track-index="5"></audio>`];
  for(let k=0;k<Math.min(3,(s.key_points||[]).length);k++)clips.push(`<audio id="tick-${i}-${k}" class="clip" src="public/sfx_code/tick.wav" data-start="${s.start+.65+k*.18}" data-duration="0.09" data-volume="0.14" data-track-index="6"></audio>`);
  return clips;
 }).join('');
 const css=fs.readFileSync(path.join(root,'cinematic.css'),'utf8')+fs.readFileSync(path.join(root,'../video_shared/motion.css'),'utf8')+fs.readFileSync(path.join(root,'cctv.css'),'utf8');
 const html=`<!doctype html><html lang="es"><head><meta charset="utf-8"><title>TCT · Cinematic Reel</title><script src="public/vendor/gsap.min.js"></script><style>${css}</style></head><body><div id="root" data-composition-id="main" data-width="1080" data-height="1920" data-fps="30" data-duration="${duration}">${scenes}<header class="brand"><img src="public/tct_logo.svg" alt=""><span>TALENTO<br>CON TARIFA</span><span class="edition">${data.preview_only?'VISTA PREVIA':'IA / NEGOCIOS'}</span></header>${captions}<div class="progress"><div id="progress-fill"></div></div>${audio}${music}${effects}<div class="cctv-corners"></div><div class="cctv-corners cctv-corner-end"></div><div class="cctv-grain"></div><div class="cctv-screen"></div><div class="cctv-hud"><span><i class="rec-dot"></i>REC // CAM 01</span><span id="cctv-time">00:00:00</span></div></div><script>const tl=gsap.timeline({paused:true});\ntl.fromTo('#progress-fill',{scaleX:0},{scaleX:1,duration:${duration},ease:'none'},0);tl.fromTo('.rec-dot',{opacity:1},{opacity:.25,duration:.5,repeat:Math.max(0,Math.floor(${duration}*2)-1),yoyo:true,ease:'steps(1)'},0);for(let n=0;n<=Math.floor(${duration});n++)tl.set('#cctv-time',{textContent:'00:'+String(Math.floor(n/60)).padStart(2,'0')+':'+String(n%60).padStart(2,'0')},n);window.__timelines=window.__timelines||{};window.__timelines.main=tl;</script></body></html>`;
 fs.writeFileSync(path.join(root,'index.html'),html);
 fs.writeFileSync(path.join(root,'news_data.js'),`window.NEWS_DATA = ${JSON.stringify(data).replaceAll('<','\\u003c')};\n`);
 fs.writeFileSync(path.join(root,'hyperframes.json'),JSON.stringify({compositions:[{id:'main',source:'index.html',width:1080,height:1920,duration,fps:30}]},null,2));
 return html;
}
if(require.main===module)compose(JSON.parse(fs.readFileSync(path.join(root,'src/news_data.json'),'utf8')));
module.exports={compose};
