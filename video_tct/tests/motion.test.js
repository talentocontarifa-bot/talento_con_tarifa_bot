const {test}=require('node:test');
const assert=require('node:assert/strict');
const {scene,selectRole}=require('../../video_shared/motion');
test('motion template handles arbitrary text safely without external imagery',()=>{
 const input={index:2,id:'test-scene',duration:9,headline:'Economía <script> & ciencia'};
 const result=scene(input);
 assert.match(result.headline,/&lt;script&gt;/);
 assert.doesNotMatch(result.art,/<img|https?:/);
 assert.match(result.motion,/paused:true/);
 assert.deepEqual(result,scene(input));
});
test('content selects the motif independently of scene position',()=>{
 const copies=[{headline:'Nueva herramienta'},{headline:'Tres criterios',key_points:['A','B']},{headline:'Contexto'},{headline:'Prueba y ajusta'},{headline:'Guarda esta idea',type:'cta'}];
 const outputs=copies.map(copy=>scene({...copy,index:0,id:'s',duration:6}).art);
 assert.equal(new Set(outputs).size,5);
 assert.equal(scene({...copies[3],index:4,id:'s-4',duration:8}).art,outputs[3]);
 assert.equal(selectRole({headline:'Más datos no bastan'}),'contrast');
 assert.equal(selectRole({headline:'Idea neutra'}),'statement');
});
