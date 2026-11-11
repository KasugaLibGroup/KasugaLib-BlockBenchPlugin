/* Private-model integration fixture: source is never changed or added to Git. */
const { chromium } = require('playwright');
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const source = process.env.KASUGA_QJ_SOURCE || process.argv[2];
if (!source) throw Error('Set KASUGA_QJ_SOURCE to the QJ bbmodel');
const output = path.resolve(process.env.KASUGA_QJ_OUTPUT || 'build/reports/qj-demo');
(async () => {
 fs.mkdirSync(output,{recursive:true});
 const browser = await chromium.launch({executablePath:process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true,args:['--use-angle=metal','--no-sandbox']});
 try {
  const page = await browser.newPage({viewport:{width:1920,height:1080}}), errors=[];
  page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
  await page.goto(process.env.BLOCKBENCH_URL || 'http://127.0.0.1:8794/');
  await page.waitForFunction(()=>typeof Codecs!=='undefined');
  await page.evaluate(async()=>{if(Plugins.loading_promise) await Plugins.loading_promise});
  await page.evaluate(async content=>new Plugin().loadFromFile({path:'kasuga_model_components.js',name:'kasuga_model_components.js',content},true),fs.readFileSync(path.join(__dirname,'../kasuga_model_components.js'),'utf8'));
  await page.evaluate(model=>{
   Codecs.project.load(model,{name:'qj_bogey_main.bbmodel',path:'qj_bogey_main.bbmodel'});
   for(const d of document.querySelectorAll('.dialog_wrapper'))d.style.display='none';
   const rail=Group.all.find(g=>g.name==='railway');rail.visibility=false;
   rail.forEachChild(n=>{n.visibility=false});
   Canvas.updateAll();
   Preview.selected.loadAnglePreset({position:[-155,65,130],target:[0,20,10],projection:'perspective'});
   Preview.selected.controls.update();
  },JSON.parse(fs.readFileSync(source,'utf8')));
  await page.waitForTimeout(700);await page.screenshot({path:path.join(output,'original.png')});
  const prepared=await page.evaluate(()=>{
   const byName=name=>Group.all.find(g=>g.name===name), group=(name,origin,parent)=>new Group({name,origin}).addTo(parent||'root').init();
   const original=Animation.all[0];
   Modes.options.animate.select(); original.select();
   Project.variable_placeholders=Project.variable_placeholders.replace(/^wheel\s*=.*$/m,'wheel = -time *180').replace(/^d_thita\s*=.*$/m,'d_thita = math.sin(time*360/8)/2+0.5');
   Animator.global_variable_lines={};
   for(const line of Project.variable_placeholders.split('\n')) {const match=/^\s*(\w+)\s*=\s*(.*)$/.exec(line);if(match)Animator.global_variable_lines[match[1]]=match[2];}
   const tracks={}, duration=8, fps=60;
   const put=(bone,channel,time,value)=>{
    if(!value.every(Number.isFinite))throw Error(`Invalid numeric animation: ${bone.name}.${channel} ${time}: ${value}`);
    const animator=tracks[bone.uuid] ||= {name:bone.name,type:'bone',keyframes:[]};
    animator.keyframes.push({channel,time,interpolation:'linear',data_points:[Object.fromEntries(['x','y','z'].map((axis,i)=>[axis,value[i]]))]});
   };
   const driven=new Set(['railway','pianxingan','yueyanban','qubing','goubei','jiehegan','hebinggan']);
   const input=group('qj_input_acceleration',[0,42,80]);
   const cross=byName('qubing').origin.slice(), pin=[-18.5,23.5,-0.6], rodLength=Math.hypot(cross[1]-pin[1],cross[2]-pin[2]);
   for(let frame=0;frame<=duration*fps;frame++) {
    const time=frame/fps;Timeline.time=time;Animator.MolangParser.resetVariables();
    for(const animator of Object.values(original.animators)) {
     const bone=Group.all.find(g=>g.uuid===animator.uuid);
     if(!bone || driven.has(bone.name))continue;
     for(const channel of ['rotation','position','scale']) if(animator[channel]?.length) {
      Animator.resetLastValues();put(bone,channel,time,animator.interpolate(channel));
     }
    }
    const theta=time*Math.PI,cutoff=0.5+0.5*Math.sin(time*Math.PI/4),
     dy=pin[1]-17.5,dz=pin[2],by=17.5+Math.cos(theta)*dy-Math.sin(theta)*dz,
     bz=Math.sin(theta)*dy+Math.cos(theta)*dz,
     cz=bz+Math.sqrt(rodLength*rodLength-(cross[1]-by)**2), slide=cz-cross[2];
    put(byName('qubing'),'position',time,[0,0,slide]);
    put(byName('goubei'),'position',time,[0,0,slide]);
    // The speed/acceleration setting is an authored position input, never an IK correction.
    put(byName('jiehegan'),'position',time,[0,0,slide+cutoff*0.5]);
    put(byName('hebinggan'),'position',time,[0,0,-2*Math.cos(theta)*cutoff]);
    put(input,'position',time,[cutoff*8,0,0]);
   }
   Timeline.time=0;Animator.showDefaultPose();
   // Bake the union link's static nine-degree rotation into its three cubes.
   const union=byName('jiehegan'), pivot=new THREE.Vector3().fromArray(union.origin), q=new THREE.Quaternion().setFromEuler(new THREE.Euler(...union.rotation.map(Math.degToRad),'ZYX'));
   for(const node of union.children) {
    const old=new THREE.Vector3().fromArray(node.origin), next=old.clone().sub(pivot).applyQuaternion(q).add(pivot), delta=next.clone().sub(old);
    node.origin.splice(0,3,...next.toArray());
    if(node instanceof Cube) {for(const point of [node.from,node.to])point.forEach((v,i)=>point[i]=v+delta.getComponent(i));node.rotation[0]+=union.rotation[0];}
    else throw Error('Union-link rest bake requires the expected cube geometry');
   }
   union.rotation.fill(0);
   const locked=bone=>({bone:bone.uuid,min:[0,0,0],max:[0,0,0]}), free=bone=>({bone:bone.uuid,min:[-180,0,0],max:[180,0,0]});
   const ik=(end,target,links)=>{end.kasuga_components={ik:{target:target.uuid,links,iterations:128,tolerance:0.001,max_step:180}}};
   const wheel=byName('wheel_group'), rod=byName('pianxingan'), rocker=byName('yueyanban');
   rod.origin.splice(0,3,-22.2,17.599619469809173,-3.608715574274771);rod.addTo(wheel);
   const ground=group('qj_eccentric_ground',wheel.origin.slice());rocker.addTo(ground);
   const joint=[-22.2,19.987686821095007,23.68701915343906], goal=group('qj_eccentric_goal',joint.slice());
   const rodTip=group('qj_eccentric_tip',joint.slice(),rod),rockerTip=group('qj_expansion_tip',joint.slice(),rocker);
   ik(rodTip,goal,[locked(wheel),free(rod)]);ik(rockerTip,goal,[locked(ground),free(rocker)]);
   const crankPin=group('qj_main_crank_pin',pin,wheel),mainTip=group('qj_main_rod_tip',pin.slice(),byName('qubing'));
   ik(mainTip,crankPin,[free(byName('qubing'))]);
   const lever=byName('hebinggan'), ga=group('qj_combination_ground_a',[0,0,0]),gb=group('qj_combination_ground_b',[0,0,0]);
   lever.addTo(ga);union.addTo(gb);
   const k=[-20.9,14.125,55.3], kg=group('qj_combination_goal',k.slice()),
    ka=group('qj_combination_tip',k.slice(),lever),kb=group('qj_union_tip',k.slice(),union);
   ik(ka,kg,[locked(ga),free(lever)]);ik(kb,kg,[locked(gb),free(union)]);
   Project.kasuga_metadata={version:1,diamonds:[
    {id:'qj_eccentric_diamond',first:rodTip.uuid,second:rockerTip.uuid,iterations:256,tolerance:0.01},
    {id:'qj_combination_diamond',first:ka.uuid,second:kb.uuid,iterations:256,tolerance:0.01},
   ],demo:{clip:'qj.running',wheel_period:2,input:{bone:input.uuid,name:'acceleration',range:[0,1],position_scale:8,description:'Active combination-link speed setting; authored position input'}}};
   for(const [suffix,x,parent,angle] of [['left',-23,byName('qigang'),90],['right',23,byName('qigang2'),-90]])
    new Locator({name:`qj_steam_${suffix}`,position:[x,12,70],rotation:[0,0,angle],kasuga_emitter:{rate:32,max_particles:128,space:'world',particle:{lifetime:1.2,speed:9,spread:24,size:1.8,color:'#f4f4f4',gravity:[0,10,0]}}}).addTo(parent).init();
   for(const animation of Animation.all.slice())animation.remove();
   const clip=new Animation({name:'qj.running',loop:'loop',length:duration,snapping:fps,animators:tracks}).add();clip.select();
   Canvas.updateAll();KasugaModelComponents.validate(KasugaModelComponents.capture());
   return {bones:Group.all.length,tracks:Object.keys(tracks).length,model:Codecs.project.compile({raw:true})};
  });
  fs.writeFileSync(path.join(output,'qj_bogey_main.bbmodel'),JSON.stringify(prepared.model));
  console.log({bones:prepared.bones,tracks:prepared.tracks});
  const poses=await page.evaluate(()=>{
   const names=['wheel_group','wheel_group2','wheel_group3','wheel_group4','wheel_group5','pianxingan','yueyanban','qubing','goubei','jiehegan','hebinggan','qj_eccentric_tip','qj_expansion_tip','qj_main_rod_tip','qj_main_crank_pin','qj_combination_tip','qj_union_tip','qj_input_acceleration'];
   const samples=[];Modes.options.animate.select();Animation.all[0].select();
   for(let i=0;i<32;i++) {
    KasugaModelComponents.stopPreview();Timeline.setTime(i/4);Animator.preview();KasugaModelComponents.startPreview();KasugaModelComponents.preview.tick();
    Canvas.scene.updateMatrixWorld(true);
    const positions=Object.fromEntries(names.map(name=>{const g=Group.all.find(g=>g.name===name);return[name,g.mesh.getWorldPosition(new THREE.Vector3()).toArray()]}));
    const residuals={eccentric:new THREE.Vector3().fromArray(positions.qj_eccentric_tip).distanceTo(new THREE.Vector3().fromArray(positions.qj_expansion_tip)),combination:new THREE.Vector3().fromArray(positions.qj_combination_tip).distanceTo(new THREE.Vector3().fromArray(positions.qj_union_tip)),main:new THREE.Vector3().fromArray(positions.qj_main_rod_tip).distanceTo(new THREE.Vector3().fromArray(positions.qj_main_crank_pin))};
    samples.push({time:i/4,positions,residuals});
   }
   KasugaModelComponents.stopPreview();Timeline.setTime(0.5);Animator.preview();KasugaModelComponents.startPreview();return samples;
  });
  fs.writeFileSync(path.join(output,'blockbench-poses.json'),JSON.stringify(poses,null,2));
  const geometry=await page.evaluate(()=>{
   KasugaModelComponents.stopPreview();Timeline.setTime(4);Animator.preview();
   KasugaModelComponents.startPreview();KasugaModelComponents.preview.tick(1/30);
   Canvas.scene.updateMatrixWorld(true);const byBone={};
   for(const e of Outliner.elements.filter(e=>e instanceof Cube||e instanceof Mesh)) {
    if(!e.visibility||e.export===false)continue;
    let p=e.parent,hidden=false;while(p&&p!=='root'){if(!p.visibility)hidden=true;p=p.parent}if(hidden)continue;
    const points=byBone[e.parent?.name||'root']||=[],positions=e.mesh.geometry.attributes.position;
    for(let i=0;i<positions.count;i++)points.push(new THREE.Vector3().fromBufferAttribute(positions,i).applyMatrix4(e.mesh.matrixWorld).toArray());
   }
   return byBone;
  });
  fs.writeFileSync(path.join(output,'blockbench-geometry.json'),JSON.stringify(geometry));
  fs.copyFileSync(path.join(output,'qj_bogey_main.bbmodel'),path.join(output,'qj_bogey_main-before.bbmodel'));

  await page.waitForTimeout(500);await page.screenshot({path:path.join(output,'configured.png')});
  assert.deepEqual(errors,[]);
  console.log('residual maxima',Object.fromEntries(['eccentric','combination','main'].map(key=>[key,Math.max(...poses.map(p=>p.residuals[key]))])));
 } finally {await browser.close()}
})().catch(e=>{console.error(e);process.exitCode=1});
