'use strict';
const fs=require('node:fs');
const path=require('node:path');
const {execFileSync}=require('node:child_process');
require('dotenv').config({path:path.join(__dirname,'..','.env')});
const {settings,createMetaClient}=require('./lib/meta');
const {publishTargets}=require('./lib/publication');
const {validateScript,buildCaption}=require('./lib/content');
async function main(){
 if (!process.env.INSTAGRAM_ACCOUNT_ID && !process.env.INSTAGRAM_USER_ID) {
  const {getInstagramAccountId}=require('../instagram_publisher');
  const found=await getInstagramAccountId(process.env.META_PAGE_ID,process.env.META_PAGE_ACCESS_TOKEN);
  if(found)process.env.INSTAGRAM_ACCOUNT_ID=found;
 }
 const config=settings(process.env);
 if(process.argv.includes('--check-config')){console.log('Configuración presente para:',config.targets.map(t=>t.platform).join(', '));return;}
 const data=validateScript(JSON.parse(fs.readFileSync(path.join(__dirname,'src/news_data.json'),'utf8')));
 const file=path.join(__dirname,'out/video_final_tct.mp4');
 if(!fs.existsSync(file)||fs.statSync(file).size<1000)throw new Error('Falta un render válido en out/video_final_tct.mp4.');
 const manifest=JSON.parse(fs.readFileSync(path.join(__dirname,'out/render-manifest.json'),'utf8'));
 const hash=file=>require('node:crypto').createHash('sha256').update(fs.readFileSync(file)).digest('hex');
 if(manifest.video_sha256!==hash(file)||manifest.data_sha256!==hash(path.join(__dirname,'src/news_data.json')))throw new Error('El video no corresponde al guion sellado al renderizar.');
 const probe=JSON.parse(execFileSync(process.env.FFPROBE_PATH||'ffprobe',['-v','error','-show_streams','-show_format','-of','json',file],{encoding:'utf8',timeout:30000}));
 const video=probe.streams.find(s=>s.codec_type==='video');
 const audio=probe.streams.find(s=>s.codec_type==='audio');
 if(!video||video.width!==1080||video.height!==1920||video.codec_name!=='h264'||!audio||audio.codec_name!=='aac')throw new Error('El render debe ser 1080×1920, H.264 y AAC.');
 if(Math.abs(Number(probe.format.duration)-data.total_duration_sec)>.25)throw new Error('El render no coincide con la duración del guion.');
 const caption=buildCaption(data);
 const client=createMetaClient({axios:require('axios'),version:config.version});
 const report=await publishTargets({data,targets:config.targets,stateFile:path.join(__dirname,'publication-state.json'),historyFile:path.join(__dirname,'used_video_news.json'),dryRun:process.argv.includes('--dry-run'),publish:async(target,checkpoint)=>{
  if(target.platform==='facebook')return client.publish(target,{file,caption,checkpoint});
  if(target.platform==='instagram'){
   const result=await require('../instagram_publisher').publishReelToInstagram(file,{caption,share_to_feed:true,checkpoint});
   return {id:result.mediaId};
  }
  if(target.platform==='youtube'){
   const result=await require('../youtube_publisher').publishVideoToYouTube(file,{title:(data.scenes[0].text1+' '+data.scenes[0].text2).slice(0,90),description:caption,tags:['TalentoConTarifa','Shorts']});
   if(!result.success)throw new Error('YouTube no confirmó la carga.');
   return {id:result.videoId};
  }
  const voiceFile=path.join(__dirname,'public/news_voice.mp3');
  const voiceVideo=path.join(__dirname,'out/video_tiktok_voiceonly.mp4');
  if(!fs.existsSync(voiceFile))throw new Error('Falta la pista de voz sincronizada para TikTok.');
  execFileSync(process.env.FFMPEG_PATH||'ffmpeg',['-y','-i',file,'-i',voiceFile,'-map','0:v:0','-map','1:a:0','-c:v','copy','-c:a','aac','-b:a','128k','-t',String(data.total_duration_sec),voiceVideo],{stdio:'pipe',timeout:120000});
  const result=await require('../tiktok_publisher').publishVideoToTikTok(voiceVideo,{title:caption.slice(0,180)});
  checkpoint({id:result.publishId});
  if(!result.success||result.status==='PROCESSING')throw new Error('TikTok no ha confirmado la recepción final.');
  return {id:result.publishId,status:result.status==='SEND_TO_USER_INBOX'?'submitted':'published'};
 }});
 fs.writeFileSync(path.join(__dirname,'out/publication-report.json'),JSON.stringify(report,null,2));
 for(const [platform,result] of Object.entries(report.results))console.log(`${platform}: ${result.status}${result.id?` (${result.id})`:''}${result.error?` — ${result.error}`:''}`);
 if(!report.complete&&!process.argv.includes('--dry-run'))process.exitCode=1;
}
if(require.main===module)main().catch(error=>{console.error(error.message);process.exitCode=1;});
module.exports={main};
