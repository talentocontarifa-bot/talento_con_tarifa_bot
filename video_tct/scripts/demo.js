const fs=require('node:fs');
const path=require('node:path');
const {createTimeline}=require('../lib/content');
const {compose}=require('./compose');
const scenes=[
 {type:'title',text1:'La IA no es',text2:'tu estrategia.',voice_text:'Antes de sumar otra herramienta de inteligencia artificial, define qué problema quieres resolver.'},
 {type:'image_text',title:'Empieza por una tarea.',key_points:['Repetitiva','Medible','Con revisión humana'],voice_text:'Elige una tarea repetitiva que puedas medir y revisar. Ese puede ser un buen punto de partida.'},
 {type:'insight',title:'Automatiza con criterio.',body:'Una herramienta tiene sentido cuando resuelve un problema concreto.',voice_text:'La pregunta no es cuánta inteligencia artificial usas, sino para qué la estás usando.'},
 {type:'image_text',title:'Prueba. Mide. Ajusta.',voice_text:'Prueba con un proceso pequeño, revisa la calidad y decide si vale la pena ampliarlo.'},
 {type:'cta',headline:'Tu siguiente paso empieza aquí.',sub:'¿Qué tarea te gustaría dejar de repetir?',btn:'GUARDA ESTA IDEA',voice_text:'Guarda esta idea y cuéntanos qué tarea te gustaría automatizar primero en tu negocio.'}
].map((s,i)=>i===4?require('../lib/ending').CONTACT_ENDING:s).map(s=>({...s,image:null,image_kind:'graphics'}));
const data={visual_mode:'graphics',schema_version:2,preview_only:true,source_url:null,layout_type:'cinematic',...createTimeline(scenes,[6,7,6,7,16])};
data.scenes.forEach(scene => delete scene.audio);
fs.writeFileSync(path.join(__dirname,'../src/news_data.json'),JSON.stringify(data,null,2));
compose(data);
console.log('Demo visual creada. Sin narración: no es un video publicable.');
