/* Record the private QJ walkthrough in the real Blockbench host. No private asset is committed. */
const {chromium}=require('playwright');
const fs=require('node:fs'),path=require('node:path'),{execFileSync}=require('node:child_process');
const root=path.resolve(process.env.KASUGA_QJ_OUTPUT||'build/reports/qj-demo'),out=path.join(root,'tutorial');
const run=(cmd,args)=>execFileSync(cmd,args,{stdio:['ignore','pipe','pipe']});
const probe=f=>Number(run('ffprobe',['-v','error','-show_entries','format=duration','-of','default=nw=1:nk=1',f]).toString());
const steps=[
 ['01 · 打开配置好的 QJ 工程','载入 qj_bogey_main，选择 qj.running 动画。车轮每两秒转一圈，连杆由 IK 和两组菱形约束联动。'],
 ['02 · 车轮转角与主动调速输入','车轮使用数值旋转关键帧。qj_input_acceleration 显示调速输入；结合杆的位置通道可由加速度控制器主动写入，随后再求解 IK。'],
 ['03 · 主连杆 IK','选择 qj_main_rod_tip，打开 IK 配置。目标是轮上的曲柄销；主连杆只开放 X 轴转动，保持固定杆长。'],
 ['04 · 两条分支组成菱形闭环','展开高级设置，打开菱形闭环约束。选择两条分支的 IK 末端；支点锁定，允许杆件转动，主动输入的位置保持不变。'],
 ['05 · 汽缸白色蒸汽','选中汽缸下的 qj_steam_left，编辑粒子源。局部正 Y 是喷射方向。把每秒数量从三十二改为七十二，尺寸从一点八改为二点八。'],
 ['06 · 保存后同步到游戏','桌面版先设置同步目录和模型资源 ID。游戏执行 kasuga_models live start，再开启保存后自动同步。接下来展示实际发布触发的游戏热重载。'],
];
(async()=>{
 fs.mkdirSync(out,{recursive:true});const voices=[];
 for(let i=0;i<steps.length;i++){
  const textFile=path.join(out,`voice-${i}.txt`),file=path.join(out,`voice-${i}.aiff`);fs.writeFileSync(textFile,steps[i][1]);
  run('say',['-v',process.env.KASUGA_TUTORIAL_VOICE||'Tingting','-r','235','-f',textFile,'-o',file]);voices.push({file,duration:probe(file)});
 }
 const browser=await chromium.launch({executablePath:process.env.CHROME_PATH||'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true,args:['--use-angle=metal','--no-sandbox']});
 const context=await browser.newContext({viewport:{width:1920,height:1080},recordVideo:{dir:out,size:{width:1920,height:1080}},locale:'zh-CN'});
 const page=await context.newPage(),started=Date.now(),chapters=[],errors=[];page.on('dialog',d=>d.accept());page.on('pageerror',e=>errors.push(e.message));
 const pause=ms=>page.waitForTimeout(ms);
 const click=async loc=>{await loc.scrollIntoViewIfNeeded();const b=await loc.boundingBox();if(!b)throw Error('Invisible tutorial control');await page.mouse.move(b.x+b.width/2,b.y+b.height/2,{steps:15});await pause(250);await loc.click();await pause(500)};
 const action=id=>page.locator(`#panel_kasuga_components [data-action="${id}"]`);
 const select=async name=>{await page.evaluate(name=>{KasugaModelComponents.stopPreview();const g=Group.all.find(g=>g.name===name);g.select();for(let p=g.parent;p&&p!=='root';p=p.parent)p.isOpen=true;updateSelection();},name);await pause(500)};
 const chapter=async(i,fn)=>{const start=Date.now();await page.evaluate(({title,text})=>{document.getElementById('qj-title').textContent=title;document.getElementById('qj-caption').textContent=text},{title:steps[i][0],text:steps[i][1]});await pause(500);await fn();await pause(Math.max(1000,voices[i].duration*1000+700-(Date.now()-start)));chapters.push({title:steps[i][0],text:steps[i][1],start:(start-started)/1000,end:(Date.now()-started)/1000,audio:voices[i].file});await page.screenshot({path:path.join(out,`step-${i+1}.png`)});console.log(steps[i][0]);};
 try{
  await page.goto(process.env.BLOCKBENCH_URL||'http://127.0.0.1:8794/');await page.waitForFunction(()=>typeof Codecs!=='undefined');await page.evaluate(async()=>{if(Plugins.loading_promise)await Plugins.loading_promise});
  await page.evaluate(async content=>new Plugin().loadFromFile({name:'kasuga_model_components.js',path:'kasuga_model_components.js',content},true),fs.readFileSync(path.join(__dirname,'../kasuga_model_components.js'),'utf8'));
  await page.evaluate(model=>{Codecs.project.load(model,{name:'qj_bogey_main.bbmodel',path:'qj_bogey_main.bbmodel'});for(const d of document.querySelectorAll('.dialog_wrapper'))d.style.display='none';Modes.options.animate.select();Animation.all[0].select();Preview.selected.loadAnglePreset({position:[-180,75,65],target:[0,20,10],projection:'perspective'});
   const style=document.createElement('style');style.textContent='#qj-title{position:fixed;top:55px;left:370px;padding:12px 22px;background:#102033ed;color:#8cddf2;font:600 25px sans-serif;z-index:100000;pointer-events:none}#qj-caption{position:fixed;left:30px;right:30px;bottom:12px;padding:15px 24px;background:#102033ed;color:#f4f8ff;font:25px/1.6 sans-serif;z-index:100000;pointer-events:none}#qj-cursor{position:fixed;width:20px;height:20px;border:3px solid #ffd278;border-radius:50%;z-index:100001;pointer-events:none;transform:translate(-50%,-50%)}';document.head.append(style);for(const id of ['qj-title','qj-caption','qj-cursor']){const n=document.createElement('div');n.id=id;document.body.append(n)}document.addEventListener('pointermove',e=>{const n=document.getElementById('qj-cursor');n.style.left=e.clientX+'px';n.style.top=e.clientY+'px'},true);
  },JSON.parse(fs.readFileSync(path.join(root,'qj_bogey_main-before.bbmodel'))));
  await chapter(0,async()=>{await page.evaluate(()=>{Timeline.setTime(0);Animator.preview();KasugaModelComponents.startPreview();Timeline.start()})});
  await chapter(1,async()=>{await page.evaluate(()=>Timeline.pause());await select('wheel_group');await pause(1600);await select('qj_input_acceleration');await page.evaluate(()=>{Timeline.setTime(2);Animator.preview()});await pause(1400);await select('jiehegan');await page.evaluate(()=>{Timeline.setTime(4);Animator.preview()})});
  await chapter(2,async()=>{await page.evaluate(()=>Modes.options.edit.select());await select('qj_main_rod_tip');await page.evaluate(()=>BarItems.kasuga_ik.click());await pause(1800);await click(action('preview'))});
  await chapter(3,async()=>{await select('qj_union_tip');await click(page.locator('[data-section="advanced"] > summary'));await click(action('diamonds'));await page.evaluate(()=>{const entry=Project.kasuga_metadata.diamonds.find(d=>d.id==='qj_combination_diamond');Dialog.open.setFormValues({entry:entry.id,...entry})});await pause(4000);await click(page.locator('#kasuga_diamonds .confirm_btn'))});
  await chapter(4,async()=>{await page.evaluate(()=>{KasugaModelComponents.stopPreview();Locator.all.find(l=>l.name==='qj_steam_left').select();BarItems.kasuga_edit_emitter.click()});await pause(1600);await page.locator('#kasuga_emitter .form_bar_rate').hover();await page.evaluate(()=>Dialog.open.setFormValues({rate:72}));await pause(1100);await page.locator('#kasuga_emitter .form_bar_size').hover();await page.evaluate(()=>Dialog.open.setFormValues({size:2.8}));await pause(1500);await click(page.locator('#kasuga_emitter .confirm_btn'));await page.evaluate(()=>{Modes.options.animate.select();Animation.all[0].select();KasugaModelComponents.startPreview();Timeline.start()})});
  await chapter(5,async()=>{await page.evaluate(()=>{Timeline.pause();KasugaModelComponents.stopPreview();Modes.options.edit.select()});await select('qj_main_rod_tip');await click(page.locator('#panel_kasuga_components details').filter({has:page.locator('summary',{hasText:'保存后同步到游戏'})}).locator('summary'));await pause(2500)});
  if(errors.length)throw Error(errors.join('\n'));
 }catch(e){await page.screenshot({path:path.join(out,'failure.png')});throw e}
 finally{await context.close();await browser.close()}
 const webm=await page.video().path(),base=chapters[0].start,end=chapters.at(-1).end;
 fs.writeFileSync(path.join(out,'chapters.json'),JSON.stringify({webm,base,end,chapters,errors},null,2));
 const wavs=[];let audioTime=base;
 for(let i=0;i<chapters.length;i++){const c=chapters[i],wav=path.join(out,`part-${i}.wav`);run('ffmpeg',['-y','-v','error','-i',c.audio,'-af',`adelay=${Math.max(0,Math.round((c.start-audioTime)*1000))}:all=1,apad`,'-t',String(c.end-audioTime),'-ar','48000','-ac','1',wav]);wavs.push(`file 'part-${i}.wav'`);audioTime=c.end}
 fs.writeFileSync(path.join(out,'audio.txt'),wavs.join('\n'));run('ffmpeg',['-y','-v','error','-f','concat','-safe','0','-i',path.join(out,'audio.txt'),'-c:a','pcm_s16le',path.join(out,'narration.wav')]);
 run('ffmpeg',['-y','-v','error','-ss',String(base),'-i',webm,'-i',path.join(out,'narration.wav'),'-t',String(end-base),'-vf','fps=30','-c:v','libx264','-preset','fast','-crf','19','-pix_fmt','yuv420p','-c:a','aac','-b:a','160k','-movflags','+faststart',path.join(root,'qj-tutorial-ui.mp4')]);
 console.log('QJ tutorial UI complete',end-base);
})().catch(e=>{console.error(e);process.exitCode=1});
