'use strict';
const fs=require('node:fs');
function settings(env){
 const defaults=['facebook','instagram'];
 if(env.TIKTOK_ACCESS_TOKEN||env.TIKTOK_REFRESH_TOKEN)defaults.push('tiktok');
 if(env.YOUTUBE_REFRESH_TOKEN)defaults.push('youtube');
 const platforms=(env.PUBLISH_PLATFORMS||defaults.join(',')).split(',').map(s=>s.trim()).filter(Boolean);
 if(!platforms.length||platforms.some(p=>!['facebook','instagram','youtube','tiktok'].includes(p))||new Set(platforms).size!==platforms.length)throw new Error('PUBLISH_PLATFORMS contiene redes inválidas o repetidas.');
 const version=env.META_GRAPH_VERSION||'v21.0';
 if(!/^v\d+\.0$/.test(version))throw new Error('META_GRAPH_VERSION inválida.');
 const token=(env.META_PAGE_ACCESS_TOKEN||env.META_USER_ACCESS_TOKEN)?.trim();
 const targets=platforms.map(platform=>{
  if(platform==='facebook'||platform==='instagram'){
   const account=(platform==='facebook'?env.META_PAGE_ID:(env.INSTAGRAM_ACCOUNT_ID||env.INSTAGRAM_USER_ID))?.trim();
   if(!/^\d+$/.test(account||'')||!token)throw new Error(`Faltan ID o token para ${platform}.`);
   return {platform,account,token};
  }
  const secret=(platform==='youtube'?env.YOUTUBE_REFRESH_TOKEN:(env.TIKTOK_REFRESH_TOKEN||env.TIKTOK_ACCESS_TOKEN))?.trim();
  if(!secret||(platform==='youtube'&&(!env.YOUTUBE_CLIENT_ID||!env.YOUTUBE_CLIENT_SECRET)))throw new Error(`Faltan credenciales para ${platform}.`);
  const identity=(platform==='youtube'?(env.YOUTUBE_CHANNEL_ID||env.YOUTUBE_CLIENT_ID):(env.TIKTOK_OPEN_ID||env.TIKTOK_CLIENT_KEY))?.trim();
  if(!identity)throw new Error(`Falta una identidad estable para ${platform}: configura TIKTOK_OPEN_ID o TIKTOK_CLIENT_KEY.`);
  return {platform,account:require('node:crypto').createHash('sha256').update(identity).digest('hex').slice(0,16)};
 });
 return {version,targets};
}
function createMetaClient({axios,version,wait=ms=>new Promise(r=>setTimeout(r,ms)),attempts=60}){
 const graph=`https://graph.facebook.com/${version}`;
 async function request(method,url,token,data,params){
  try{
   const result=await axios({method,url,data,params,headers:{Authorization:`Bearer ${token}`},timeout:60000});
   if(result.data?.error)throw new Error('Respuesta de Meta con error.');
   return result.data;
  }catch(error){
   const code=error.response?.data?.error?.code;
   throw new Error(code?`Meta rechazó la operación (código ${code}).`:'No se pudo confirmar la operación de Meta. Revisa el estado antes de reintentar.');
  }
 }
 async function upload(url,token,file){
  const parsed=new URL(url);
  if(parsed.protocol!=='https:'||parsed.hostname!=='rupload.facebook.com'||parsed.username||parsed.password)throw new Error('Meta devolvió un destino de carga no permitido.');
  const size=fs.statSync(file).size;
  try{
   const result=await axios({method:'POST',url,data:fs.createReadStream(file),headers:{Authorization:`OAuth ${token}`,offset:'0',file_size:String(size),'Content-Type':'application/octet-stream','Content-Length':String(size)},timeout:300000,maxBodyLength:Infinity,maxRedirects:0});
   if(result.data?.error || result.data?.success===false)throw new Error('Carga rechazada');
  }catch{throw new Error('No se pudo confirmar la carga del archivo.');}
 }
 async function poll(target,id,platform){
  for(let i=0;i<attempts;i++){
   const data=await request('GET',`${graph}/${id}`,target.token,undefined,{fields:platform==='instagram'?'status_code,status':'status'});
   if(platform==='instagram'){
    if(data.status_code==='FINISHED')return;
    if(['ERROR','EXPIRED'].includes(data.status_code))throw new Error('Instagram no pudo procesar el video.');
   }else{
    if(data.status?.publishing_phase?.status==='complete')return;
    if(data.status?.video_status==='error'||Object.values(data.status||{}).some(v=>v?.status==='error'))throw new Error('Facebook no pudo procesar el video.');
   }
   if(i<attempts-1)await wait(5000);
  }
  throw new Error('La plataforma sigue procesando el video. Revisa su estado antes de repetir.');
 }
 async function publish(target,{file,caption,checkpoint}){
  if(target.platform==='facebook'){
   const session=await request('POST',`${graph}/${target.account}/video_reels`,target.token,{upload_phase:'start'});
   if(!session.video_id||!session.upload_url)throw new Error('Sesión de Facebook incompleta.');
   checkpoint({id:session.video_id,phase:'upload'});
   await upload(session.upload_url,target.token,file);
   const result=await request('POST',`${graph}/${target.account}/video_reels`,target.token,{upload_phase:'finish',video_id:session.video_id,video_state:'PUBLISHED',description:caption});
   if(result.success!==true)throw new Error('Facebook no confirmó la solicitud de publicación.');
   checkpoint({phase:'processing'});
   await poll(target,session.video_id,'facebook');
   return {id:session.video_id};
  }
  const session=await request('POST',`${graph}/${target.account}/media`,target.token,{media_type:'REELS',upload_type:'resumable',caption,share_to_feed:true});
  if(!session.id||!session.uri)throw new Error('Sesión de Instagram incompleta. Verifica Facebook Login for Business y permisos.');
  checkpoint({container_id:session.id,phase:'upload'});
  await upload(session.uri,target.token,file);
  checkpoint({phase:'processing'});
  await poll(target,session.id,'instagram');
  checkpoint({phase:'publishing'});
  const result=await request('POST',`${graph}/${target.account}/media_publish`,target.token,{creation_id:session.id});
  if(!result.id)throw new Error('Instagram no confirmó la publicación.');
  return {id:result.id};
 }
 return {publish};
}
module.exports={settings,createMetaClient};
