# ⚡ Z-LAB BEATPOSE

<div align="center">
  <p><strong>✨ 释放身体的律动，匹配电子合成波的极光节拍 ✨</strong></p>
  <p>一款基于前端 Web Audio API 音频解码、神经网络姿态追踪与 3D 视觉投影的沉浸式体感节奏游戏。</p>
</div>

---

## 🚀 核心特性 (Key Features)

### 1. 🎯 3D 投影体感判定与障碍躲避
- **霓虹判定击打**：通过摄像头（MediaPipe Pose 追踪）在正确时机使用左手腕（粉色）/右手腕（紫色）击碎飞来的音符圈。
- **物理下蹲闪避**：当横向橙色高能障碍墙滑落时，玩家必须物理下蹲以避开碰撞。
- **高连击加成**：连续的 `PERFECT` 与 `GOOD` 判定会增加连击倍率，冲刺 SSS 最高评级。
- **无摄像头键鼠模拟**：在没有摄像头或光线不良时，自动降级为键鼠模拟模式（鼠标移动轨迹 + 空格/S 键控制下蹲），保证完美畅玩。

### 2. 🎵 本地音乐上传与自适应网格谱面 (Grid-based Clock)
- **音乐时钟与网格对齐**：音符逻辑全面重构，所有判定时间均基于 **Music Clock** 与 **Beat Grid (节拍网格)** 计算，彻底对齐真实音乐的鼓点和重拍。
- **自定义 MP3/WAV 上传**：上传本地歌曲，系统通过 Web Audio API 异步解码并生成专属谱面。
- **Tap 对齐与偏移微调**：大厅集成预览播放功能，支持在试听中通过 **Tap First Beat** 一键捕捉首个重拍，并支持 `±10ms` 精细微调，摆脱前奏静音错位。

### 3. ⚡ 全局单例摄像头管理器 (Global Webcam Singleton)
- **0秒闪电载入**：摄像头硬件及 MediaPipe ML 模型采用全局生命周期托管，只在首次进入时初始化一次，后续切换关卡或进入标定“秒开”免去重复申请设备权限。
- **按需帧挂起（零额外 CPU 开销）**：返回大厅或模拟模式时，管理器会自动解除注册并全面挂起 ML 推理，在大厅状态下的 CPU/GPU 消耗完美归零。

### 4. 🌐 中英文多语言一键切换 (i18n)
- 导航栏右上角内置一键切换按钮，支持整个大厅及游戏视口、Canvas 浮空字样、错误报告的全量中英文本地化，并使用 `localStorage` 自动持久化保存玩家选择。

---

## 🛠️ 本地运行与部署指南

### 本地运行 (Run Locally)

**环境要求：** Node.js 18+ 

1. **安装依赖**：
   ```bash
   npm install
   ```

2. **启动本地开发服务器**：
   ```bash
   npm run dev
   ```
   启动后可在浏览器中访问：`http://localhost:3000`

3. **静态类型检查 (Lint)**：
   ```bash
   npm run lint
   ```

---

## 📤 部署到 GitHub Pages

游戏已支持自动化打包和部署到 GitHub Pages：

1. **一键构建与部署**：
   ```bash
   npm run deploy
   ```
   该命令会自动执行 `npm run build`，并将输出的静态资源推送到 GitHub 远端仓库的 `gh-pages` 分支。

2. **在线体验**：
   部署成功后，您可以在浏览器中直接体验：
   [https://pyw110001.github.io/BEATPOSE/](https://pyw110001.github.io/BEATPOSE/)

---

## 📐 技术栈说明 (Tech Stack)
- **框架**：React 19, TypeScript
- **构建工具**：Vite 6
- **样式**：CSS, TailwindCSS 4
- **体感引擎**：MediaPipe Pose, MediaPipe Camera Utils (加载自 CDN)
- **动画效果**：Motion / AnimatePresence
- **图标**：Lucide React
- **音频处理**：Web Audio API (AudioContext)
