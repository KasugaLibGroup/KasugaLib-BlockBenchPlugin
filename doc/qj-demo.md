# QJ 配置、同步与录像

使用外部私有 `.bbmodel`，不改写原文件。结果保存在忽略的 `build/reports/qj-demo/`。需要本地官方 Blockbench 网页构建、Playwright、Chrome、FFmpeg；配音需要 macOS `say`，视频拼接需要 Pillow 与中文字库。

1. 启动本地 Blockbench 网页构建（默认 `http://127.0.0.1:8794/`），设置 `NODE_PATH` 指向 Playwright 的 node_modules。
2. `KASUGA_QJ_SOURCE=/path/to/qj.bbmodel npm run qj:prepare` 生成配置工程、数值动画和 BB 姿态/几何夹具；生成的 `qj_bogey_main-before.bbmodel` 是蒸汽改动前版本。原始 Molang 公式由编辑器在 60 fps 采样，游戏使用数值关键帧。轮转与主动位置输入保持独立通道，IK 求解其余转动。
3. `npm run qj:publish` 用真实 BB 粒子对话框将两侧源从 32/s、1.8 px 改为 72/s、2.8 px，再通过插件共享的原子发布器写入隔离资源包。
4. 游戏复现使用 KasugaLibNext 的 `QjModelClientDemo`，启动参数为 `scripts/run-headless-client.sh -PkasugaQjDemo=true -PkasugaHeadlessFps=30 -PkasugaClientDirectory=/absolute/output/game -PkasugaQuickPlayWorld=qj-demo`。游戏目录须预先包含测试世界、启用的 `kasuga_live` 资源包及 `blockbench-poses.json`。只操作复制的测试世界，演示会布置平台并自动退出。
5. 首次发布应保持 before 参数。开始客户端前清除上轮 `game/debug/qj-demo`，恢复 before 工程并用 `writeLivePack` 发布；同步启动 `KASUGA_QJ_WAIT=1 npm run qj:publish`。它等待游戏写出 ready-for-reload，完成 BB 编辑和发布。客户端记录实际加载界面、重载前后各 240 帧，并检查新旧实例及粒子生命周期。
6. 在 KasugaLibNext 执行 `KASUGA_QJ_FIXTURE=/absolute/output ./gradlew :modules:modelling:modelUnitTest --tests '*QjDemoParityTest'` 比较 32 个姿态和 t=4 时的可见网格/立方体顶点。夹具未提供时跳过私有资产检查。
7. `npm run qj:film` 录制 BB 同步帧，`npm run qj:tutorial` 录制中文操作步骤，最后 `npm run qj:video` 拼接 1080p 视频。视频只使用实际编辑器和游戏帧；字幕、版面和配音由脚本添加。网页宿主录像通过 Node 侧共享发布器写盘；桌面版正常使用保存回调自动发布。

配置工程可直接打开并播放 `qj.running`。主连杆为 `qj_main_rod_tip` → `qj_main_crank_pin`；两组菱形分别连接 `qj_eccentric_tip/qj_expansion_tip` 与 `qj_combination_tip/qj_union_tip`。`jiehegan`、`hebinggan` 的位置轨道是主动输入，逻辑端可用 PoseDriver 的输出替代该轨道；`qj_input_acceleration` 是该输入的可视指示，单独拖动它不会自动改写两条位置轨道。两侧白色粒子源为 `qj_steam_left/right`，挂在各自汽缸下。

游戏与 BB 的端点、几何、动画相位和粒子参数接受对照；粒子使用不同的渲染形状与独立随机序列。相机、背景与光照属于各自宿主，不作为像素一致性要求。此演示没有向运行时增加 Molang 求值器。
