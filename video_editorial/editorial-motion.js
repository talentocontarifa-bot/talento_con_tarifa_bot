'use strict';
// Editorial keeps its own calm cinematic timing and typography.
// Layout is responsive: every size/position comes from CSS variables computed by
// cinematic_composer.py for the selected format (vertical, feed or square).
const {scene:base}=require('../video_shared/motion');

const escape=s=>String(s).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');

// Each word lives inside its own mask so it can rise into place without layout shifts.
function maskedHeadline(text){
 const words=String(text).trim().split(/\s+/).filter(Boolean);
 return words.map((w,i)=>`<span class="w${i===words.length-1&&words.length>1?' accent':''}"><span class="wi" data-layout-allow-overflow>${escape(w)}</span></span>`).join(' ');
}


function choreography({id,duration,index,delay}){
 const sel=JSON.stringify('#'+id);
 const d=Number(duration);
 const wipe=index>0?`tl.fromTo(section.querySelector('.ed-wipe'),{scaleX:1},{scaleX:0,transformOrigin:'right center',duration:.5,ease:'power4.inOut'},0);`:'';
 // The first chapter waits for the title card (delay) before its entrance plays.
 return `const section=document.querySelector(${sel});
 const child=gsap.timeline({paused:true});const tl=gsap.timeline();
 ${wipe}
 tl.fromTo(section.querySelector('.ed-visual-shadow'),{clipPath:'inset(100% 0 0 0)'},{clipPath:'inset(0% 0 0 0)',duration:.7,ease:'power3.out'},.18);
 tl.fromTo(section.querySelector('.ed-visual'),{clipPath:'inset(100% 0 0 0)'},{clipPath:'inset(0% 0 0 0)',duration:.75,ease:'power3.out'},.26);
 const photo=section.querySelector('.ed-visual img');if(photo)tl.fromTo(photo,{scale:1.14},{scale:1.02,duration:${d},ease:'none'},0);
 const shapes=section.querySelectorAll('.ed-visual .shape');if(shapes.length)tl.fromTo(shapes,{scale:.6,opacity:0,transformOrigin:'50% 50%'},{scale:1,opacity:1,duration:.7,stagger:.12,ease:'back.out(1.4)'},.5);
 const art=section.querySelector('.ed-visual .motion-art');if(art)tl.fromTo(art,{rotation:-2},{rotation:2,duration:${d},ease:'none'},0);
 const connectors=section.querySelectorAll('.ed-visual .connector');if(connectors.length)tl.fromTo(connectors,{opacity:0},{opacity:1,duration:.4},.7);
 tl.fromTo(section.querySelector('.ed-num'),{x:80,opacity:0},{x:0,opacity:1,duration:.9,ease:'power3.out'},.35);
 tl.fromTo(section.querySelector('.ed-num'),{y:0},{y:-24,duration:${d},ease:'none',immediateRender:false},.35);
 tl.fromTo(section.querySelector('.ed-kicker'),{opacity:0,y:16},{opacity:1,y:0,duration:.45,ease:'power2.out'},.45);
 tl.fromTo(section.querySelector('.ed-kicker .rule'),{scaleX:0},{scaleX:1,transformOrigin:'left center',duration:.8,ease:'power3.inOut'},.55);
 const words=section.querySelectorAll('.ed-head .wi');tl.fromTo(words,{yPercent:110},{yPercent:0,duration:.6,stagger:Math.min(.08,.6/Math.max(words.length,1)),ease:'power4.out'},.6);
 const chip=section.querySelector('.ed-chip');if(chip)tl.fromTo(chip,{clipPath:'inset(0 100% 0 0)'},{clipPath:'inset(0 0% 0 0)',duration:.5,ease:'power3.inOut'},1.25);
 child.add(tl,${Number(delay)||0});
 window.__timelines[${JSON.stringify(id)}]=child;`;
}

function scene(args){
 const result=base(args);
 result.headline=maskedHeadline(args.headline);
 result.motion=choreography(args);
 result.decoration=Number(args.index)>0?'<div class="ed-wipe" data-layout-allow-overflow></div>':'';
 return result;
}
if(require.main===module){let text='';process.stdin.setEncoding('utf8');process.stdin.on('data',s=>text+=s);process.stdin.on('end',()=>process.stdout.write(JSON.stringify(JSON.parse(text).map(scene))));}
module.exports={scene,maskedHeadline};
