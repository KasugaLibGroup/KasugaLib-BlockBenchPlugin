"""Assemble real BB/game frame recordings and the Chinese walkthrough."""
import json, os, subprocess
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont
ROOT=Path(os.environ.get('KASUGA_QJ_OUTPUT','build/reports/qj-demo')).resolve()
OUT=ROOT/'video-parts';OUT.mkdir(exist_ok=True)
FONT=os.environ.get('KASUGA_QJ_FONT','/System/Library/Fonts/Hiragino Sans GB.ttc')
GAME=ROOT/'game/debug/qj-demo'
def run(args):
    subprocess.run([str(a) for a in args],check=True,stdout=subprocess.DEVNULL)
def duration(file):
    return float(subprocess.check_output(['ffprobe','-v','error','-show_entries','format=duration','-of','default=nw=1:nk=1',str(file)]))
def overlay(name,title,lines,compare=False):
    image=Image.new('RGBA',(1920,1080),(14,23,36,255));d=ImageDraw.Draw(image)
    def text(x,y,s,size=32,color='#e9f1ff'):d.text((x,y),s,font=ImageFont.truetype(FONT,size),fill=color)
    text(55,35,title,42,'#8cddf2')
    if compare:
        d.rectangle((25,160,945,820),fill=(0,0,0,0));d.rectangle((975,160,1895,820),fill=(0,0,0,0))
        text(55,115,'Blockbench · 实际编辑器画面',27);text(1005,115,'Minecraft · 实际客户端画面',27)
    else:d.rectangle((45,135,1875,820),fill=(0,0,0,0))
    for i,line in enumerate(lines):text(55,860+i*55,line,30)
    file=OUT/(name+'.png');image.save(file);return file
common=['-c:v','libx264','-preset','fast','-crf','19','-pix_fmt','yuv420p','-r','30','-c:a','aac','-b:a','160k','-ar','48000','-ac','1','-movflags','+faststart']
def comparison(phase):
    title='QJ 连杆：同一模型、数值动画与闭环约束' if phase=='before' else '保存热重载后：两侧汽缸蒸汽同步增强'
    plate=overlay('compare-'+phase,title,['轮转周期 2 秒 · 结合杆位置为主动输入 · IK 保持固定杆长','白色蒸汽方向、颜色和参数一致；粒子形状与随机分布允许不同'],True)
    start=0 if phase=='before' else 240
    file=OUT/('compare-'+phase+'.mp4')
    filters='[0:v]crop=800:440:250:135,scale=920:506,setsar=1,pad=920:660:0:77:color=0x0e1724[a];[1:v]crop=800:440:310:125,scale=920:506,setsar=1,pad=920:660:0:77:color=0x0e1724[b];color=c=0x0e1724:s=1920x1080:r=30[base];[base][a]overlay=25:160[x];[x][b]overlay=975:160[y];[y][2:v]overlay=0:0[v]'
    run(['ffmpeg','-y','-v','error','-framerate','30','-i',ROOT/('bb-'+phase)/'frame-%05d.png','-framerate','30','-start_number',start,'-i',GAME/'frames/frame-%05d.png','-loop','1','-i',plate,'-f','lavfi','-i','anullsrc=r=48000:cl=mono','-filter_complex',filters,'-map','[v]','-map','3:a','-t','8',*common,file])
    return file
before=comparison('before');after=comparison('after')
reloads=sorted((GAME/'frames').glob('reload-*.png'))
assert reloads, 'No actual reload frames'
manifest=[]
for i,f in enumerate(reloads):
    delta=(int(reloads[i+1].stem.split('-')[1])-int(f.stem.split('-')[1]))/1e9 if i+1<len(reloads) else 1/30
    manifest.extend([f"file '{f}'",f'duration {max(1/60,min(delta,1))}'])
manifest.append(f"file '{reloads[-1]}'");(OUT/'reload.txt').write_text('\n'.join(manifest))
plate=overlay('reload','BB 修改 → 发布标记 → 游戏自动资源热重载',['真实加载过程 · 每秒 32 → 72 粒子，尺寸 1.8 → 2.8','资源重载后自动绑定新实例，旧实例与旧粒子全部释放'])
reload=OUT/'reload.mp4'
run(['ffmpeg','-y','-v','error','-f','concat','-safe','0','-i',OUT/'reload.txt','-loop','1','-i',plate,'-f','lavfi','-i','anullsrc=r=48000:cl=mono','-filter_complex','[0:v]scale=1200:675,setsar=1,pad=1920:1080:360:135:color=0x0e1724[x];[x][1:v]overlay=0:0[v]','-map','[v]','-map','2:a','-t',str(sum(float(x.split(' ')[1]) for x in manifest if x.startswith('duration '))),*common,reload])
report=json.loads((GAME/'report.json').read_text());assert report['passed'] and report['automaticReload'] and report['oldInstanceDisposed']
plate=overlay('game','QJ · 游戏内最终效果',['骨骼端点最大差异 < 0.018 像素 · 可见几何最大差异 < 0.009 像素','真实客户端通过：轮转 / 主动位置输入 / IK / 菱形闭环 / 蒸汽 / 自动热重载'])
final=OUT/'game-final.mp4'
run(['ffmpeg','-y','-v','error','-framerate','30','-start_number','240','-i',GAME/'frames/frame-%05d.png','-loop','1','-i',plate,'-f','lavfi','-i','anullsrc=r=48000:cl=mono','-filter_complex','[0:v]crop=1000:560:220:100,scale=1200:672,setsar=1,pad=1920:1080:360:135:color=0x0e1724[x];[x][1:v]overlay=0:0[v]','-map','[v]','-map','2:a','-t','8',*common,final])
ui=ROOT/'qj-tutorial-ui.mp4';assert ui.exists(),'Record qj:tutorial first'
parts=[before,ui,reload,after,final];(OUT/'parts.txt').write_text('\n'.join(f"file '{p}'" for p in parts))
# Re-encode concatenation to normalize codec time bases and avoid a gap at section boundaries.
video=ROOT/'qj-tutorial-demo.mp4'
run(['ffmpeg','-y','-v','error','-f','concat','-safe','0','-i',OUT/'parts.txt',*common,video])
chapters=[];t=0
for name,p in zip(['BB / 游戏同步对照','配置操作教学','真实自动热重载','蒸汽修改后同步对照','游戏内最终效果'],parts):
    length=duration(p);chapters.append({'title':name,'start':t,'duration':length});t+=length
(ROOT/'video-report.json').write_text(json.dumps({'video':str(video),'duration':duration(video),'resolution':'1920x1080','chapters':chapters,'client':report},ensure_ascii=False,indent=2))
print(video)
