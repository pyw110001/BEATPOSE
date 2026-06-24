# Beat Pose Rhythm - Specification Kit & Implementation Plan

This document details the architecture, design patterns, and implementation plan for building **Beat Pose Rhythm**, a real-time, camera-powered rhythm game based on pose estimation, inspired by Charlie Gerard's `beat-pose` project.

---

## 1. Technical Architecture Overview

The system is designed with a highly modular full-stack client-side model using **React**, **Vite**, **Tailwind CSS**, and **Motion**, running fully inside the browser without high-latency backend servers.

```
┌────────────────────────────────────────────────────────────────────────┐
│                              Application                              │
├───────────────────┬───────────────────┬────────────────────────────────┤
│    Audio Engine   │    Tracking Core  │           Game Loop            │
│  (Web Audio Synth)│ (MediaPipe Pose)  │    (Collision & Coordinates)   │
└─────────┬─────────┴─────────┬─────────┴───────────────┬────────────────┘
          │                   │                         │
          ▼                   ▼                         ▼
  Pixel-Perfect Beats   User Body Skeleton       Target Hits (Score)
```

### Key Modules:
1. **Pose Tracker Module (`/src/components/PoseTracker.tsx`)**: Controls camera initialization, dynamically loads the MediaPipe Pose SDK, executes real-time inference on the webcam canvas, and returns canvas coordinates of keypoints (e.g., nose, left wrist, right wrist, hips).
2. **Audio Synthesis Engine (`/src/lib/audioEngine.ts`)**: Integrates the **Web Audio API** to generate high-fidelity, highly synchronized electronic rhythm patterns (BPM-controlled kicks, snare hits, hats, bass synth loops) on-the-fly. Generates absolute beat triggers with zero network load.
3. **Core Game Loop & Canvas (`/src/components/GameCanvas.tsx`)**: Manages the visual rendering of spawning beat-blocks, moving notes, obstacles, skeleton overlays, sparks/hit effects, and performs bounding-sphere collision checks against tracked user nodes.
4. **Interactive Dashboard (`/src/components/Dashboard.tsx`)**: Manages difficulty preferences, high scores, track selection screens, user calibration, and instructions.

---

## 2. Pose Detection Strategy

To prevent heavy local node dependencies and frame lag, we leverage the **MediaPipe Pose SDK v0.5** loaded dynamically via jsDelivr CDN.

### Key Points Tracked:
- **`left_wrist` (Point 15)** & **`right_wrist` (Point 16)**: Act as user's "sabers" or controllers for hitting beats.
- **`left_shoulder` (Point 11)**, **`right_shoulder` (Point 12)**, **`nose` (Point 0)**: Used collectively to determine head tilt/crouches for avoiding obstacle walls.

### Model Performance Optimizations:
- **Responsive Sizing**: Camera dimensions are bound to a standard 640x480 resolution (or fitted responsively) mapping directly to a 2D viewport coordinates system, reducing processing requirements.
- **Smoothing & Confidence**: `modelComplexity: 1` ensures rapid-fire frame rates (~30-60 FPS) on standard laptops and mobile devices, with `minDetectionConfidence: 0.5` safeguarding against noise.

---

## 3. Rhythm & Audio Audio Synthesis (BPM Synced)

Rather than calling external audio files which are prone to buffering delay, cross-origin blocking, or copyright expiration, we build an audio engine using **Web Audio API**:

- **BPM Synchronizer**: Operates via a robust look-ahead scheduler running in a Web Audio Context, queuing synthesizers exact to the millisecond.
- **Track Presets**:
  - **Synthwave Pulse (110 BPM)**: Low-end fat synth bass + punchy kick + spatial laser highlights.
  - **Cyberpunk Techno (135 BPM)**: Aggressive driving acid bass + rapid double snare hits.
  - **Ambient Neon (85 BPM)**: Ethereal chill filters + long pad chords + soft woodblocks.
- **Interactive Audio Feedback**: Successes trigger a crisp synthesized "zap/clap" noise; failures trigger a low pitch sweep (miss).

---

## 4. Gameplay & Coordinate Collision Detection

```
           Beat Note [x, y, radius]
                    ▼
          ( d = √((x₂-x₁)² + (y₂-y₁)²) ) ◄─── Compare distance (d) with threshold
                    ▲
          Left/Right Wrist [x, y]
```

- **Collision Detection**: Every visual frame, we compute the Euclidean distance between the user's active wrists and the position of current on-screen beat targets.
- **Hit Windows**:
  - `distance < 45px` and `time_delta < 150ms`: **Perfect** (100 pts + multiplier increase).
  - `distance < 75px` and `time_delta < 250ms`: **Good** (50 pts).
  - Outside bounds: **Miss** (Combo reset, loss of visual streak).
- **Interactive Obstacles**: Vertical barriers require user to "crouch" (average shoulder Y coordinate drops below a calibration threshold) or dodge left/right (nose X coordinate shifts).

---

## 5. Visual Design Language (Cyber-Neon Theme)

The application utilizes an immersive, high-contrast dark gaming atmosphere to mimic an arcade feel:
- **Base Canvas**: Off-black/pitch-dark slate with subtle glowing grids.
- **Color Palette**:
  - Left Beats: Neon Magenta (`#ff007f`)
  - Right Beats: Brilliant Cyan (`#00f0ff`)
  - Obstacles/Dodges: Radiant Amber (`#ffaa00`)
- **Particle System**: Exploding circular neon rings and sparks upon a successful hit, reinforcing gaming satisfaction.
- **Animations**: Fluid staggered menus using custom curves from `motion/react`.

---

## 6. Project Component Tree

```
src/
├── main.tsx                # App bootstrap
├── App.tsx                 # Core game coordinator (State machine, layouts)
├── index.css               # Tailwind & font custom integrations
├── types.ts                # Strict TypeScript typings for beats, track, and keypoints
├─┬ lib/
│ └── audioEngine.ts        # Synth engine, Look-ahead sequencer, audio effects
└─┬ components/
  ├── Dashboard.tsx         # Track picker, high scores, and onboarding settings
  ├── PoseTracker.tsx       # Webcam hook & skeleton tracking layer
  ├── GameCanvas.tsx        # High-performance collision check and game visualizers
  └── Calibration.tsx       # Interactive step-by-step camera helper
```

---

## 7. Implementation Milestones

1. **Phase 1: Basic Scaffolding & Setup**
   - Update `metadata.json` with permissions and descriptive tags.
   - Setup `types.ts` defining tracks, beats, game status, and configurations.
2. **Phase 2: Build Live Web Audio Synthesizer**
   - Implement `audioEngine.ts` scheduling precise 4/4 beats, synth oscillators, filters, and dynamic track generators.
3. **Phase 3: Setup Camera & Deep Learning Object Tracker**
   - Implement `PoseTracker.tsx` utilizing MediaPipe CDN. Ensure background fallback if no camera is authorized.
4. **Phase 4: Game Canvas & Core Gameplay Logic**
   - Implement `GameCanvas.tsx` to display flying targets, draw tracked wrist overlays, calculate distance checks, and trigger floating combat text/score increments.
5. **Phase 5: Refinement, Polish & Sound Design**
   - Style menus with elegant cyber-neon borders, glowing shadows, particle hit feedback, dashboard stats, and state transitions.
