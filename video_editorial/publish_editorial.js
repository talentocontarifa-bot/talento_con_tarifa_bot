'use strict';
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const {execFileSync}=require('node:child_process');
require('dotenv').config({path:path.join(__dirname,'../.env')});
const {settings,createMetaClient}=require('../video_tct/lib/meta');
const {publishTargets}=require('../video_tct/lib/publication');
function buildMetadata(data){
 if(!data?.title||!Array.isArray(data.timeline)||!data.timeline.length)throw new Error('Faltan los metadatos editoriales.');
 const fullSpeech=data.timeline.map(scene=>scene.voice_text).join(' ');
 return {title:data.title,shortTitle:data.title.slice(0,90),caption:`${data.title}\n\n${fullSpeech.slice(0,1600)}\n\nTalento con Tarifa · Ideas y contexto.\n#TalentoConTarifa #Reflexion #Reels`};
}
async function publishAll(){
 const {publishReelToInstagram,getInstagramAccountId}=require('../instagram_publisher');
 if(!process.env.INSTAGRAM_ACCOUNT_ID){const id=await getInstagramAccountId(process.env.META_PAGE_ID,process.env.META_PAGE_ACCESS_TOKEN);if(id)process.env.INSTAGRAM_ACCOUNT_ID=id;}
 const config=settings(process.env);
 if(process.argv.includes('--check-config')){console.log('Redes configuradas:',config.targets.map(t=>t.platform).join(', '));return;}
 const data=JSON.parse(fs.readFileSync(path.join(__dirname,'editorial_data.json'),'utf8'));
 if(data.preview_only)throw new Error('La muestra editorial no se puede publicar. Genera primero el video.');
 const metadata=buildMetadata(data);
 const file=path.join(__dirname,'out/video_editorial.mp4');
 const manifest=JSON.parse(fs.readFileSync(path.join(__dirname,'out/render-manifest.json'),'utf8'));
 const hash=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
 if(manifest.video_sha256!==hash(file)||manifest.data_sha256!==hash(path.join(__dirname,'editorial_data.json')))throw new Error('El render editorial no corresponde al guion sellado.');
 const issueFile=path.join(__dirname,'current_issue.txt');
 const issue=fs.existsSync(issueFile)?fs.readFileSync(issueFile,'utf8').trim():null;
 if(issue&&!/^\d+$/.test(issue))throw new Error('Número de issue inválido.');
 const source=issue?`https://github.com/talentocontarifa-bot/talento_con_tarifa_bot/issues/${issue}`:`editorial:${crypto.createHash('sha256').update(data.title+data.timeline.map(s=>s.voice_text).join(' ')).digest('hex')}`;
 const client=createMetaClient({axios:require('axios'),version:config.version});
 const dryRun=process.argv.includes('--dry-run');
 const report=await publishTargets({data:{source_url:source},targets:config.targets,stateFile:path.join(__dirname,'publication-state.json'),historyFile:path.join(__dirname,'published-editorials.json'),dryRun,publish:async(target,checkpoint)=>{
  if(target.platform==='facebook')return client.publish(target,{file,caption:metadata.caption,checkpoint});
  if(target.platform==='instagram'){const r=await publishReelToInstagram(file,{caption:metadata.caption,share_to_feed:true,checkpoint});return {id:r.mediaId};}
  if(target.platform==='youtube'){const r=await require('../youtube_publisher').publishVideoToYouTube(file,{title:metadata.shortTitle,description:metadata.caption,tags:['TalentoConTarifa','Ensayo','Shorts']});if(!r.success)throw new Error('YouTube no confirmó la carga.');return {id:r.videoId};}
  const voice=path.join(__dirname,'public/editorial_voice.mp3');
  const clean=path.join(__dirname,'out/editorial_tiktok_voiceonly.mp4');
  execFileSync('ffmpeg',['-y','-i',file,'-i',voice,'-map','0:v:0','-map','1:a:0','-c:v','copy','-c:a','aac','-t',String(data.duration),clean],{stdio:'pipe',timeout:120000});
  const r=await require('../tiktok_publisher').publishVideoToTikTok(clean,{title:metadata.shortTitle});checkpoint({id:r.publishId});
  if(!r.success||r.status==='PROCESSING')throw new Error('TikTok sigue pendiente de confirmación.');
  return {id:r.publishId,status:r.status==='SEND_TO_USER_INBOX'?'submitted':'published'};
 }});
 fs.writeFileSync(path.join(__dirname,'out/publication-report.json'),JSON.stringify(report,null,2));
 console.log(JSON.stringify(report,null,2));
 if(!dryRun&&issue&&report.complete&&Object.values(report.results).every(r=>r.status==='published')){
  const bodyFile=path.join(__dirname,'out/issue-result.md');
  fs.writeFileSync(bodyFile,`Video editorial: ${metadata.title}\n\n`+Object.entries(report.results).map(([p,r])=>`- ${p}: confirmado (${r.id})`).join('\n'));
  execFileSync('gh',['issue','comment',issue,'--body-file',bodyFile],{stdio:'inherit',timeout:30000});
  execFileSync('gh',['issue','close',issue],{stdio:'inherit',timeout:30000});
 }
 if(!report.complete&&!dryRun)process.exitCode=1;
 return report;
}
if(require.main===module)publishAll().catch(error=>{console.error(error.message);process.exitCode=1;});
module.exports={buildMetadata,publishAll};
