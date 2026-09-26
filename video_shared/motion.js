'use strict';
// One lightweight, deterministic visual vocabulary shared by both generators.
// Shapes are editorial decoration: never fabricated charts or statistics.
function graphics(index) {
 const mode=index%5;
 const shapes=[
  '<rect class="shape" x="180" y="35" width="235" height="235" rx="24"/><rect class="shape" x="295" y="90" width="235" height="235" rx="24"/><rect class="shape" x="410" y="145" width="235" height="235" rx="24"/>',
  '<path class="connector" d="M160 210H640"/><circle class="shape" cx="160" cy="210" r="70"/><circle class="shape" cx="400" cy="210" r="70"/><circle class="shape" cx="640" cy="210" r="70"/>',
  '<circle class="shape" cx="400" cy="210" r="175"/><circle class="shape" cx="400" cy="210" r="120"/><circle class="shape" cx="400" cy="210" r="60"/><path class="connector" d="M130 210H670M400 15V405"/>',
  '<path class="connector" d="M130 310H360V210H570V110H720"/><rect class="shape" x="100" y="280" width="60" height="60" rx="10"/><rect class="shape" x="330" y="180" width="60" height="60" rx="10"/><rect class="shape" x="540" y="80" width="60" height="60" rx="10"/>',
  '<path class="shape arrow" d="M190 210H590M440 60L590 210L440 360"/><circle class="shape arrow-ring" cx="400" cy="210" r="195"/>'
 ];
 return `<div class="motion-art" aria-hidden="true"><svg viewBox="0 0 800 420" fill="none">${shapes[mode]}</svg></div>`;
}
function selectRole({headline='',body='',key_points=[],type=''}) {
 const text=`${headline} ${body}`.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'');
 if(type==='cta')return 'action';
 if(key_points.length>1)return 'list';
 if(type==='insight')return 'focus';
 if(/\b(paso|prueba|mide|ajusta|decide|actua|empieza|aplica)\b/.test(text))return 'steps';
 if(/\b(pero|aunque|frente|versus|no|riesgo|problema)\b/.test(text))return 'contrast';
 if(type==='insight'||/\b(clave|importa|criterio|contexto)\b/.test(text))return 'focus';
 return 'statement';
}
function choreography(id,duration,index) {
 const sel=JSON.stringify('#'+id);
 return `const section=document.querySelector(${sel});const child=gsap.timeline({paused:true});
 const words=section.querySelectorAll('.motion-word');child.fromTo(words,{y:38,scale:1.12,opacity:0},{y:0,scale:1,opacity:1,duration:.24,stagger:Math.min(.045,.35/Math.max(words.length,1)),ease:'power4.out'},.09);
 if(section.querySelector('.shape'))child.fromTo(section.querySelectorAll('.shape'),{scale:.45,opacity:0,rotation:${index%2?-16:16},transformOrigin:'50% 50%'},{scale:1,opacity:1,rotation:0,duration:.4,stagger:.09,ease:'back.out(1.3)'},.04);
 if(section.querySelector('.motion-art'))child.fromTo(section.querySelector('.motion-art'),{rotation:-3},{rotation:3,duration:${duration},ease:'none'},0);
 const photo=section.querySelector('.picture img,.editorial-picture img');if(photo){child.fromTo(photo,{scale:1.06,x:0},{scale:1.13,x:-12,duration:${duration},ease:'none'},0);child.fromTo(section.querySelector('.picture,.editorial-picture'),{y:45,opacity:0},{y:0,opacity:1,duration:.25,ease:'power3.out'},.03);}
 if(section.querySelector('.body-copy,li,.highlight,.action'))child.fromTo(section.querySelectorAll('.body-copy,li,.highlight,.action'),{x:-35,opacity:0},{x:0,opacity:1,duration:.22,stagger:.18,ease:'power3.out'},.65);
 if(section.querySelector('.connector'))child.fromTo(section.querySelectorAll('.connector'),{opacity:0},{opacity:1,duration:.2},.25);
 child.fromTo(section.querySelector('.motion-rule'),{scaleX:0},{scaleX:1,transformOrigin:'left',duration:.22,ease:'power4.out'},.15);
 child.fromTo(section.querySelector('.motion-wipe'),{scaleX:1},{scaleX:0,transformOrigin:'right',duration:.18,ease:'power3.inOut'},0);
 const accent=section.querySelector('.motion-word:last-child');if(accent)child.fromTo(accent,{rotation:0},{rotation:-2,duration:.16,yoyo:true,repeat:1,ease:'power2.out',immediateRender:false},${Math.max(1.5,duration*.52)});
 window.__timelines[${JSON.stringify(id)}]=child;`;
}
const escape=s=>String(s).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
function headline(text){return String(text).split(/\s+/).map(w=>`<span class="motion-word">${escape(w)}</span>`).join(' ');}
function scene(args){const role=selectRole(args);const motif={statement:0,list:1,focus:2,steps:3,action:4,contrast:0}[role];return {role,palette:`palette-${args.index%3}`,art:graphics(motif),headline:headline(args.headline),motion:choreography(args.id,args.duration,args.index),decoration:'<div class="motion-rule"></div><div class="motion-wipe"></div>'};}
module.exports={scene,headline,selectRole};
if(require.main===module){let data='';process.stdin.setEncoding('utf8');process.stdin.on('data',s=>data+=s);process.stdin.on('end',()=>process.stdout.write(JSON.stringify(JSON.parse(data).map(scene))));}
