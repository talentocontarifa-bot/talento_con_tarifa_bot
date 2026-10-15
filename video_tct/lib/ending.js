'use strict';
// Fixed brand signature recovered from the original generator.
const CONTACT_ENDING={
 type:'cta',headline:'¿LISTO PARA DOMINAR?',sub:'El superpoder de la IA para tu local o negocio.',btn:'TALENTOCONTARIFA.LAT',
 subtitle:'Visita talentocontarifa.lat y escala tu negocio.',
 voice_text:'Este contenido fue creado y publicado de manera automática con inteligencia artificial. Imagina lo que este superpoder puede hacer por tu local, negocio o emprendimiento. Conéctate con nosotros en talentocontarifa punto lat.'
};
function restoreContactEnding(data){
 if(!Array.isArray(data?.scenes)||data.scenes.length!==5)throw new Error('El cierre requiere cinco escenas.');
 return {...data,scenes:data.scenes.map((s,i)=>i===4?{...s,...CONTACT_ENDING}:s)};
}
module.exports={CONTACT_ENDING,restoreContactEnding};

