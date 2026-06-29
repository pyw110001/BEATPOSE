/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useRef, useState } from 'react';
import { SongTrack, PoseData, BeatNote, CalibrationData, GameStats } from '../types';
import { gameAudioEngine } from '../lib/audioEngine';
import { translations } from '../lib/translations';
import Strands from './Strands';
import Galaxy from './Galaxy';
import CyberTunnel from './CyberTunnel';
import Hyperspeed from './Hyperspeed';


const HYPERSPEED_OPTIONS = {
  distortion: 'centeredTurbulentDistortion',
  length: 400,
  roadWidth: 10,
  islandWidth: 2,
  lanesPerRoad: 3,
  fov: 90,
  fovSpeedUp: 150,
  speedUp: 2.5,
  carLightsFade: 0.4,
  totalSideLightSticks: 20,
  lightPairsPerRoadWay: 40,
  shoulderLinesWidthPercentage: 0.05,
  brokenLinesWidthPercentage: 0.1,
  brokenLinesLengthPercentage: 0.5,
  lightStickWidth: [0.12, 0.5],
  lightStickHeight: [1.3, 1.7],
  movingAwaySpeed: [60, 80],
  movingCloserSpeed: [-120, -160],
  carLightsLength: [12, 80],
  carLightsRadius: [0.05, 0.14],
  carWidthPercentage: [0.3, 0.5],
  carShiftX: [-0.8, 0.8],
  carFloorSeparation: [0, 5],
  colors: {
    roadColor: 0x080808,
    islandColor: 0x0a0a0a,
    background: 0x000000,
    shoulderLines: 0x38bdf8,
    brokenLines: 0x7c3aed,
    leftCars: [0xD856BF, 0x6750A2, 0xC247AC],
    rightCars: [0x03B3C3, 0x0E5EA5, 0x324555],
    sticks: 0x03B3C3
  }
};

interface GameCanvasProps {
  track: SongTrack;
  currentTime: number;
  poseData: PoseData;
  onScoreUpdate: (rating: 'Perfect' | 'Good' | 'Miss', type: 'left' | 'right' | 'crouch') => void;
  calibration: CalibrationData;
  isPlaying: boolean;
  onTrackFinished: () => void;
  lang: 'en' | 'zh';
  combo: number;
}

interface AmbientParticle {
  x: number;
  y: number;
  size: number;
  speedX: number;
  speedY: number;
  color: string;
  angle: number;
  angleSpeed: number;
}

interface Particle {
  id: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  color: string;
  alpha: number;
  size: number;
}

interface FloatingText {
  id: string;
  text: string;
  color: string;
  x: number;
  y: number;
  alpha: number;
  fontSize?: number;
  decayRate?: number;
}

interface HitBurst {
  id: string;
  x: number;
  y: number;
  color1: string;
  color2: string;
  progress: number;
  isPerfect: boolean;
}

function interpolateColor(color1: string, color2: string, factor: number): string {
  const parseHex = (c: string) => {
    const hex = c.replace('#', '');
    const r = parseInt(hex.substring(0, 2), 16);
    const g = parseInt(hex.substring(2, 4), 16);
    const b = parseInt(hex.substring(4, 6), 16);
    return { r, g, b };
  };

  try {
    const c1 = parseHex(color1);
    const c2 = parseHex(color2);
    const r = Math.round(c1.r + (c2.r - c1.r) * factor);
    const g = Math.round(c1.g + (c2.g - c1.g) * factor);
    const b = Math.round(c1.b + (c2.b - c1.b) * factor);
    return `rgb(${r}, ${g}, ${b})`;
  } catch (e) {
    return color1;
  }
}

function getNoteTrack(note: BeatNote): { trackIdx: number; endX: number; endY: number } {
  let trackIdx = 1; // 0 = Top, 1 = Middle, 2 = Bottom
  if (note.y < 0.4) {
    trackIdx = 0;
  } else if (note.y > 0.6) {
    trackIdx = 2;
  }

  let endX = 0.5;
  let endY = 0.5;

  if (note.type === 'left') {
    if (trackIdx === 0) {
      endX = 0.24;
      endY = 0.24;
    } else if (trackIdx === 1) {
      endX = 0.16;
      endY = 0.5;
    } else {
      endX = 0.24;
      endY = 0.76;
    }
  } else if (note.type === 'right') {
    if (trackIdx === 0) {
      endX = 0.76;
      endY = 0.24;
    } else if (trackIdx === 1) {
      endX = 0.84;
      endY = 0.5;
    } else {
      endX = 0.76;
      endY = 0.76;
    }
  } else {
    // Crouch note (goes straight down center)
    endX = 0.5;
    endY = 0.82;
  }

  return { trackIdx, endX, endY };
}

function smoothstep(min: number, max: number, value: number): number {
  const x = Math.max(0, Math.min(1, (value - min) / (max - min)));
  return x * x * (3 - 2 * x);
}

const drawFadingArc2D = (
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  radius: number,
  startAngle: number,
  endAngle: number,
  color: string,
  thickness: number,
  shadowBlurVal: number
) => {
  const steps = 12;
  const angleSpan = endAngle - startAngle;
  const stepAngle = angleSpan / steps;

  for (let s = 0; s < steps; s++) {
    const a1 = startAngle + s * stepAngle;
    const a2 = a1 + stepAngle;
    
    // Sine wave fading (bright in the middle, fading to 0 at the ends)
    const t = (s + 0.5) / steps;
    const alpha = Math.sin(t * Math.PI); // 0 -> 1 -> 0

    ctx.save();
    ctx.globalAlpha = ctx.globalAlpha * alpha;
    ctx.beginPath();
    ctx.arc(x, y, radius, a1, a2);
    ctx.strokeStyle = color;
    // Taper the thickness as well for a smoother look
    ctx.lineWidth = thickness * (0.3 + 0.7 * alpha);
    
    if (shadowBlurVal > 0) {
      ctx.shadowColor = color;
      ctx.shadowBlur = shadowBlurVal * alpha;
    }
    
    ctx.stroke();
    ctx.restore();
  }
};

const drawMagicRings2D = (
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  baseRadius: number,
  color1: string,
  color2: string,
  time: number,
  opacity: number,
  pulse: number
) => {
  const ringCount = 4;
  const radiusStep = 10;
  const baseThickness = 2.2;

  ctx.save();
  ctx.globalAlpha = opacity;

  for (let i = 0; i < ringCount; i++) {
    const radius = baseRadius + i * radiusStep + pulse * (10 + i * 4);
    const thickness = (baseThickness - i * 0.3) * (1.0 + pulse * 1.5);
    
    const colorFactor = i / (ringCount - 1);
    const ringColor = interpolateColor(color1, color2, colorFactor);

    const rotationSpeed = (0.5 + (ringCount - i) * 0.15);
    const rotationDir = i % 2 === 0 ? 1 : -1;
    const angleOffset = time * rotationSpeed * rotationDir;

    const arcLength = (Math.PI * 0.7) - (i * 0.08);
    const shadowBlurVal = 10 + pulse * 8;

    drawFadingArc2D(
      ctx,
      x,
      y,
      radius,
      angleOffset,
      angleOffset + arcLength,
      ringColor,
      thickness,
      shadowBlurVal
    );

    drawFadingArc2D(
      ctx,
      x,
      y,
      radius,
      angleOffset + Math.PI,
      angleOffset + Math.PI + arcLength,
      ringColor,
      thickness,
      shadowBlurVal
    );
  }
  ctx.restore();
};


export default function GameCanvas({
  track,
  currentTime,
  poseData,
  onScoreUpdate,
  calibration,
  isPlaying,
  onTrackFinished,
  lang,
  combo,
}: GameCanvasProps) {
  const t = translations[lang];
  const containerRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const animationFrameRef = useRef<number | null>(null);

  // Maintain interactive list states via refs to bypass React render delay in game loops
  const beatsRef = useRef<BeatNote[]>([]);
  const particlesRef = useRef<Particle[]>([]);
  const floatingTextsRef = useRef<FloatingText[]>([]);
  const hitBurstsRef = useRef<HitBurst[]>([]);
  const finishedTriggeredRef = useRef(false);

  // Visual enhancement refs
  const gridPulseIntensityRef = useRef<number>(0);
  const lastFrameTimeRef = useRef<number>(performance.now());
  const ambientParticlesRef = useRef<AmbientParticle[]>([]);
  const missFlashIntensityRef = useRef<number>(0);
  const prevComboRef = useRef<number>(0);

  // Calibration references
  const crouchYThreshold = calibration.crouchYThreshold || 0.65;

  // Track changed -> load beats anew
  useEffect(() => {
    // Deep clone beats from track to avoid mutating source
    beatsRef.current = track.beats.map((b) => ({ ...b, hit: false, miss: false }));
    finishedTriggeredRef.current = false;
    particlesRef.current = [];
    floatingTextsRef.current = [];
    hitBurstsRef.current = [];
  }, [track]);

  // Main rendering & collision loops
  useEffect(() => {
    if (!isPlaying) {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
      return;
    }

    const runLoop = () => {
      const startTime = performance.now();
      renderGameFrames();
      const duration = performance.now() - startTime;

      if ((import.meta as any).env?.DEV && duration > 16.6) {
        console.warn(
          `[Performance Warning] GameCanvas frame render took ${duration.toFixed(2)}ms (Limit: 16.6ms for 60fps)`
        );
      }

      animationFrameRef.current = requestAnimationFrame(runLoop);
    };

    animationFrameRef.current = requestAnimationFrame(runLoop);

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [isPlaying, currentTime, poseData, calibration, combo]);

  // Watch combo changes to trigger milestone notifications
  useEffect(() => {
    if (combo > 0 && combo % 10 === 0 && combo !== prevComboRef.current) {
      // Trigger milestone text at center of canvas, glowing sky blue
      addFloatingText(`${combo} COMBO!`, '#38bdf8', 320, 140, 24, 0.008);
    }
    prevComboRef.current = combo;
  }, [combo]);

  // Push floating text indicator
  const addFloatingText = (
    text: string,
    color: string,
    x: number,
    y: number,
    fontSize?: number,
    decayRate?: number
  ) => {
    floatingTextsRef.current.push({
      id: Math.random().toString(),
      text,
      color,
      x,
      y,
      alpha: 1.0,
      fontSize,
      decayRate,
    });
  };

  // Push glowing spark particles in a radial blast explosion pattern
  // Push glowing spark particles in a radial blast explosion pattern
  const addHitParticles = (x: number, y: number, color: string, isPerfect: boolean) => {
    // Spawn Hit Burst Magic Rings
    let color1 = color;
    let color2 = '#ffffff';
    if (color === '#f43f5e') {
      color2 = '#fda4af';
    } else if (color === '#a78bfa') {
      color2 = '#67e8f9';
    } else if (color === '#f59e0b') {
      color2 = '#fde047';
    }

    hitBurstsRef.current.push({
      id: Math.random().toString(),
      x,
      y,
      color1,
      color2,
      progress: 0.0,
      isPerfect,
    });

    const fxIntensity = localStorage.getItem('game_fx_intensity') || 'high';
    const fxMultiplier = fxIntensity === 'high' ? 1.0 : fxIntensity === 'medium' ? 0.5 : 0.0;
    if (fxMultiplier === 0) return;

    const baseCount = isPerfect ? 16 : 8;
    const count = Math.round(baseCount * fxMultiplier);
    for (let i = 0; i < count; i++) {
      // Space angles evenly to form a radial blast, with slight random jitter
      const angle = (i / count) * Math.PI * 2 + (Math.random() - 0.5) * 0.15;
      // Fast, radial velocities
      const speed = isPerfect ? (3 + Math.random() * 6.5) : (2 + Math.random() * 4.5);
      particlesRef.current.push({
        id: Math.random().toString(),
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        color,
        alpha: 1.0,
        size: isPerfect ? (3.5 + Math.random() * 4) : (2.5 + Math.random() * 3),
      });
    }
  };

  // Helper to find the closest active note's target coordinate of a specific type (left/right)
  const getClosestActiveTarget = (type: 'left' | 'right', w: number, h: number) => {
    let closestNote: BeatNote | null = null;
    let minTimeDelta = Infinity;

    beatsRef.current.forEach((note) => {
      if (note.type === type && !note.hit && !note.miss) {
        const timeDelta = note.time - currentTime;
        if (timeDelta > -0.28 && timeDelta < minTimeDelta) {
          minTimeDelta = timeDelta;
          closestNote = note;
        }
      }
    });

    if (closestNote) {
      const { endX, endY } = getNoteTrack(closestNote);
      return {
        x: endX * w,
        y: endY * h,
      };
    }

    return {
      x: type === 'left' ? 0.16 * w : 0.84 * w,
      y: 0.5 * h,
    };
  };

  // Perform calculations and render on canvas
  const renderGameFrames = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const width = canvas.width;
    const height = canvas.height;

    // Calculate delta time (dt) for frame-rate independent visual animations/decay
    const now = performance.now();
    const dt = (now - lastFrameTimeRef.current) / 1000;
    lastFrameTimeRef.current = now;

    // Decay the grid Perfect-hit pulse intensity (decays to 0 in 250ms)
    if (gridPulseIntensityRef.current > 0) {
      gridPulseIntensityRef.current = Math.max(0, gridPulseIntensityRef.current - dt * 4.0);
    }

    // Decay the miss flash overlay (decays to 0 in 250ms)
    if (missFlashIntensityRef.current > 0) {
      missFlashIntensityRef.current = Math.max(0, missFlashIntensityRef.current - dt * 4.0);
    }

    // Grid BPM and dynamic approach time based on beats (default 4 beats)
    const bpm = track.bpm || 120;
    const approachBeats = 4;
    const approachSec = approachBeats * (60.0 / bpm);

    // Latency compensated Judge Time
    const inputLatencySec = track.beatGrid?.inputLatencySec || 0.0;
    const judgeTime = currentTime - inputLatencySec;

    // 1. Clear context with transparent background to let WebGL Strands show through
    ctx.clearRect(0, 0, width, height);

    // 2. Draw 3D-effect floor grid (disabled, replaced by WebGL Hyperspeed background)
    // drawGrid(ctx, width, height, combo);

    // 2.5 Draw ambient background particles (disabled in favor of WebGL Galaxy starfield)
    // drawAmbientParticles(ctx, width, height);

    // 3. Render calibration visual thresholds
    drawCalibrationGuides(ctx, width, height);

    // 4. Draw target guidelines connected to the closest active targets
    const leftTarget = getClosestActiveTarget('left', width, height);
    const rightTarget = getClosestActiveTarget('right', width, height);

    // Hover feedback from player's tracked controller nodes (dotted links)
    drawUserTargetLink(ctx, width, height, leftTarget.x, leftTarget.y, rightTarget.x, rightTarget.y);

    // 5. Check and render active spawning notes
    const activeBeats = beatsRef.current;
    
    // Check if track is completely finished
    if (activeBeats.length > 0 && currentTime >= track.duration + 1 && !finishedTriggeredRef.current) {
      finishedTriggeredRef.current = true;
      setTimeout(() => {
        onTrackFinished();
      }, 500);
    }

    activeBeats.forEach((note) => {
      // Delta time: positive is in the future, negative is passed
      const timeDelta = note.time - judgeTime;

      // Note is way in the future -> skip rendering
      if (timeDelta > approachSec) return;

      // Note has passed standard timing threshold and wasn't hit -> trigger automatic Miss
      if (timeDelta < -0.28 && !note.hit && !note.miss) {
        note.miss = true;
        note.hitRating = 'Miss';
        missFlashIntensityRef.current = 0.65; // Trigger fullscreen red vignette flash!
        gameAudioEngine.playMissSound();
        onScoreUpdate('Miss', note.type);
        
        const trackData = getNoteTrack(note);
        const spawnX = trackData.endX * width;
        const spawnY = trackData.endY * height;
        addFloatingText(t.missRating, '#ef4444', spawnX, spawnY - 30);
        return;
      }

      // Draw active note
      if (timeDelta >= -0.3 && !note.hit && !note.miss) {
        // Calculate progress percentage: 0.0 (just spawning far away) to 1.0 (perfect hit peak time)
        const progress = Math.max(0, 1.0 - timeDelta / approachSec);
        
        const startX = width / 2;
        const startY = height * 0.5; // Tunnel center

        const trackData = getNoteTrack(note);
        const endX = trackData.endX * width;
        const endY = trackData.endY * height;

        // Interpolate position based on progress 
        // We use an exponential swoop effect so it starts slow and accelerates forward!
        const easeProgress = Math.pow(progress, 2.2);
        const curX = startX + (endX - startX) * easeProgress;
        const curY = startY + (endY - startY) * easeProgress;

        // Scale notes up as they fly forward
        const baseRadius = 40;
        const radiusScale = 0.15 + (1.0 - 0.15) * easeProgress;
        const noteRadius = baseRadius * radiusScale;

        // Target timing helper ring: grows smaller to highlight exact lock moment
        const helperRingScale = Math.max(1.0, 1.0 + (timeDelta * 2)); // Shrinks to 1.0

        if (note.type === 'crouch') {
          // Draw wall block barrier requiring crouch
          drawCrouchObstacle(ctx, curX, curY, progress, timeDelta, width, height);

          // Check obstacle crouch timing collision
          if (timeDelta <= 0.22 && timeDelta >= -0.22) {
            const noseY = poseData.nose?.y || 0.4;
            // Crouch triggered if nose height sinks beneath the target parameter
            if (noseY > crouchYThreshold) {
              note.hit = true;
              note.hitRating = 'Perfect';
              gridPulseIntensityRef.current = 1.0;
              gameAudioEngine.playHitSound('crouch');
              onScoreUpdate('Perfect', 'crouch');
              addFloatingText(t.dodgedPerfect, '#f59e0b', width / 2, height * 0.3);
              addHitParticles(width / 2, height * 0.3, '#f59e0b', true);
            }
          }
        } else {
          // Normal Wrist Targets
          const leftColor = '#f43f5e';  // rose-500
          const rightColor = '#a78bfa'; // violet-400
          const color = note.type === 'left' ? leftColor : rightColor;

          // Draw the dynamic target landing zone circle at (endX, endY) using Magic Rings 2D
          const targetOpacity = Math.min(0.65, progress * 2.5); // Fades in quickly as the note approaches
          const breathingScale = 1.0 + 0.08 * Math.sin(progress * Math.PI * 4);
          const color1 = note.type === 'left' ? '#f43f5e' : '#a78bfa';
          const color2 = note.type === 'left' ? '#fda4af' : '#67e8f9';
          const baseRadius = 24 * breathingScale;

          drawMagicRings2D(
            ctx,
            endX,
            endY,
            baseRadius,
            color1,
            color2,
            performance.now() / 1000,
            targetOpacity,
            gridPulseIntensityRef.current * 0.3
          );

          // Glowing sphere outline
          ctx.beginPath();
          ctx.arc(curX, curY, noteRadius, 0, Math.PI * 2);
          ctx.fillStyle = ctx.createRadialGradient(curX, curY, 2, curX, curY, noteRadius);
          
          if (note.type === 'left') {
            (ctx.fillStyle as any).addColorStop(0, 'rgba(244, 63, 94, 0.95)');
            (ctx.fillStyle as any).addColorStop(1, 'rgba(244, 63, 94, 0.4)');
          } else {
            (ctx.fillStyle as any).addColorStop(0, 'rgba(167, 139, 250, 0.95)');
            (ctx.fillStyle as any).addColorStop(1, 'rgba(167, 139, 250, 0.4)');
          }
          
          ctx.shadowBlur = 15;
          ctx.shadowColor = color;
          ctx.fill();
          ctx.shadowBlur = 0;

          // White inner target highlight
          ctx.beginPath();
          ctx.arc(curX, curY, noteRadius * 0.4, 0, Math.PI * 2);
          ctx.fillStyle = '#ffffff';
          ctx.fill();

          // Outer glowing convergence ring
          if (timeDelta > 0) {
            ctx.beginPath();
            ctx.arc(curX, curY, noteRadius * helperRingScale, 0, Math.PI * 2);
            ctx.strokeStyle = color;
            ctx.lineWidth = 2.5;
            ctx.stroke();
          }

          // Wrist collision tracking
          // Compare target distance with active player coordinate hand positions
          const leftWrist = poseData.leftWrist;
          const rightWrist = poseData.rightWrist;

          const targetWrist = note.type === 'left' ? leftWrist : rightWrist;

          if (targetWrist && timeDelta <= 0.28 && timeDelta >= -0.28) {
            // Translate fractional wrist coords to absolute canvas scale
            const wristAbsX = targetWrist.x * width;
            const wristAbsY = targetWrist.y * height;

            const dist = Math.hypot(wristAbsX - endX, wristAbsY - endY);

            // User gets inside hit radius (e.g. 70px absolute boundary)
            if (dist < 72) {
              const rating = Math.abs(timeDelta) <= 0.15 ? 'Perfect' : 'Good';
              
              note.hit = true;
              note.hitRating = rating;
              if (rating === 'Perfect') {
                gridPulseIntensityRef.current = 1.0;
              } else {
                gridPulseIntensityRef.current = 0.6;
              }

              gameAudioEngine.playHitSound(note.type);
              onScoreUpdate(rating, note.type);

              const hitColor = rating === 'Perfect' ? '#ffffff' : color;
              const ratingText = rating === 'Perfect' ? t.perfectRating : t.goodRating;
              addFloatingText(`${ratingText}!`, hitColor, endX, endY - 20);
              addHitParticles(endX, endY, color, rating === 'Perfect');
            }
          }
        }
      }
    });

    // 6. Draw glowing player controller joints tracker
    // Renders custom dual tracking nodes so users understand exactly what coordinates they control
    if (poseData.leftWrist) {
      const lx = poseData.leftWrist.x * width;
      const ly = poseData.leftWrist.y * height;
      ctx.beginPath();
      ctx.arc(lx, ly, 15, 0, Math.PI * 2);
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 3;
      ctx.shadowColor = '#f43f5e';
      ctx.shadowBlur = 18;
      ctx.fillStyle = '#f43f5e';
      ctx.fill();
      ctx.stroke();
      ctx.shadowBlur = 0;
    }

    if (poseData.rightWrist) {
      const rx = poseData.rightWrist.x * width;
      const ry = poseData.rightWrist.y * height;
      ctx.beginPath();
      ctx.arc(rx, ry, 15, 0, Math.PI * 2);
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 3;
      ctx.shadowColor = '#a78bfa';
      ctx.shadowBlur = 18;
      ctx.fillStyle = '#a78bfa';
      ctx.fill();
      ctx.stroke();
      ctx.shadowBlur = 0;
    }

    // 7. Update and Draw active explosive hit particles
    updateAndDrawParticles(ctx);

    // 7.5 Update and Draw hit bursts
    updateAndDrawHitBursts(ctx, dt);

    // 8. Update and Draw floating texts
    updateAndDrawFloatingTexts(ctx);

    // 9. Draw fullscreen red vignette flash on Miss
    const fxIntensity = localStorage.getItem('game_fx_intensity') || 'high';
    if (fxIntensity !== 'low' && missFlashIntensityRef.current > 0) {
      ctx.save();
      ctx.globalAlpha = Math.min(0.65, missFlashIntensityRef.current);
      
      const grad = ctx.createRadialGradient(width / 2, height / 2, width * 0.35, width / 2, height / 2, width * 0.7);
      grad.addColorStop(0, 'rgba(239, 68, 68, 0)');        // Transparent center
      grad.addColorStop(1, 'rgba(239, 68, 68, 0.45)');     // Red vignette edge
      
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, width, height);
      ctx.restore();
    }
  };

  // 3D Perspective horizon line grid drawer
  const drawGrid = (ctx: CanvasRenderingContext2D, width: number, height: number, currentCombo: number) => {
    const pulse = gridPulseIntensityRef.current;
    
    // Dynamic grid opacity: base 0.12, pulsing up to 0.60
    const gridAlpha = 0.12 + 0.48 * pulse;
    ctx.strokeStyle = `rgba(167, 139, 250, ${gridAlpha})`; // Violet tracking fanned mesh grids
    ctx.lineWidth = 1;

    // Horizon coordinates
    const horizonY = height * 0.28;

    // Perspective lines fanning outward
    const linesCount = 14;
    for (let i = 0; i < linesCount; i++) {
      const xStart = (i / (linesCount - 1)) * width;
      ctx.beginPath();
      ctx.moveTo(width / 2, horizonY);
      ctx.lineTo(xStart, height);
      ctx.stroke();
    }

    // Horizon line itself has been removed. We keep other grid features intact.

    // Floor lines grouping scrolling forward synchronized with song BPM
    const bpm = track.bpm || 120;
    const scrollSpeed = (bpm / 120) * 110;
    const floorAlpha = 0.08 + 0.32 * pulse;
    const gridOffset = (currentTime * scrollSpeed) % 40;
    for (let y = horizonY; y < height; y += 40) {
      const cy = y + gridOffset;
      if (cy > horizonY && cy < height) {
        ctx.beginPath();
        // Curve perspective
        ctx.moveTo(0, cy);
        ctx.lineTo(width, cy);
        ctx.strokeStyle = `rgba(167, 139, 250, ${floorAlpha})`;
        ctx.stroke();
      }
    }
  };

  // Lightweight background floating particles
  const drawAmbientParticles = (ctx: CanvasRenderingContext2D, width: number, height: number) => {
    const fxIntensity = localStorage.getItem('game_fx_intensity') || 'high';
    if (fxIntensity === 'low') return;

    const count = fxIntensity === 'medium' ? 18 : 35;

    // Lazy initialize particle pool (35 particles)
    if (ambientParticlesRef.current.length === 0) {
      const colors = [
        'rgba(167, 139, 250, 0.35)', // violet-400
        'rgba(244, 63, 94, 0.35)',  // rose-500
        'rgba(139, 92, 246, 0.25)', // violet-500
        'rgba(245, 158, 11, 0.25)',  // amber-500
      ];
      for (let i = 0; i < count; i++) {
        ambientParticlesRef.current.push({
          x: Math.random() * width,
          y: Math.random() * height,
          size: 1.2 + Math.random() * 2.8,
          speedX: (Math.random() - 0.5) * 0.2,
          speedY: -0.15 - Math.random() * 0.35, // slow upwards drift
          color: colors[Math.floor(Math.random() * colors.length)],
          angle: Math.random() * Math.PI * 2,
          angleSpeed: 0.005 + Math.random() * 0.015,
        });
      }
    }

    // Update and render ambient particles
    ctx.save();
    const activeParticles = ambientParticlesRef.current.slice(0, count);
    activeParticles.forEach((p) => {
      p.angle += p.angleSpeed;
      // Drift horizontally with sine wave oscillation
      const dx = Math.sin(p.angle) * 0.25;
      p.x += p.speedX + dx;
      p.y += p.speedY;

      // Screen wrapping
      if (p.y < 0) {
        p.y = height;
        p.x = Math.random() * width;
      }
      if (p.x < 0) p.x = width;
      if (p.x > width) p.x = 0;

      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fillStyle = p.color;
      ctx.shadowBlur = 4;
      ctx.shadowColor = p.color;
      ctx.fill();
    });
    ctx.restore();
  };

  // Render crouch yellow giant barrier walls
  const drawCrouchObstacle = (
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    progress: number,
    timeDelta: number,
    width: number,
    height: number
  ) => {
    // A gigantic neon bar spanning side to side across top
    const obsHeight = 35;
    const obsWidth = width * 0.8 * progress; // Spreads out wide as it approaches

    ctx.save();
    // Glowing neon orange orange bar
    ctx.beginPath();
    ctx.rect(x - obsWidth / 2, y - obsHeight / 2, obsWidth, obsHeight);
    
    // Gradient forcefield flash to highlight urgent dodge action (Rose/Magenta to Violet)
    const warningGrad = ctx.createLinearGradient(x - obsWidth/2, y, x + obsWidth/2, y);
    warningGrad.addColorStop(0, 'rgba(244, 63, 94, 0.85)');
    warningGrad.addColorStop(0.5, 'rgba(192, 38, 211, 0.95)');
    warningGrad.addColorStop(1, 'rgba(244, 63, 94, 0.85)');
    ctx.fillStyle = warningGrad;

    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2;
    ctx.shadowColor = '#f43f5e';
    ctx.shadowBlur = 20;
    ctx.fill();
    ctx.stroke();
    ctx.restore();

    // Large textual "DUCK" warning flashes when obstacle is highly proximate
    if (timeDelta > -0.15 && timeDelta < 0.6) {
      ctx.fillStyle = '#ff3300';
      ctx.font = 'bold 22px "JetBrains Mono", monospace';
      ctx.textAlign = 'center';
      ctx.shadowBlur = 8;
      ctx.shadowColor = '#ff3300';
      ctx.fillText(t.duckObstacle, width / 2, y - obsHeight / 2 - 14 + (Math.sin(currentTime * 20) * 2));
      ctx.shadowBlur = 0;
    }
  };

  // Draw lines to assist player calibration positioning
  const drawCalibrationGuides = (ctx: CanvasRenderingContext2D, width: number, height: number) => {
    // Thin horizontal line overlay for crouch benchmark
    const cy = crouchYThreshold * height;

    ctx.beginPath();
    ctx.moveTo(0, cy);
    ctx.lineTo(width, cy);
    ctx.strokeStyle = 'rgba(245, 158, 11, 0.18)';
    ctx.lineWidth = 1;
    ctx.setLineDash([12, 6]);
    ctx.stroke();
    ctx.setLineDash([]);

    // Check if player nose is currently below threshold (ducking)
    const nose = poseData.nose;
    if (nose && nose.y > crouchYThreshold) {
      // Draw cool "AVOIDED" glow frame at borders
      ctx.strokeStyle = '#10b981';
      ctx.lineWidth = 8;
      ctx.strokeRect(0, 0, width, height);
    }
  };

  const drawUserTargetLink = (
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number,
    ltX: number,
    ltY: number,
    rtX: number,
    rtY: number
  ) => {
    ctx.lineWidth = 1.2;
    ctx.setLineDash([5, 5]);

    // Track line to Left Wrist (Rose)
    if (poseData.leftWrist) {
      const lx = poseData.leftWrist.x * width;
      const ly = poseData.leftWrist.y * height;
      ctx.beginPath();
      ctx.moveTo(ltX, ltY);
      ctx.lineTo(lx, ly);
      ctx.strokeStyle = 'rgba(244, 63, 94, 0.28)';
      ctx.stroke();
    }

    // Track line to Right Wrist (Violet)
    if (poseData.rightWrist) {
      const rx = poseData.rightWrist.x * width;
      const ry = poseData.rightWrist.y * height;
      ctx.beginPath();
      ctx.moveTo(rtX, rtY);
      ctx.lineTo(rx, ry);
      ctx.strokeStyle = 'rgba(167, 139, 250, 0.28)';
      ctx.stroke();
    }

    ctx.setLineDash([]);
  };

  const updateAndDrawHitBursts = (ctx: CanvasRenderingContext2D, dt: number) => {
    const list = hitBurstsRef.current;
    const time = performance.now() / 1000;
    
    hitBurstsRef.current = list.filter((burst) => {
      burst.progress += dt * 3.5;
      if (burst.progress >= 1.0) return false;

      const maxExpansion = burst.isPerfect ? 66 : 46;
      const baseRadius = 24 + burst.progress * maxExpansion;
      
      const opacity = smoothstep(1.0, 0.0, burst.progress);
      
      drawMagicRings2D(
        ctx,
        burst.x,
        burst.y,
        baseRadius,
        burst.color1,
        burst.color2,
        time,
        opacity,
        1.0 - burst.progress
      );

      return true;
    });
  };

  const updateAndDrawParticles = (ctx: CanvasRenderingContext2D) => {
    const list = particlesRef.current;
    
    // Filter expired particles
    particlesRef.current = list.filter((p) => {
      p.x += p.vx;
      p.y += p.vy;
      p.vy += 0.08; // Slight fall physics gravity
      p.alpha -= 0.035;

      if (p.alpha <= 0) return false;

      ctx.save();
      ctx.globalAlpha = p.alpha;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fillStyle = p.color;
      ctx.shadowColor = p.color;
      ctx.shadowBlur = 10;
      ctx.fill();
      ctx.restore();

      return true;
    });
  };

  const updateAndDrawFloatingTexts = (ctx: CanvasRenderingContext2D) => {
    const textList = floatingTextsRef.current;

    floatingTextsRef.current = textList.filter((f) => {
      f.y -= 1.3; // Glide upwards
      const decay = f.decayRate !== undefined ? f.decayRate : 0.022;
      f.alpha -= decay;

      if (f.alpha <= 0) return false;

      ctx.save();
      ctx.globalAlpha = f.alpha;
      ctx.fillStyle = f.color;
      const size = f.fontSize !== undefined ? f.fontSize : 15;
      ctx.font = `bold ${size}px "JetBrains Mono", sans-serif`;
      ctx.textAlign = 'center';
      
      // Shadow highlight
      ctx.shadowBlur = 6;
      ctx.shadowColor = f.color;
      ctx.fillText(f.text, f.x, f.y);
      ctx.restore();

      return true;
    });
  };

  return (
    <div 
      ref={containerRef} 
      id="game-canvas-screen" 
      className="relative w-full aspect-[4/3] rounded-2xl overflow-hidden border border-white/10 shadow-2xl flex justify-center items-center select-none bg-[#120F17] shadow-violet-500/5"
    >
      {/* Background WebGL Cyber Tunnel animation matching user screenshot */}
      {/* Background WebGL Galaxy particle animation */}
      <div className="absolute inset-0 z-0 pointer-events-none opacity-45">
        <Galaxy 
          mouseInteraction={false}
          density={1.2}
          glowIntensity={0.35}
          saturation={0.7}
          hueShift={280}
          twinkleIntensity={0.5}
          rotationSpeed={0.03}
          pulseRef={gridPulseIntensityRef}
        />
      </div>

      <div className="absolute inset-0 z-0 pointer-events-none opacity-85">
        <CyberTunnel 
          speed={0.3}
          brightness={0.65}
          color1="#7c3aed"
          color2="#f43f5e"
          color3="#38bdf8"
          pulseRef={gridPulseIntensityRef}
        />
      </div>

      {/* WebGL Hyperspeed highway replacing the flat grid lines and Strands */}
      <div className="absolute inset-0 z-0 pointer-events-none opacity-70">
        <Hyperspeed effectOptions={HYPERSPEED_OPTIONS} pulseRef={gridPulseIntensityRef} />
      </div>

      <canvas
        ref={canvasRef}
        width={640}
        height={480}
        className="relative w-full h-full object-cover z-10 bg-transparent"
      />
      
      {/* Decorative HUD metadata indicators */}
      <div className="absolute z-20 top-3 left-3 flex items-center gap-1.5 bg-[#050505]/80 backdrop-blur border border-white/10 px-3 py-1 rounded-md text-[9px] text-white/50 font-mono tracking-wider uppercase">
        {t.streakActive}
      </div>

      {/* Corner Accents matching BeatPose Immersive feed design */}
      <div className="absolute z-20 top-0 left-0 w-6 h-6 border-t-2 border-l-2 border-white/20 m-3 pointer-events-none"></div>
      <div className="absolute z-20 top-0 right-0 w-6 h-6 border-t-2 border-r-2 border-white/20 m-3 pointer-events-none"></div>
      <div className="absolute z-20 bottom-0 left-0 w-6 h-6 border-b-2 border-l-2 border-white/20 m-3 pointer-events-none"></div>
      <div className="absolute z-20 bottom-0 right-0 w-6 h-6 border-b-2 border-r-2 border-white/20 m-3 pointer-events-none"></div>
    </div>
  );
}
