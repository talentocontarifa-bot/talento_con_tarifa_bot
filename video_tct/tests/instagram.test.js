const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
const path=require('node:path');
function instagramHarness(statuses){
 const calls=[];
 const axios={
  get:async(url,opts)=>{calls.push({method:'get',url,opts});return {data:statuses.shift()};},
  post:async(url,body,opts)=>{calls.push({method:'post',url,body,opts});if(url.endsWith('/media'))return {data:{id:'container',uri:'https://rupload.facebook.com/ig-api-upload/container'}};if(url.endsWith('/media_publish'))return {data:{id:'media'}};return {data:{success:true}};}
 };
 const module={exports:{}};
 const context={module,exports:module.exports,__dirname:path.resolve(__dirname,'../..'),process:{env:{META_PAGE_ACCESS_TOKEN:'test-token',INSTAGRAM_ACCOUNT_ID:'123'}},console:{log(){},warn(){},error(){}},URL,URLSearchParams,Buffer,setTimeout:callback=>{callback();return 0;},require:name=>{
  if(name==='axios')return axios;
  if(name==='dotenv')return {config(){}};
  if(name==='fs')return {existsSync:()=>true,statSync:()=>({size:6}),readFileSync:()=>Buffer.from('sample')};
  return require(name);
 }};
 vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../../instagram_publisher.js'),'utf8'),context);
 return {calls,publish:module.exports.publishReelToInstagram};
}
test('upstream Instagram fixes preserved: form body, binary buffer, Offset and polling',async()=>{
 const h=instagramHarness([{status_code:'IN_PROGRESS'},{status_code:'FINISHED'}]);const checkpoints=[];
 const result=await h.publish('sample.mp4',{caption:'Una idea',checkpoint:state=>checkpoints.push(state)});
 assert.equal(result.mediaId,'media');
 assert.ok(h.calls[0].body instanceof URLSearchParams);
 assert.ok(Buffer.isBuffer(h.calls[1].body));
 assert.equal(h.calls[1].opts.headers.Offset,'0');
 assert.equal(h.calls[1].opts.maxRedirects,0);
 assert.equal(checkpoints[0].container_id,'container');
 assert.ok(h.calls.at(-1).url.endsWith('/media_publish'));
});
test('real Instagram publisher never publishes an ERROR container',async()=>{
 const h=instagramHarness([{status_code:'ERROR'}]);
 await assert.rejects(h.publish('sample.mp4'),/Instagram reportó/);
 assert.ok(!h.calls.some(c=>c.url.endsWith('/media_publish')));
});
test('real Instagram publisher never publishes an EXPIRED container',async()=>{
 const h=instagramHarness([{status_code:'EXPIRED'}]);
 await assert.rejects(h.publish('sample.mp4'),/expirado/);
 assert.ok(!h.calls.some(c=>c.url.endsWith('/media_publish')));
});
