# Beat Pose Rhythm - 技术规格与实现方案 (Specification Kit & Implementation Plan)

本文档详细介绍了 **Beat Pose Rhythm** 的技术架构、设计模式和实现方案。这是一款基于身体姿态估算（Pose Estimation）构建的实时摄像头体感节奏游戏，灵感来源于 Charlie Gerard 的 `beat-pose` 项目。

---

## 1. 技术架构概述 (Technical Architecture Overview)

系统采用模块化的全栈客户端模型开发，基于 **React**、**Vite**、**Tailwind CSS** 和 **Motion** 框架构建，完全在浏览器内运行，消除了高延迟后端服务器的影响。

```
┌────────────────────────────────────────────────────────────────────────┐
│                              Application (应用程序)                      │
├───────────────────┬───────────────────┬────────────────────────────────┤
│   音频合成引擎     │   姿态追踪核心    │           核心游戏循环          │
│(Web Audio 合成器) │ (MediaPipe Pose)  │     (碰撞检测与坐标网格)        │
└─────────┬─────────┴─────────┬─────────┴───────────────┬────────────────┘
          │                   │                         │
          ▼                   ▼                         ▼
      高精度节拍          身体骨骼骨架追踪            目标命中判定 (得分)
```

### 核心功能模块:
1. **姿态追踪模块 (`/src/components/PoseTracker.tsx`)**: 控制摄像头初始化，动态加载 MediaPipe Pose SDK，在视频流上进行实时推理，并返回人体关键节点（如：鼻子、左右手腕、臀部）的 Canvas 归一化坐标。
2. **音频合成引擎 (`/src/lib/audioEngine.ts`)**: 结合 **Web Audio API**，在客户端实时生成高保真、高度同步的电子节奏音乐音效（由 BPM 控制的底鼓、军鼓、踩镲和贝斯合成器音轨循环）。无网络延迟，零宽带负载。
3. **游戏画布与循环 (`/src/components/GameCanvas.tsx`)**: 负责在屏幕上渲染飞入的节奏方块、障碍墙、玩家身体骨骼投影、命中特效、连击状态，并对玩家手腕节点与障碍进行碰撞检测。
4. **游戏主控制台 (`/src/components/Dashboard.tsx`)**: 管理歌曲关卡选择、难度、高分记录、玩家摄像头标定引导以及操作说明。

---

## 2. 姿态检测方案 (Pose Detection Strategy)

为了避免庞大的本地 node 原生依赖和帧率延迟，我们通过 jsDelivr CDN 动态加载 **MediaPipe Pose SDK v0.5**。

### 关键追踪点 (Key Points Tracked):
- **`left_wrist` (左手腕 - 节点 15)** 与 **`right_wrist` (右手腕 - 节点 16)**: 作为玩家击打节奏音符的“光剑”或控制器。
- **`left_shoulder` (左肩 - 节点 11)**, **`right_shoulder` (右肩 - 节点 12)** 和 **`nose` (鼻子 - 节点 0)**: 协同用于判定玩家的头部倾斜或下蹲下潜动作，以躲避红色/橙色障碍墙。

### 姿态推理模型性能优化:
- **响应式缩放**: 摄像头输出固定为标准的 640x480 分辨率，并比例映射至 2D 视口，大幅降低浏览器计算开销。
- **平滑与置信度**: 使用 `modelComplexity: 1` 确保在普通笔记本和移动设备上能够跑满 30-60 FPS 的流畅度，设置 `minDetectionConfidence: 0.5` 过滤干扰噪声。

---

## 3. 节奏与音频实时合成 (Rhythm & Audio Audio Synthesis)

为了防止加载外部大音频文件可能带来的缓冲延迟、跨域拦截或版权问题，我们使用 **Web Audio API** 自研了一套轻量音频生成系统：

- **BPM 同步器**: 通过运行在 Web Audio Context 中的高精度 look-ahead（前瞻式）调度器，微秒级精准控制合成器声音队列。
- **曲目音轨预设 (Track Presets)**:
  - **Synthwave Pulse (合成波脉冲 - 110 BPM)**: 低沉丰满的贝斯循环、强劲的电子底鼓与回荡的激光扫频音效。
  - **Cyberpunk Techno (赛博朋克科技 - 135 BPM)**: 侵略性极强的酸性贝斯、极速的双重军鼓节奏。
  - **Ambient Neon (环境霓虹 - 85 BPM)**: 空灵深邃的数字滤波器、悠缓的长音和声与清脆解压的打击乐。
- **交互级声效反馈**: 击中成功会触发清脆的合成电音（Zap/Clap），丢失连击（Miss）时则会伴有短促的下沉低音。

---

## 4. 游戏玩法与空间碰撞判定 (Gameplay & Coordinate Collision Detection)

```
             飞来的音符 [x, y, border_radius]
                     ▼
           ( d = √((x₂-x₁)² + (y₂-y₁)²) ) <─── 实时计算欧氏距离并对比阈值
                     ▲
            玩家手腕节点 [x, y]
```

- **碰撞检测**: 在游戏帧循环的每一次更新中，动态计算玩家手腕粒子位置与当前落在击打线上的音符之间的欧式距离（Euclidean Distance）。
- **判定等级窗口**:
  - `距离 < 45px` 且 `时间误差 < 150毫秒`: **Perfect** 完美（100分 + 极高连击倍率奖励）。
  - `距离 < 75px` 且 `时间误差 < 250毫秒`: **Good** 良好（50分 + 连击增加）。
  - 范围之外: **Miss** 漏击（连击归零，视觉闪光中断）。
- **障碍物互动**: 横向防守墙要求玩家必须物理“下蹲”（平均肩膀 Y 坐标由于下蹲而降低，超过标定阈值）或者做左右体感闪避。

---

## 5. 视觉设计语言 (Visual Design Language)

应用采用深邃高对比度的暗色调赛博朋克/电竞游戏风格，营造出非凡的极客氛围：
- **基础画布**: 纯黑至深灰暗曜底色（`#050505`），带有精致细密的科技网格。
- **色彩规范 (Color Palette)**:
  - 左侧节奏音符/激光: 霓虹玫瑰红 (`#f43f5e`, `rose-500`)
  - 右侧节奏音符/激光: 极光紫 (`#a78bfa`, `violet-400`)
  - 障碍物/闪避墙: 警告极光橙 (`#f43f5e`, 炫彩渐变)
- **粒子喷射系统**: 目标击碎时炸裂出极具弹性的同心霓虹圆圈与散射火花，反馈卓越。
- **动效库**: 搭载 `motion/react` 开发优雅的渐入加载和流畅的视口切换动画。

---

## 6. 项目组件结构树 (Project Component Tree)

```
src/
├── main.tsx                # 应用程序启动入口
├── App.tsx                 # 核心游戏状态协调机 (游戏关卡状态、大框架控制)
├── index.css               # 全局 Tailwind CSS + 赛博字体与霓虹主题包
├── types.ts                # 严格的 TypeScript 属性定义（音符数据、轨道、玩家关节骨架等）
├─┬ lib/
│ └── audioEngine.ts        # 合成器引擎、定时前瞻音效生成器、交互反馈模块
└─┬ components/
  ├── Dashboard.tsx         # 歌曲面板、最高分龙虎榜、体感新手入门设置
  ├── PoseTracker.tsx       # Webcam 绑定以及基于 AI MediaPipe 的姿态捕捉层
  ├── GameCanvas.tsx        # 极致渲染的 Canvas 交互帧、碰撞引擎、时空坐标转换
  └── Calibration.tsx       # 可交互式新手体感身高标定向导
```

---

## 7. 模块化构建历程 (Implementation Milestones)

1. **第一阶段：骨架配置与环境搭设 (Basic Scaffolding & Setup)**
   - 填写并校正 `metadata.json` 的摄像头及传感器权限。
   - 定义标准的 `types.ts`。
2. **第二阶段：实时 Web Audio 合成器开发 (Live Web Audio Synthesizer)**
   - 开发 `audioEngine.ts` 控制高精度 BPM 循环、振荡器频率和声波包络，拒绝加载外部慢速 mp3。
3. **第三阶段：体感算法与模拟器双工融合 (Camera & Pose Tracker)**
   - 适配 MediaPipe 姿态追踪逻辑，并构建 **键盘+鼠标多重键鼠模拟核心**，在系统无摄像头时优雅切换至无需摄像头的鼠标指尖滑动与空格键下蹲。
4. **第四阶段：碰撞算法与 Canvas 双级渲染 (Core Gameplay Logic & Canvas)**
   - 开发 `GameCanvas.tsx` 提供精准的距离和时间段碰撞比对，并动态输出骨架运动残影与粒子火花。
5. **第五阶段：沉浸感包装与性能优化 (Refinement, Polish & Visual Styling)**
   - 全面重写卡片阴影、外边框与背光，应用深色透射毛玻璃效果（Glassmorphism），使产品具备极致的高级工艺美。
