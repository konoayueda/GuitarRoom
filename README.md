# 弦间 · 个人吉他练习室

以曲谱为中心的个人吉他工具网站。第一期提供图片 / PDF 曲谱收藏与阅读、练习笔记、和弦探索和节拍练习，适配桌面与手机。

## 已实现

- 曲谱库：上传 JPG、PNG、WebP 或 PDF，整理曲名、作者、调性、变调夹和标签；收藏、搜索、排序与练习状态。
- 阅读器：多页浏览、记住上次页码、调整页序、旋转、缩放、专注模式和自动滚动。
- 笔记：谱面圈选 / 点按批注、练习笔记；旋转时批注位置随页面变换。保存失败保留当前草稿。
- 和弦实验室：常用和弦与指型、交互指板、按弦位置反查和弦、变调夹换算、组成音与和弦试听、具体指型收藏。
- 换指练习：手动选择前后和弦，提示相同指位可保留的手指；将选定和弦加入临时进行，按设定速度循环试听。
- 节拍器：30–240 BPM，3/4、4/4、6/4；手机收起练习面板后仍继续运行。
- 备份：ZIP 包含原始曲谱，以及记录页序、旋转、标签、批注和笔记的 JSON。原文件可重新导入；暂未实现从 JSON 一键恢复整套整理信息。
- 三份原创示范六线谱，不使用第三方曲谱内容。

## 阶段边界

当前试听来自手动选择的和弦，使用浏览器合成拨弦音色。第一期尚未识别上传的图片或 PDF，也不会把它们自动转换成演奏。

第二期计划加入六线谱 / 弹唱谱识别、人工校正、可编辑节奏与和弦事件，并提供基础试听。第三期在确认后的结构化曲谱上加入编排、演奏示范和与曲谱同步的落指引导。

## 本地运行

需要 Node.js 22.13 或更高版本。此项目使用 React、TypeScript、vinext / Vite、Cloudflare D1 与 R2、PDF.js 和 Web Audio。

```sh
npm ci
npm run dev
```

默认预览地址为 http://localhost:5173/ 。本地开发的“登录我的琴房”使用仅限 loopback 的模拟账户；正式托管使用 ChatGPT 登录。用户数据按账户隔离。开发数据保存在 `.wrangler/state`，不随源代码发布。

新检出的目录还需要初始化本地数据库（只执行一次；现有工作区已经执行）：

```sh
npm run build
node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0000_left_gwen_stacy.sql
```

`.openai/hosting.json` 声明 DB 和 BUCKET 绑定。数据库保存曲谱信息、笔记和指型，R2 保存原始文件；API 校验登录身份、文件签名和写入版本。多标签页使用旧版本保存时返回冲突，防止静默覆盖。

单次导入可选最多 20 张图片，或 1 份最多 200 页的 PDF。每个文件不超过 20 MB，单次总量不超过 40 MB。第一期使用标准调弦 E A D G B E。

## 开发与验证

```sh
npm run check
npm run lint
npm run build
npm run assets:pdf
node scripts/generate-studies.mjs
```

更新 PDF.js 版本后执行 `npm run assets:pdf`，同步 worker、字体、CMap、WASM 与许可证，避免版本不一致。自定义曲谱与代码原生图形放在 `public/studies`。

已经用 Edge / Playwright 验证文件导入、PDF 翻页渲染、登录隔离、批注与旋转、收藏和笔记刷新恢复、备份内容、写入冲突、失败重试、和弦试听、手机布局与持续节拍。和弦数据及合成音准另行校验。会话内的测试脚本、截图、上传样本位于忽略的 `.qa`，不属于正式产品数据。

浏览器支持 `document.modelContext` 时可注册曲谱列表与打开阅读器工具；当前测试浏览器不支持该接口，此项未做真实 WebMCP 调用验证。

发布前按项目约定向所有者确认提交信息。不要提交 `.wrangler`、`.sites-runtime`、`.qa` 或任何临时凭证。
