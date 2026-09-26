'use strict';
// Fixed brand signature recovered from the original generator.
const CONTACT_ENDING={
 type:'cta',headline:'¿LISTO PARA DOMINAR?',sub:'Tu talento amplificado con agentes de IA.',btn:'TALENTOCONTARIFA.LAT',
 voice_text:'Este video fue creado y publicado de manera completamente automática por inteligencia artificial. Imagina el impacto que este superpoder podría tener en tu negocio. Conéctate con nosotros en Talento con Tarifa punto lat.'
};
function restoreContactEnding(data){
 if(!Array.isArray(data?.scenes)||data.scenes.length!==5)throw new Error('El cierre requiere cinco escenas.');
 return {...data,scenes:data.scenes.map((s,i)=>i===4?{...s,...CONTACT_ENDING}:s)};
}
module.exports={CONTACT_ENDING,restoreContactEnding};
