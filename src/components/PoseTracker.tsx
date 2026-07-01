/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useRef, useState } from 'react';
import { Camera, RefreshCw, AlertCircle, Sparkles, Keyboard } from 'lucide-react';
import { PoseData, Keypoint } from '../types';
import { translations } from '../lib/translations';

// Global Singleton Manager to keep the camera stream and MediaPipe Pose instance alive
// across mounts/unmounts, eliminating camera release deadlock and speeding up level transitions.
class GlobalPoseManager {
  private videoElement: HTMLVideoElement | null = null;
  private cameraInstance: any = null;
  private poseInstance: any = null;
  
  public isInitialized = false;
  public isLoading = false;
  public loadingProgress = '';
  public errorMsg: string | null = null;
  public fps = 0;
  
  private activeCanvas: HTMLCanvasElement | null = null;
  private activeCallback: ((pose: PoseData) => void) | null = null;
  private isCalibrating = false;
  private neutralY = 0.5;
  private crouchThreshold = 0.65;
  private lastFpsUpdate = performance.now();
  private frameCount = 0;

  private stateListeners: Set<(state: any) => void> = new Set();

  public register(
    canvas: HTMLCanvasElement, 
    callback: (pose: PoseData) => void,
    isCalibrating: boolean,
    neutralY: number,
    crouchThreshold: number
  ) {
    this.activeCanvas = canvas;
    this.activeCallback = callback;
    this.isCalibrating = isCalibrating;
    this.neutralY = neutralY;
    this.crouchThreshold = crouchThreshold;
  }

  public unregister() {
    this.activeCanvas = null;
    this.activeCallback = null;
  }

  public updateConfig(isCalibrating: boolean, neutralY: number, crouchThreshold: number) {
    this.isCalibrating = isCalibrating;
    this.neutralY = neutralY;
    this.crouchThreshold = crouchThreshold;
  }

  public addStateListener(listener: (state: any) => void) {
    this.stateListeners.add(listener);
    listener(this.getState());
  }

  public removeStateListener(listener: (state: any) => void) {
    this.stateListeners.delete(listener);
  }

  private notify() {
    const state = this.getState();
    this.stateListeners.forEach(listener => listener(state));
  }

  private getState() {
    return {
      isInitialized: this.isInitialized,
      isLoading: this.isLoading,
      loadingProgress: this.loadingProgress,
      errorMsg: this.errorMsg,
      fps: this.fps,
    };
  }

  private loadScript(src: string): Promise<void> {
    return new Promise((resolve, reject) => {
      if (document.querySelector(`script[src="${src}"]`)) {
        resolve();
        return;
      }
      const script = document.createElement('script');
      script.src = src;
      script.async = true;
      script.onload = () => resolve();
      script.onerror = () => reject(new Error(`Failed to load ${src}`));
      document.head.appendChild(script);
    });
  }

  public async initialize(t: any) {
    if (this.isInitialized || this.isLoading) return;
    
    this.isLoading = true;
    this.loadingProgress = t.loadingCamera;
    this.notify();

    try {
      if (!this.videoElement) {
        this.videoElement = document.createElement('video');
        this.videoElement.width = 640;
        this.videoElement.height = 480;
        this.videoElement.setAttribute('playsinline', 'true');
        this.videoElement.muted = true;
      }

      this.loadingProgress = t.loadingCDNScripts;
      this.notify();

      if (!(window as any).Camera) {
        await this.loadScript('https://cdn.jsdelivr.net/npm/@mediapipe/camera_utils/camera_utils.js');
      }
      if (!(window as any).Hands) {
        await this.loadScript('https://cdn.jsdelivr.net/npm/@mediapipe/hands/hands.js');
      }

      this.loadingProgress = t.initializingML;
      this.notify();

      const HandsObj = (window as any).Hands;
      if (!HandsObj) {
        throw new Error('MediaPipe Hands library is missing');
      }

      this.poseInstance = new HandsObj({
        locateFile: (file: string) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`,
      });

      this.poseInstance.setOptions({
        maxNumHands: 2,
        modelComplexity: 1,
        minDetectionConfidence: 0.5,
        minTrackingConfidence: 0.5,
      });

      this.poseInstance.onResults((results: any) => {
        this.frameCount++;
        const now = performance.now();
        if (now - this.lastFpsUpdate >= 1000) {
          this.fps = Math.round((this.frameCount * 1000) / (now - this.lastFpsUpdate));
          this.frameCount = 0;
          this.lastFpsUpdate = now;
          this.notify();
        }

        this.processLandmarks(results);
      });

      this.loadingProgress = t.checkingDevices;
      this.notify();

      if (typeof navigator === 'undefined' || !navigator.mediaDevices) {
        throw new Error('Browser does not support media device capture.');
      }
      
      const devices = await navigator.mediaDevices.enumerateDevices().catch(() => []);
      const hasVideoDevice = devices.some(device => device.kind === 'videoinput');
      if (!hasVideoDevice) {
        throw new Error('NotFoundError: No webcam detected.');
      }

      this.loadingProgress = t.requestingWebcam;
      this.notify();

      // Pre-check getUserMedia once
      const tempStream = await navigator.mediaDevices.getUserMedia({ video: { width: 640, height: 480 } });
      tempStream.getTracks().forEach(track => track.stop());

      const CameraObj = (window as any).Camera;
      if (!CameraObj) {
        throw new Error('Camera helper script not loaded');
      }

      this.cameraInstance = new CameraObj(this.videoElement, {
        onFrame: async () => {
          // Only process frames when there's an active registered listener (saves CPU in lobby)
          if (this.isInitialized && this.activeCallback) {
            try {
              await this.poseInstance.send({ image: this.videoElement! });
            } catch (err) {}
          }
        },
        width: 640,
        height: 480,
      });

      await this.cameraInstance.start();
      
      this.isInitialized = true;
      this.isLoading = false;
      this.notify();
    } catch (err: any) {
      console.warn('Global camera initialization failed:', err);
      const errorStr = err?.message || String(err);
      if (errorStr.includes('NotFoundError') || errorStr.includes('webcam')) {
        this.errorMsg = t.errNoCamera;
      } else if (errorStr.includes('NotAllowedError') || errorStr.includes('permission')) {
        this.errorMsg = t.errCameraDenied;
      } else {
        this.errorMsg = t.errCameraFailed.replace('{error}', errorStr);
      }
      this.isLoading = false;
      this.notify();
    }
  }

  private processLandmarks(results: any) {
    if (!this.activeCallback || !this.activeCanvas) return;
    
    const canvas = this.activeCanvas;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    const width = canvas.width;
    const height = canvas.height;

    ctx.clearRect(0, 0, width, height);

    if (results.image) {
      ctx.save();
      ctx.scale(-1, 1);
      ctx.drawImage(results.image, -width, 0, width, height);
      ctx.restore();
    } else {
      ctx.fillStyle = '#0f172a';
      ctx.fillRect(0, 0, width, height);
    }

    const poseData: PoseData = {};
    let maxHandY = 0.4;

    const HAND_CONNECTIONS = [
      [0, 1], [1, 2], [2, 3], [3, 4], // Thumb
      [0, 5], [5, 6], [6, 7], [7, 8], // Index
      [0, 9], [9, 10], [10, 11], [11, 12], // Middle
      [0, 13], [13, 14], [14, 15], [15, 16], // Ring
      [0, 17], [17, 18], [18, 19], [19, 20], // Pinky
      [5, 9], [9, 13], [13, 17], [0, 5], [0, 17] // Palm
    ];

    if (results.multiHandLandmarks && results.multiHandedness) {
      for (let i = 0; i < results.multiHandLandmarks.length; i++) {
        const landmarks = results.multiHandLandmarks[i];
        const handedness = results.multiHandedness[i];
        if (!handedness) continue;

        const isRight = (handedness.label || handedness.categoryName) === 'Right';
        const color = isRight ? '#f43f5e' : '#a78bfa'; // Right hand (screen left) = Rose/Red, Left hand (screen right) = Violet/Cyan

        ctx.strokeStyle = color;
        ctx.fillStyle = color;
        ctx.lineWidth = 3;

        // Draw connections
        ctx.beginPath();
        for (const [start, end] of HAND_CONNECTIONS) {
          const p1 = landmarks[start];
          const p2 = landmarks[end];
          if (!p1 || !p2) continue;
          ctx.moveTo((1 - p1.x) * width, p1.y * height);
          ctx.lineTo((1 - p2.x) * width, p2.y * height);
        }
        ctx.stroke();

        // Draw joints
        for (const lm of landmarks) {
          ctx.beginPath();
          ctx.arc((1 - lm.x) * width, lm.y * height, 4, 0, 2 * Math.PI);
          ctx.fill();
        }

        // Highlight index finger tip (Saber point) - Landmark 8
        const tip = landmarks[8];
        if (tip) {
          ctx.beginPath();
          ctx.fillStyle = '#ffffff';
          ctx.shadowColor = color;
          ctx.shadowBlur = 10;
          ctx.arc((1 - tip.x) * width, tip.y * height, 8, 0, 2 * Math.PI);
          ctx.fill();
          ctx.shadowBlur = 0;

          const keypoint: Keypoint = {
            x: 1 - tip.x,
            y: tip.y,
            score: 1.0,
          };

          if (isRight) {
            poseData.leftWrist = keypoint; // Physical right hand -> left side of screen -> left saber
          } else {
            poseData.rightWrist = keypoint; // Physical left hand -> right side of screen -> right saber
          }

          maxHandY = Math.max(maxHandY, tip.y);
        }
      }
    }

    // Set virtual nose coordinate for crouching
    poseData.nose = {
      x: 0.5,
      y: maxHandY > 0.82 ? 0.85 : 0.4,
      score: 1.0,
    };

    this.activeCallback(poseData);
    drawSkeletonHelper(ctx, poseData, width, height, this.isCalibrating, this.neutralY, this.crouchThreshold);
  }
}

// Global singleton webcam tracking manager
const globalPoseManager = new GlobalPoseManager();

// Helper to draw skeletal elements on local canvas
function drawSkeletonHelper(
  ctx: CanvasRenderingContext2D,
  pose: PoseData,
  width: number,
  height: number,
  isCalibrating: boolean,
  neutralY: number,
  crouchThreshold: number
) {
  // Check if player nose is currently below threshold (ducking)
  const nose = pose.nose;
  if (nose && nose.y > crouchThreshold) {
    // Draw green glow frame at borders
    ctx.strokeStyle = '#10b981';
    ctx.lineWidth = 8;
    ctx.strokeRect(0, 0, width, height);
  }

  if (isCalibrating) {
    ctx.beginPath();
    ctx.moveTo(0, neutralY * height);
    ctx.lineTo(width, neutralY * height);
    ctx.strokeStyle = 'rgba(16, 185, 129, 0.4)';
    ctx.lineWidth = 2;
    ctx.setLineDash([8, 4]);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = 'rgba(16, 185, 129, 0.8)';
    ctx.font = '10px monospace';
    ctx.fillText('CALIBRATED HEAD LEVEL', 15, neutralY * height - 8);

    ctx.beginPath();
    ctx.moveTo(0, crouchThreshold * height);
    ctx.lineTo(width, crouchThreshold * height);
    ctx.strokeStyle = 'rgba(239, 68, 68, 0.4)';
    ctx.lineWidth = 2;
    ctx.setLineDash([8, 4]);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = 'rgba(239, 68, 68, 0.8)';
    ctx.fillText('CROUCH ESCAPE LINE', 15, crouchThreshold * height - 8);
  }
}

interface PoseTrackerProps {
  onPoseDetected: (pose: PoseData) => void;
  isCalibrating: boolean;
  neutralY?: number;
  crouchThreshold?: number;
  simulationMode: boolean;
  setSimulationMode: (value: boolean) => void;
  lang: 'en' | 'zh';
}

export default function PoseTracker({
  onPoseDetected,
  isCalibrating,
  neutralY = 0.5,
  crouchThreshold = 0.65,
  simulationMode,
  setSimulationMode,
  lang,
}: PoseTrackerProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const mouseCoords = useRef({ x: 0.5, y: 0.5 });
  const t = translations[lang];

  // Subscribe to global manager states
  const [managerState, setManagerState] = useState(() => ({
    isInitialized: globalPoseManager.isInitialized,
    isLoading: globalPoseManager.isLoading,
    loadingProgress: globalPoseManager.loadingProgress || t.loadingCamera,
    errorMsg: globalPoseManager.errorMsg,
    fps: globalPoseManager.fps,
  }));

  const loading = managerState.isLoading || (!managerState.isInitialized && !simulationMode && !managerState.errorMsg);
  const loadingProgress = managerState.loadingProgress;
  const errorMsg = managerState.errorMsg;
  const fps = managerState.fps;

  // Sync state changes with the global singleton manager
  useEffect(() => {
    const handleStateChange = (state: any) => {
      setManagerState(state);
      if (state.errorMsg && !simulationMode) {
        setSimulationMode(true);
      }
    };
    globalPoseManager.addStateListener(handleStateChange);
    return () => {
      globalPoseManager.removeStateListener(handleStateChange);
    };
  }, [simulationMode, setSimulationMode]);

  // Lazy initialize global camera once
  useEffect(() => {
    if (!simulationMode) {
      globalPoseManager.initialize(t);
    }
  }, [simulationMode, t]);

  // Register canvas & callback when mounted, unregister on unmount
  useEffect(() => {
    if (simulationMode || !canvasRef.current) {
      globalPoseManager.unregister();
      return;
    }

    globalPoseManager.register(
      canvasRef.current,
      onPoseDetected,
      isCalibrating,
      neutralY,
      crouchThreshold
    );

    return () => {
      globalPoseManager.unregister();
    };
  }, [simulationMode, onPoseDetected, isCalibrating, neutralY, crouchThreshold]);

  // Fallback Simulation Handler
  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!simulationMode) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width;
    const y = (e.clientY - rect.top) / rect.height;

    mouseCoords.current = { x, y };

    const simulatedPose: PoseData = {
      leftWrist: {
        x: x < 0.5 ? x : 0.25,
        y: y,
        score: 1.0,
      },
      rightWrist: {
        x: x >= 0.5 ? x : 0.75,
        y: y,
        score: 1.0,
      },
      nose: {
        x: 0.5,
        y: y > 0.75 ? 0.8 : 0.4,
        score: 1.0,
      },
      leftShoulder: { x: 0.4, y: 0.4, score: 1.0 },
      rightShoulder: { x: 0.6, y: 0.4, score: 1.0 },
    };

    onPoseDetected(simulatedPose);

    // Manual canvas render for simulation mode
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    // Grid cyber glow lines
    ctx.strokeStyle = 'rgba(0, 240, 255, 0.05)';
    ctx.lineWidth = 1;
    for (let i = 0; i < canvas.width; i += 40) {
      ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, canvas.height); ctx.stroke();
    }
    for (let i = 0; i < canvas.height; i += 40) {
      ctx.beginPath(); ctx.moveTo(0, i); ctx.lineTo(canvas.width, i); ctx.stroke();
    }

    drawSkeletonHelper(ctx, simulatedPose, canvas.width, canvas.height, isCalibrating, neutralY, crouchThreshold);
  };

  // Keyboard Simulation crouches
  useEffect(() => {
    if (!simulationMode) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Space' || e.code === 'KeyS' || e.code === 'ArrowDown') {
        const simulatedPose: PoseData = {
          leftWrist: { x: 0.25, y: 0.5, score: 1.0 },
          rightWrist: { x: 0.75, y: 0.5, score: 1.0 },
          nose: { x: 0.5, y: 0.85, score: 1.0 },
          leftShoulder: { x: 0.4, y: 0.7, score: 1.0 },
          rightShoulder: { x: 0.6, y: 0.7, score: 1.0 },
        };
        onPoseDetected(simulatedPose);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [simulationMode, onPoseDetected]);

  return (
    <div id="pose-tracker-container" className="relative flex flex-col items-center bg-black/20 border border-white/10 rounded-2xl overflow-hidden p-4 shadow-2xl h-full justify-center min-h-[360px]">
      <div 
        className={`relative aspect-[4/3] w-full max-w-md bg-black rounded-2xl overflow-hidden border border-white/10 select-none ${
          simulationMode ? 'cursor-crosshair' : ''
        }`}
        onMouseMove={handleMouseMove}
      >
        <canvas
          ref={canvasRef}
          width={640}
          height={480}
          className="w-full h-full object-cover"
        />

        {/* Loading Spinner Overlays */}
        {loading && !simulationMode && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/90 z-20 p-6 text-center">
            <RefreshCw className="w-10 h-10 text-violet-400 animate-spin mb-4" />
            <h3 className="text-white font-medium text-lg mb-2">{t.connectingCamera}</h3>
            <p className="text-white/60 text-sm">{loadingProgress}</p>
            <button 
              type="button"
              onClick={() => {
                setSimulationMode(true);
              }}
              className="mt-6 flex items-center gap-2 bg-violet-600/30 hover:bg-violet-600/50 border border-violet-500/50 transition px-4 py-2.5 rounded-full text-xs font-semibold text-white cursor-pointer"
            >
              <Keyboard className="w-4 h-4" /> {t.instantSimulation}
            </button>
          </div>
        )}

        {/* Error notification banner */}
        {errorMsg && (
          <div className="absolute top-2 left-2 right-2 flex items-center gap-2 bg-rose-950/90 border border-rose-500/50 p-3 rounded-xl z-10 text-rose-200 text-xs">
            <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
            <div className="flex-1 text-left line-clamp-2 leading-relaxed font-sans">{errorMsg}</div>
          </div>
        )}

        {/* HUD Overlay Stats */}
        <div className="absolute bottom-3 left-3 right-3 flex items-center justify-between pointer-events-none z-10 transition">
          <div className="flex items-center gap-1.5 bg-black/80 backdrop-blur-md px-3 py-1 rounded-md text-[9px] text-white/80 font-mono border border-white/10 shadow-lg">
            {!simulationMode ? (
              <>
                <Camera className="w-3 text-emerald-400 animate-pulse" />
                <span>{t.cameraSkeleton} <span className="text-emerald-400 font-semibold">{fps} FPS</span></span>
              </>
            ) : (
              <>
                <Keyboard className="w-3 text-violet-400" />
                <span>{t.simulatorActive}</span>
              </>
            )}
          </div>

          <div className="bg-black/80 backdrop-blur-md px-3 py-1 rounded-md text-[9px] text-white/80 font-mono border border-white/10 shadow-lg">
            RESO: 640x480
          </div>
        </div>

        {/* Corner Accents */}
        <div className="absolute top-0 left-0 w-6 h-6 border-t-2 border-l-2 border-white/20 m-3"></div>
        <div className="absolute top-0 right-0 w-6 h-6 border-t-2 border-r-2 border-white/20 m-3"></div>
        <div className="absolute bottom-0 left-0 w-6 h-6 border-b-2 border-l-2 border-white/20 m-3"></div>
        <div className="absolute bottom-0 right-0 w-6 h-6 border-b-2 border-r-2 border-white/20 m-3"></div>
      </div>

      {/* Info / Calibration Controls */}
      <div className="w-full max-w-md mt-4 space-y-2.5">
        <div className="flex gap-2">
          {simulationMode ? (
            <div className="flex-1 bg-violet-950/20 border border-violet-800/20 rounded-xl p-3 text-xs text-violet-200">
              <div className="font-semibold font-mono uppercase tracking-wider flex items-center gap-1 mb-1 text-violet-300">
                <Sparkles className="w-3.5 h-3.5" /> {t.simulationControls}
              </div>
              <ul className="list-disc list-inside text-left space-y-1 pl-1 text-[11px] opacity-80 leading-relaxed font-sans">
                <li>{t.simulationDesc1}</li>
                <li>{t.simulationDesc2}</li>
              </ul>
            </div>
          ) : (
            <div className="flex-1 bg-emerald-950/10 border border-emerald-900/20 rounded-xl p-3 text-xs text-emerald-200">
              <div className="font-semibold font-mono uppercase tracking-wider flex items-center gap-1 mb-1 text-emerald-300">
                💡 {t.realCameraTips}
              </div>
              <ul className="list-disc list-inside text-left space-y-1 pl-1 text-[11px] opacity-80 leading-relaxed font-sans">
                <li>{t.cameraTip1}</li>
                <li>{t.cameraTip2}</li>
              </ul>
            </div>
          )}
        </div>

        <button 
          onClick={() => setSimulationMode(!simulationMode)}
          className={`w-full py-2 px-4 rounded-full text-xs font-semibold cursor-pointer transition flex items-center justify-center gap-2 border ${
            simulationMode 
              ? 'bg-emerald-600/10 text-emerald-300 border-emerald-500/20 hover:bg-emerald-600/20' 
              : 'bg-violet-600/10 text-violet-300 border-violet-500/20 hover:bg-violet-600/20'
          }`}
        >
          {simulationMode ? '🔌 ' + t.attemptCamera : '⌨️ ' + t.forceSimulation}
        </button>
      </div>
    </div>
  );
}
