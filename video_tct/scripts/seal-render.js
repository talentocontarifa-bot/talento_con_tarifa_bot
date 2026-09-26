const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const editorial=process.argv.includes('--editorial');
const root=path.join(__dirname,editorial?'../../video_editorial':'..');
const hash=file=>crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const video=path.join(root,editorial?'out/video_editorial.mp4':'out/video_final_tct.mp4');
if(!fs.existsSync(video)||fs.statSync(video).size<1000)throw new Error('Render ausente o vacío.');
fs.writeFileSync(path.join(root,'out/render-manifest.json'),JSON.stringify({video_sha256:hash(video),data_sha256:hash(path.join(root,editorial?'editorial_data.json':'src/news_data.json'))},null,2));
