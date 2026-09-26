'use strict';
// Editorial keeps its own calm cinematic timing and typography.
const {scene:base}=require('../video_shared/motion');
function scene(args){
 const result=base(args);
 const selector=JSON.stringify('#'+args.id);
 result.motion=`const section=document.querySelector(${selector});const child=gsap.timeline({paused:true});
 child.fromTo(section.querySelector('.editorial-copy'),{y:24,opacity:0},{y:0,opacity:1,duration:.6,ease:'power2.out'},.1);
 const shapes=section.querySelectorAll('.shape');if(shapes.length)child.fromTo(shapes,{scale:.8,opacity:0,transformOrigin:'50% 50%'},{scale:1,opacity:1,duration:.8,stagger:.12,ease:'power2.out'},0);
 const photo=section.querySelector('.editorial-picture img');if(photo)child.fromTo(photo,{scale:1.06},{scale:1,duration:${args.duration},ease:'none'},0);
 window.__timelines[${JSON.stringify(args.id)}]=child;`;
 result.decoration='<div class="motion-rule"></div>';
 return result;
}
if(require.main===module){let text='';process.stdin.setEncoding('utf8');process.stdin.on('data',s=>text+=s);process.stdin.on('end',()=>process.stdout.write(JSON.stringify(JSON.parse(text).map(scene))));}
module.exports={scene};
