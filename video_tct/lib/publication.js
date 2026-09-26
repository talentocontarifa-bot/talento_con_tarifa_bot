'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
function readJson(file, fallback) {
 if (!fs.existsSync(file)) return fallback;
 return JSON.parse(fs.readFileSync(file,'utf8'));
}
function writeJson(file, data) {
 fs.mkdirSync(path.dirname(file),{recursive:true});
 fs.writeFileSync(`${file}.tmp`,JSON.stringify(data,null,2));
 fs.renameSync(`${file}.tmp`,file);
}
async function publishTargets({data, targets, stateFile, historyFile, publish, dryRun=false}) {
 if(data.preview_only || !data.source_url)throw new Error('Una demo o un video sin fuente no se puede publicar.');
 const key=crypto.createHash('sha256').update(data.source_url).digest('hex');
 const state=readJson(stateFile,{});
 const entry=state[key]||{source_url:data.source_url,targets:{}};
 const results={};
 for(const target of targets){
  const targetKey=`${target.platform}:${target.account}`;
  const prior=entry.targets[targetKey];
  if(['published','submitted'].includes(prior?.status)){results[target.platform]={...prior,skipped:true};continue;}
  if(dryRun){results[target.platform]={status:prior?'requires_review':'preview'};continue;}
  if(prior){results[target.platform]={status:'requires_review',id:prior.id};continue;}
  // Persist intent BEFORE calling Meta. Ambiguous results never trigger blind re-posts.
  entry.targets[targetKey]={status:'in_progress'};
  state[key]=entry;writeJson(stateFile,state);
  const checkpoint=fields=>{Object.assign(entry.targets[targetKey],fields);writeJson(stateFile,state);};
  try{
   const result=await publish(target,checkpoint);
   if(!result?.id)throw new Error('La plataforma no devolvió un identificador.');
   checkpoint({status:result.status==='submitted'?'submitted':'published',id:result.id});
   results[target.platform]=entry.targets[targetKey];
  }catch(error){
   checkpoint({status:'requires_review'});
   results[target.platform]={...entry.targets[targetKey],error:error.message};
  }
 }
 const complete=targets.length>0 && Object.values(results).every(r=>['published','submitted'].includes(r.status));
 if(complete&&!dryRun){
  const history=readJson(historyFile,[]);
  if(!Array.isArray(history))throw new Error('El historial de fuentes debe ser un array.');
  if(!history.includes(data.source_url)){history.push(data.source_url);writeJson(historyFile,history);}
 }
 return {complete,results};
}
module.exports={readJson,writeJson,publishTargets};
