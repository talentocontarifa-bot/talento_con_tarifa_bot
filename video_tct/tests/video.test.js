'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {createTimeline,validateScript,buildCaption,escapeHtml}=require('../lib/content');
const {publishTargets,readJson}=require('../lib/publication');
const {settings,createMetaClient}=require('../lib/meta');
const demo=require('./fixtures/demo.json');
const targets=[{platform:'facebook',account:'1'},{platform:'instagram',account:'2'}];
function sandbox(t){const dir=fs.mkdtempSync(path.join(os.tmpdir(),'tct-test-'));t.after(()=>fs.rmSync(dir,{recursive:true,force:true}));return {stateFile:path.join(dir,'state.json'),historyFile:path.join(dir,'history.json')};}
const data={...demo,preview_only:false,source_url:'https://example.org/article'};
test('token rotation preserves the delivery identity',()=>{
 const env={PUBLISH_PLATFORMS:'youtube,tiktok',YOUTUBE_CLIENT_ID:'client',YOUTUBE_CLIENT_SECRET:'secret',YOUTUBE_REFRESH_TOKEN:'old',TIKTOK_OPEN_ID:'creator',TIKTOK_ACCESS_TOKEN:'old'};
 assert.deepEqual(settings(env).targets,settings({...env,YOUTUBE_REFRESH_TOKEN:'new',TIKTOK_ACCESS_TOKEN:'new'}).targets);
});
test('TikTok inbox delivery is recorded and never uploaded twice',async t=>{
 const files=sandbox(t);let calls=0;
 const args={...files,data,targets:[{platform:'tiktok',account:'creator'}],publish:async()=>{calls++;return {id:'inbox',status:'submitted'};}};
 assert.equal((await publishTargets(args)).results.tiktok.status,'submitted');
 assert.equal((await publishTargets(args)).results.tiktok.skipped,true);
 assert.equal(calls,1);
});
test('voice windows include exact frame-rounded pauses without accumulated drift',()=>{
 const t=createTimeline(demo.scenes,[2.101,3,4,5,6]);
 assert.equal(t.scenes[1].start,(Math.ceil(2.101*30)+12)/30);
 t.scenes.forEach((s,i)=>{if(i)assert.equal(s.start,t.scenes[i-1].end);assert.ok(s.end-s.start>=s.audio_duration);});
 assert.equal(t.total_duration_sec,t.scenes.at(-1).end);
});
test('invalid audio and excessive duration fail',()=>{assert.throws(()=>createTimeline(demo.scenes,[NaN,3,4,5,6]));assert.throws(()=>createTimeline(demo.scenes,[30,30,30,30,30]));});
test('guion requires insight instead of forced percentage',()=>{assert.doesNotThrow(()=>validateScript(demo));const copy=structuredClone(demo);copy.scenes[2].type='big_percentage';assert.throws(()=>validateScript(copy));});
test('caption uses scene narration, includes source and has no undefined script',()=>{const caption=buildCaption(data);assert.ok(caption.includes(data.source_url));assert.ok(!caption.includes('undefined'));assert.ok(caption.length<=2200);});
test('HTML source is escaped',()=>assert.equal(escapeHtml('<script>"&'), '&lt;script&gt;&quot;&amp;'));
test('preview makes no writes or API calls',async t=>{const files=sandbox(t);await publishTargets({...files,data,targets,dryRun:true,publish:()=>assert.fail('API called')});assert.ok(!fs.existsSync(files.stateFile));});
test('demo is never publishable',async t=>{await assert.rejects(publishTargets({...sandbox(t),data:demo,targets,publish:()=>assert.fail('API called')}),/demo/);});
test('successful publications update history once and reruns skip both',async t=>{const files=sandbox(t);let calls=0;const args={...files,data,targets,publish:async()=>({id:String(++calls)})};assert.ok((await publishTargets(args)).complete);assert.ok((await publishTargets(args)).complete);assert.equal(calls,2);assert.deepEqual(readJson(files.historyFile,[]),[data.source_url]);});
test('partial failure persists successful network and blocks ambiguous retry',async t=>{const files=sandbox(t);let calls=0;const args={...files,data,targets,publish:async target=>{calls++;if(target.platform==='instagram')throw new Error('Timeout');return {id:'fb1'};}};assert.equal((await publishTargets(args)).complete,false);const retry=await publishTargets(args);assert.equal(calls,2);assert.equal(retry.results.facebook.skipped,true);assert.equal(retry.results.instagram.status,'requires_review');assert.ok(!fs.existsSync(files.historyFile));});
test('missing ID is not recorded as published',async t=>{const r=await publishTargets({...sandbox(t),data,targets:[targets[0]],publish:async()=>({})});assert.equal(r.complete,false);});
test('credentials are required for every requested platform',()=>{assert.throws(()=>settings({META_PAGE_ID:'1',META_PAGE_ACCESS_TOKEN:'token'}),/instagram/);assert.equal(settings({PUBLISH_PLATFORMS:'facebook',META_PAGE_ID:'1',META_PAGE_ACCESS_TOKEN:'token'}).targets.length,1);assert.throws(()=>settings({PUBLISH_PLATFORMS:'tiktok'}));});
function mockedClient(replies,calls){return createMetaClient({version:'v21.0',wait:async()=>{},attempts:3,axios:async options=>{calls.push(options);if(options.data?.destroy) { for await (const chunk of options.data) {} }const reply=replies.shift();if(reply instanceof Error)throw reply;return {data:reply};}});}
test('Instagram uploads, waits for FINISHED, then publishes',async t=>{const files=sandbox(t);const file=path.join(path.dirname(files.stateFile),'sample.mp4');fs.writeFileSync(file,'sample');const calls=[];const client=mockedClient([{id:'container',uri:'https://rupload.facebook.com/ig-api-upload/container'},{success:true},{status_code:'IN_PROGRESS'},{status_code:'FINISHED'},{id:'ig-post'}],calls);const result=await client.publish({platform:'instagram',account:'2',token:'secret'},{file,caption:'caption',checkpoint:()=>{}});assert.equal(result.id,'ig-post');assert.ok(calls.at(-1).url.endsWith('/media_publish'));assert.equal(calls.length,5);});
test('Instagram processing error prevents publish',async t=>{const files=sandbox(t);const file=path.join(path.dirname(files.stateFile),'sample.mp4');fs.writeFileSync(file,'sample');const calls=[];const client=mockedClient([{id:'container',uri:'https://rupload.facebook.com/upload'},{success:true},{status_code:'ERROR'}],calls);await assert.rejects(client.publish({platform:'instagram',account:'2',token:'secret'},{file,caption:'caption',checkpoint:()=>{}}),/procesar/);assert.ok(!calls.some(c=>c.url.endsWith('/media_publish')));});
test('upload host validation prevents credentials sent elsewhere',async()=>{const calls=[];const client=mockedClient([{id:'container',uri:'https://example.org/upload'}],calls);await assert.rejects(client.publish({platform:'instagram',account:'2',token:'secret'},{file:'unused',caption:'caption',checkpoint:()=>{}}),/no permitido/);assert.equal(calls.length,1);});
test('Facebook only succeeds after publishing phase completes',async t=>{const files=sandbox(t);const file=path.join(path.dirname(files.stateFile),'sample.mp4');fs.writeFileSync(file,'sample');const calls=[];const client=mockedClient([{video_id:'fb',upload_url:'https://rupload.facebook.com/video-upload/fb'},{success:true},{success:true},{status:{publishing_phase:{status:'in_progress'}}},{status:{publishing_phase:{status:'complete'}}}],calls);assert.equal((await client.publish({platform:'facebook',account:'1',token:'secret'},{file,caption:'caption',checkpoint:()=>{}})).id,'fb');assert.equal(calls.length,5);});
