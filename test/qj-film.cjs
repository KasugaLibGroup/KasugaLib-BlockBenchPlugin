/* Deterministic real Blockbench framebuffer capture at the same times as the game recording. */
const {chromium}=require('playwright');const fs=require('fs'),path=require('path');
(async()=>{const root=path.resolve(process.env.KASUGA_QJ_OUTPUT||'build/reports/qj-demo');
const browser=await chromium.launch({executablePath:process.env.CHROME_PATH||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true,args:['--use-angle=metal','--no-sandbox']});
try{const page=await browser.newPage({viewport:{width:1920,height:1080}});page.on('dialog',d=>d.accept());await page.goto(process.env.BLOCKBENCH_URL||'http://127.0.0.1:8794/');await page.waitForFunction(()=>typeof Codecs!=='undefined');await page.evaluate(async()=>{if(Plugins.loading_promise)await Plugins.loading_promise});await page.evaluate(async content=>new Plugin().loadFromFile({path:'kasuga_model_components.js',name:'kasuga_model_components.js',content},true),fs.readFileSync(path.join(__dirname,'../kasuga_model_components.js'),'utf8'));
for(const phase of ['before','after']){
 const file=phase==='before'?'qj_bogey_main-before.bbmodel':'qj_bogey_main.bbmodel';
 await page.evaluate(m=>{KasugaModelComponents.stopPreview();Codecs.project.load(m,{name:'qj_bogey_main.bbmodel',path:'qj_bogey_main.bbmodel'});for(const d of document.querySelectorAll('.dialog_wrapper'))d.style.display='none';Modes.options.animate.select();Animation.all[0].select();Timeline.setTime(0);Animator.preview();Preview.selected.loadAnglePreset({position:[-180,75,65],target:[0,20,10],projection:'perspective'});Preview.selected.controls.update();KasugaModelComponents.startPreview();KasugaModelComponents.preview.manual=true;},JSON.parse(fs.readFileSync(path.join(root,file))));
 const out=path.join(root,'bb-'+phase);fs.mkdirSync(out,{recursive:true});
 for(let start=0;start<240;start+=30){
  const frames=await page.evaluate(async start=>{const result=[];for(let i=start;i<start+30;i++){
   Timeline.setTime(i/30);Animator.preview();KasugaModelComponents.preview.tick(1/30);Preview.selected.render();
   result.push(Preview.selected.canvas.toDataURL('image/png').split(',')[1]);await new Promise(requestAnimationFrame);
  }return result;},start);
  frames.forEach((data,i)=>fs.writeFileSync(path.join(out,`frame-${String(start+i).padStart(5,'0')}.png`),Buffer.from(data,'base64')));
  console.log(phase,start+30);
 }
 await page.screenshot({path:path.join(root,'blockbench-'+phase+'.png')});
}
}finally{await browser.close()}})().catch(e=>{console.error(e);process.exitCode=1});
