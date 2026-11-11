/* Reproducible Chinese tutorial recorded in the real Blockbench web host.
 * Requires Playwright, Chrome and FFmpeg. macOS say adds optional local narration.
 */
const { chromium } = require("playwright");
const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const assert = require("node:assert/strict");
const fast = process.env.KASUGA_TUTORIAL_FAST === "1";
const output = path.resolve(process.env.KASUGA_TUTORIAL_OUTPUT || "build/reports/tutorial");
const run = (file, args) => execFileSync(file, args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
const duration = (file) => Number(run("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "default=nw=1:nk=1", file]));
const steps = [
  ["01 · 打开演示工程", "安装插件后，打开演示工程。接下来只做三件事：创建 IK 目标，调整物理，再预览粒子。常用选项直接显示，高级参数默认收起。"],
  ["02 · 选择末端骨骼", "先在右侧大纲选择 tip，也就是骨骼链的末端。再切到 IK 配置模式。水滴的钝端是根部，尖端表示骨骼朝向。"],
  ["03 · 一键创建 IK", "点击一键创建 IK 目标。插件会建立独立控制点，并自动关联父级骨骼链。不需要手动创建空组，也不用输入骨骼编号。"],
  ["04 · 拖动目标并预览", "拖动彩色箭头移动目标，然后点击开始预览。模型会转动骨骼去靠近目标。目标超出杆长时，固定长度的骨骼不会自动伸长。"],
  ["05 · 一键启用物理", "停止预览，选择 tail，切到物理配置。点击一键启用物理，先保留默认胶囊碰撞体，再调整质量和尺寸。"],
  ["06 · 修改后直接预览", "把质量改成二，角阻尼改成零点三五。直接点应用并预览，就能保存修改并查看摆动。单根骨骼不需要额外勾选每个参数。"],
  ["07 · 批量编辑与撤销", "按住 Shift 多选 base 和 tail。修改质量后，插件自动勾选这个字段。应用后，两根骨骼一起更新；一次撤销恢复整批修改，其他参数保留各自的值。"],
  ["08 · 粒子颜色与预览", "在大纲选中粒子源 exhaust，再从工具菜单打开编辑粒子源。选一个颜色并确认，最后开始预览。粒子沿定位点的局部正 Y 方向发射。"],
  ["09 · 高级设置按需展开", "需要精调时再展开高级设置。这里可以修改骨骼枢轴、阻尼和关节。编辑器物理用于观察次级摆动，游戏中的刚体碰撞需要在游戏里验证。"],
  ["10 · 保存与游戏同步", "最后停止预览，保存工程。桌面版可在保存后同步到游戏中设置资源包目录和模型资源 ID。游戏先执行画面中的命令，再开启保存后自动同步。"],
];
(async () => {
  fs.mkdirSync(output, { recursive: true });
  const recording = fs.mkdtempSync(path.join(output, "frames-"));
  const voice = fast ? "off" : process.env.KASUGA_TUTORIAL_VOICE || (process.platform === "darwin" ? "Tingting" : "off");
  const audio = [];
  for (let i = 0; i < steps.length; i++) {
    if (voice === "off") { audio.push(null); continue; }
    const textFile = path.join(recording, `voice-${i}.txt`), file = path.join(recording, `voice-${i}.aiff`);
    fs.writeFileSync(textFile, steps[i][1]);
    run("say", ["-v", voice, "-r", "220", "-f", textFile, "-o", file]);
    audio.push({ file, duration: duration(file) });
  }
  const browser = await chromium.launch({
    executablePath: process.env.CHROME_PATH || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    headless: true, args: ["--use-angle=metal", "--no-sandbox"],
  });
  const context = await browser.newContext({ viewport: { width: 1920, height: 1080 }, locale: "zh-CN" });
  const page = await context.newPage(), errors = [], frames = [], chapters = [];
  page.setDefaultTimeout(8000);
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("dialog", (d) => d.accept());
  let cdp;
  const pause = (ms) => page.waitForTimeout(fast ? Math.min(ms, 80) : ms);
  const click = async (locator, modifiers) => {
    await locator.scrollIntoViewIfNeeded();
    const r = await locator.boundingBox();
    assert.ok(r, "Tutorial control is not visible");
    await page.mouse.move(r.x + r.width / 2, r.y + r.height / 2, { steps: 18 });
    await pause(220);
    if (modifiers) await page.keyboard.down(modifiers);
    await page.mouse.click(r.x + r.width / 2, r.y + r.height / 2);
    if (modifiers) await page.keyboard.up(modifiers);
    await pause(450);
  };
  const action = (id) => page.locator(`#panel_kasuga_components [data-action="${id}"]`);
  // Resolve each row from the rendered name; use the native outliner for teaching selection.
  const selectBone = async (name, modifier) => {
    const id = await page.evaluate((name) => Group.all.find((g) => g.name === name).uuid, name);
    await click(page.locator(`#panel_outliner [id="${id}"] > .outliner_object`), modifier);
  };
  const chapter = async (index, fn) => {
    const start = Date.now();
    await page.evaluate(({ title, text }) => {
      document.getElementById("tutorial-title").textContent = title;
      document.getElementById("tutorial-subtitle").textContent = text;
    }, { title: steps[index][0], text: steps[index][1] });
    await pause(900);
    await fn();
    await pause(Math.max(1500, (audio[index]?.duration || 10) * 1000 + 600 - (Date.now() - start)));
    const end = Date.now();
    chapters.push({ title: steps[index][0], text: steps[index][1], start, end, audio: audio[index] });
    await page.screenshot({ path: path.join(output, `step-${String(index + 1).padStart(2, "0")}.png`) });
    console.log(steps[index][0]);
  };
  try {
    await page.goto(process.env.BLOCKBENCH_URL || "http://127.0.0.1:8794/");
    await page.waitForFunction(() => typeof Codecs !== "undefined");
    await page.evaluate(async () => { if (Plugins.loading_promise) await Plugins.loading_promise; });
    await page.evaluate(async (content) => new Plugin().loadFromFile({ path: "kasuga_model_components.js", name: "kasuga_model_components.js", content }, true), fs.readFileSync(path.join(__dirname, "../kasuga_model_components.js"), "utf8"));
    // Start with the bundled geometry but no IK/physics, leaving the original fixture untouched.
    const fixture = JSON.parse(fs.readFileSync(path.join(__dirname, "../examples/rig.bbmodel"), "utf8"));
    for (const group of fixture.groups) {
      group.kasuga_components = {};
      if (group.name === "tail") group.rotation = [0, 0, -35];
    }
    for (const b of fixture.kasuga_lib.bones) {
      b.components = {};
      if (b.name === "tail") b.rotation = [0, 0, -35];
    }
    fs.writeFileSync(path.join(output, "tutorial-start.bbmodel"), JSON.stringify(fixture, null, 2));
    await page.evaluate((fixture) => {
      Codecs.project.load(fixture, { name: "tutorial-start.bbmodel", path: "tutorial-start.bbmodel" });
      for (const dialog of document.querySelectorAll(".dialog_wrapper")) dialog.style.display = "none";
      Preview.selected.loadAnglePreset({ position: [31, 23, 38], target: [0, 8, 0], projection: "perspective" });
      Preview.selected.controls.update();
      for (const group of Group.all) group.isOpen = true;
      updateSelection();
      const style = document.createElement("style");
      style.textContent = `
        #tutorial-title {position:fixed;left:390px;top:82px;padding:12px 22px;background:#101e30eb;color:#84dcef;font:600 24px sans-serif;border-left:3px solid #84dcef;z-index:100000;pointer-events:none}
        #tutorial-subtitle {position:fixed;left:390px;right:310px;bottom:44px;padding:18px 24px;background:#101e30f2;color:#f1f6fb;font:24px/1.65 sans-serif;border-radius:6px;z-index:100000;pointer-events:none;white-space:normal}
        #tutorial-cursor {position:fixed;width:20px;height:20px;border:3px solid #ffcc66;border-radius:50%;background:#ffcc6622;box-shadow:0 0 0 2px #111;z-index:100001;pointer-events:none;transform:translate(-50%,-50%)}
      `;
      document.head.append(style);
      for (const id of ["tutorial-title", "tutorial-subtitle", "tutorial-cursor"]) {
        const node = document.createElement("div"); node.id = id; document.body.append(node);
      }
      const cursor = document.getElementById("tutorial-cursor");
      document.addEventListener("pointermove", (e) => { cursor.style.left = `${e.clientX}px`; cursor.style.top = `${e.clientY}px`; }, true);
      document.addEventListener("pointerdown", () => { cursor.style.background = "#ffcc66bb"; }, true);
      document.addEventListener("pointerup", () => { cursor.style.background = "#ffcc6622"; }, true);
    }, fixture);
    await pause(800);
    cdp = await context.newCDPSession(page);
    cdp.on("Page.screencastFrame", ({ data, metadata, sessionId }) => {
      const filename = `frame-${String(frames.length).padStart(6, "0")}.jpg`;
      fs.writeFileSync(path.join(recording, filename), Buffer.from(data, "base64"));
      frames.push({ filename, timestamp: metadata.timestamp });
      cdp.send("Page.screencastFrameAck", { sessionId }).catch(() => {});
    });
    await cdp.send("Page.startScreencast", { format: "jpeg", quality: 92, maxWidth: 1920, maxHeight: 1080, everyNthFrame: 2 });
    await chapter(0, async () => { await page.mouse.move(740, 440, { steps: 20 }); });
    await chapter(1, async () => {
      await selectBone("tip");
      await click(page.locator('#mode_selector li').filter({ hasText: 'IK 配置模式' }));
    });
    await chapter(2, async () => {
      const count = await page.evaluate(() => Group.all.length);
      await click(action("create-ik"));
      assert.equal(await page.evaluate(() => Group.all.length), count + 1);
      assert.equal(await page.evaluate(() => Group.all.find((g) => g.name === "tip").kasuga_components.ik.links.length), 2);
    });
    await chapter(3, async () => {
      const dragAxis = async (axis, dx, dy) => {
      const p = await page.evaluate((axis) => {
        Preview.selected.render();
        const object = KasugaModelComponents.editor.handles.find((o) => o.userData.axis === axis && o.geometry.type !== "CylinderGeometry");
        const point = object.getWorldPosition(new THREE.Vector3()).project(Preview.selected.camera), r = Preview.selected.canvas.getBoundingClientRect();
        return { x: r.left + (point.x + 1) * r.width / 2, y: r.top + (1 - point.y) * r.height / 2 };
      }, axis);
      await page.mouse.move(p.x, p.y, { steps: 18 }); await pause(500);
      await page.mouse.down(); await page.mouse.move(p.x + dx, p.y + dy, { steps: 65 }); await page.mouse.up();
      };
      const before = await page.evaluate(() => Group.all.find((g) => g.name === "tip_IK目标").origin.slice());
      await dragAxis(0, 110, 0);
      await dragAxis(1, 0, 110);
      assert.notDeepEqual(await page.evaluate(() => Group.all.find((g) => g.name === "tip_IK目标").origin.slice()), before);
      await click(action("preview"));
      await pause(1800);
      assert.ok(await page.evaluate(() => KasugaModelComponents.preview));
      const error = await page.evaluate(() => {
        const end = Group.all.find((g) => g.name === "tip"),
          target = Group.all.find((g) => g.uuid === end.kasuga_components.ik.target);
        return end.mesh.getWorldPosition(new THREE.Vector3()).distanceTo(
          target.mesh.getWorldPosition(new THREE.Vector3()));
      });
      assert.ok(error < 0.1, `Tutorial IK did not reach its target: ${error}`);
    });
    await chapter(4, async () => {
      await click(action("preview"));
      await selectBone("tail");
      await click(action("physics-mode"));
      await click(action("enable-physics"));
      assert.ok(await page.evaluate(() => Group.all.find((g) => g.name === "tail").kasuga_components.physics));
    });
    await chapter(5, async () => {
      await click(page.locator('[data-field="mass"] input[type="number"]'));
      await page.locator('[data-field="mass"] input[type="number"]').fill("2");
      await click(page.locator('[data-field="angular_damping"] input[type="number"]'));
      await page.locator('[data-field="angular_damping"] input[type="number"]').fill("0.35");
      await click(action("preview"));
      assert.equal(await page.evaluate(() => Group.all.find((g) => g.name === "tail").kasuga_components.physics.mass), 2);
    });
    await chapter(6, async () => {
      await click(action("preview"));
      await selectBone("base"); await selectBone("tail", "Shift");
      assert.equal(await page.evaluate(() => Group.multi_selected.length), 2);
      await click(page.locator('[data-field="mass"] input[type="number"]'));
      await page.locator('[data-field="mass"] input[type="number"]').fill("3");
      await click(action("apply")); await pause(1000);
      assert.ok(await page.evaluate(() => Group.multi_selected.every((g) => g.kasuga_components.physics.mass === 3)));
      await click(page.locator('#menu_bar > li').filter({ hasText: /^编辑$/ }));
      await click(page.locator('.contextMenu li[menu_item="undo"]'));
      await pause(700);
      assert.equal(await page.evaluate(() => Group.all.find((g) => g.name === "tail").kasuga_components.physics.mass), 2);
    });
    await chapter(7, async () => {
      const id = await page.evaluate(() => Locator.all.find((l) => l.name === "exhaust").uuid);
      await click(page.locator(`#panel_outliner [id="${id}"] > .outliner_object`));
      await click(page.locator('#menu_bar > li').filter({ hasText: /工具/ }));
      await click(page.locator('.contextMenu li[menu_item="kasuga_edit_emitter"]'));
      await click(page.locator('#kasuga_emitter .form_bar_color .sp-replacer'));
      await click(page.locator('.sp-container:visible .sp-thumb-el[data-color="rgb(255, 85, 204)"]'));
      await click(page.locator('.sp-container:visible .sp-choose'));
      await click(page.locator('#kasuga_emitter .confirm_btn'));
      await click(action("preview"));
    });
    await chapter(8, async () => {
      await click(action("preview"));
      await selectBone("tail");
      await click(page.locator('[data-section="advanced"] > summary'));
      await pause(1100);
      await click(page.locator('[data-section="advanced"] > summary'));
      await click(action("preview"));
    });
    await chapter(9, async () => {
      await click(action("preview"));
      await click(page.locator('#panel_kasuga_components details').filter({ has: page.locator('summary', { hasText: "保存后同步到游戏" }) }).locator('summary'));
      await page.evaluate(() => { document.getElementById("tutorial-subtitle").textContent = "保存工程 → 桌面版设置同步目录与资源 ID → 游戏执行 /kasuga_models live start → 开启保存后自动同步。网页版可编辑与预览，自动同步需桌面文件权限。"; });
      const saved = await page.evaluate(() => Codecs.project.compile({ raw: true }));
      assert.ok(saved.kasuga_lib.bones.some((b) => b.components.ik));
      fs.writeFileSync(path.join(output, "tutorial-result.bbmodel"), JSON.stringify(saved, null, 2));
    });
    assert.deepEqual(errors, []);
    await pause(400);
    await cdp.send("Page.stopScreencast");
  } catch (error) {
    await page.screenshot({ path: path.join(output, "failure.png") });
    console.error(await page.evaluate(() => ({ status: document.querySelector('.kasuga-status')?.textContent, mode: typeof Modes === "undefined" ? null : Modes.id })));
    throw error;
  } finally {
    await browser.close();
  }
  assert.ok(frames.length > 30, "No usable screencast frames");
  const manifest = frames.map((f, i) => `file '${f.filename}'\nduration ${Math.max(0.01, (frames[i + 1]?.timestamp || f.timestamp + 0.1) - f.timestamp)}`).join("\n");
  fs.writeFileSync(path.join(recording, "frames.txt"), manifest + `\nfile '${frames.at(-1).filename}'\n`);
  const base = frames[0].timestamp, stamp = (seconds) => new Date(Math.max(0, seconds) * 1000).toISOString().slice(11, 23).replace(".", ",");
  fs.writeFileSync(path.join(output, "tutorial.srt"), chapters.map((c, i) => `${i + 1}\n${stamp(c.start / 1000 - base)} --> ${stamp(c.end / 1000 - base)}\n${c.title}\n${c.text}\n`).join("\n"));
  const wavs = [];
  // Align voice starts to recorded chapter timestamps, preserving pauses between steps.
  let audioTime = 0;
  for (let i = 0; i < chapters.length; i++) {
    const c = chapters[i], file = path.join(recording, `segment-${i}.wav`),
      start = Math.max(audioTime, c.start / 1000 - base),
      end = Math.max(start + 0.1, c.end / 1000 - base);
    const args = c.audio ? ["-i", c.audio.file] : ["-f", "lavfi", "-i", "anullsrc=r=48000:cl=mono"];
    run("ffmpeg", ["-y", "-v", "error", ...args, "-af", `adelay=${Math.max(0, Math.round((start - audioTime) * 1000))}:all=1,apad`, "-t", String(end - audioTime), "-ar", "48000", "-ac", "1", file]);
    wavs.push(`file 'segment-${i}.wav'`); audioTime = end;
  }
  fs.writeFileSync(path.join(recording, "audio.txt"), wavs.join("\n"));
  run("ffmpeg", ["-y", "-v", "error", "-f", "concat", "-safe", "0", "-i", path.join(recording, "audio.txt"), "-c:a", "pcm_s16le", path.join(recording, "narration.wav")]);
  const video = path.join(output, "tutorial.mp4");
  run("ffmpeg", ["-y", "-v", "error", "-f", "concat", "-safe", "0", "-i", path.join(recording, "frames.txt"), "-i", path.join(recording, "narration.wav"), "-vf", "fps=25,scale=1920:1080", "-c:v", "libx264", "-preset", "fast", "-crf", "19", "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "160k", "-af", "apad", "-shortest", "-movflags", "+faststart", video]);
  const report = { video, duration: duration(video), resolution: "1920x1080", voice, errors, chapters: chapters.map((c) => ({ title: c.title, start: Math.max(0, c.start / 1000 - base), duration: (c.end - c.start) / 1000 })) };
  fs.writeFileSync(path.join(output, "report.json"), JSON.stringify(report, null, 2));
  fs.writeFileSync(path.join(output, "tutorial.md"), "# Kasuga Blockbench 快速上手\n\n录制于官方 Blockbench 5.2.2 网页构建；自动同步部分为入口说明，需桌面版与游戏客户端。\n\n" + report.chapters.map((c, i) => `- ${stamp(c.start).slice(3, 8).replace(",", ".")} ${c.title}\n  ${steps[i][1]}`).join("\n") + "\n");
  console.log(JSON.stringify(report, null, 2));
})().catch((error) => { console.error(error); process.exitCode = 1; });
