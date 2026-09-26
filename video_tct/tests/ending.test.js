const {test}=require('node:test');
const assert=require('node:assert/strict');
const {restoreContactEnding,CONTACT_ENDING}=require('../lib/ending');
const {validateScript}=require('../lib/content');
const demo=require('./fixtures/demo.json');
test('every generated script restores the contact ending and original spoken signature',()=>{
 const result=restoreContactEnding(structuredClone(demo));
 assert.equal(result.scenes[4].btn,'TALENTOCONTARIFA.LAT');
 assert.match(result.scenes[4].voice_text,/Conéctate con nosotros/);
 assert.match(result.scenes[4].voice_text,/creado y publicado/);
 assert.deepEqual(result.scenes.slice(0,4),demo.scenes.slice(0,4));
 assert.doesNotThrow(()=>validateScript(result));
 assert.equal(result.scenes[4].voice_text,CONTACT_ENDING.voice_text);
});
