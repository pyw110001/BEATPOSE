/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useRef, useState, useMemo } from 'react';
import { SongTrack, PoseData, BeatNote, CalibrationData } from '../types';
import { gameAudioEngine } from '../lib/audioEngine';
import { translations } from '../lib/translations';
import Galaxy from './Galaxy';
import CyberTunnel from './CyberTunnel';
import Hyperspeed from './Hyperspeed';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import SaberBlade from './SaberBlade';
import SaberNote from './SaberNote';

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
  lightStickWidth: [0.12, 0.5] as [number, number],
  lightStickHeight: [1.3, 1.7] as [number, number],
  movingAwaySpeed: [60, 80] as [number, number],
  movingCloserSpeed: [-120, -160] as [number, number],
  carLightsLength: [12, 80] as [number, number],
  carLightsRadius: [0.05, 0.14] as [number, number],
  carWidthPercentage: [0.3, 0.5] as [number, number],
  carShiftX: [-0.8, 0.8] as [number, number],
  carFloorSeparation: [0, 5] as [number, number],
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
  onScoreUpdate: (rating: 'Perfect' | 'Good' | 'BadCut' | 'Miss', type: 'left' | 'right' | 'crouch') => void;
  calibration: CalibrationData;
  isPlaying: boolean;
  onTrackFinished: () => void;
  lang: 'en' | 'zh';
  combo: number;
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
    
    const t = (s + 0.5) / steps;
    const alpha = Math.sin(t * Math.PI); // 0 -> 1 -> 0

    ctx.save();
    ctx.globalAlpha = ctx.globalAlpha * alpha;
    ctx.beginPath();
    ctx.arc(x, y, radius, a1, a2);
    ctx.strokeStyle = color;
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

interface Game3DSceneProps {
  track: SongTrack;
  currentTime: number;
  poseData: PoseData;
  isPlaying: boolean;
  onScoreUpdate: (rating: 'Perfect' | 'Good' | 'BadCut' | 'Miss', type: 'left' | 'right' | 'crouch') => void;
  onTrackFinished: () => void;
  gridPulseIntensityRef: React.MutableRefObject<number>;
  missFlashIntensityRef: React.MutableRefObject<number>;
  addFloatingText: (text: string, color: string, x: number, y: number, fontSize?: number, decayRate?: number) => void;
  addHitParticles: (x: number, y: number, color: string, isPerfect: boolean) => void;
  beatsRef: React.MutableRefObject<BeatNote[]>;
}

function Game3DScene({
  track,
  currentTime,
  poseData,
  isPlaying,
  onScoreUpdate,
  onTrackFinished,
  gridPulseIntensityRef,
  missFlashIntensityRef,
  addFloatingText,
  addHitParticles,
  beatsRef,
}: Game3DSceneProps) {
  const { camera } = useThree();

  useEffect(() => {
    camera.position.set(0, 1.8, 4);
    camera.lookAt(0, 1.8, 0);
  }, [camera]);

  const leftHandPosRef = useRef<THREE.Vector3 | null>(null);
  const rightHandPosRef = useRef<THREE.Vector3 | null>(null);
  const leftHandVelRef = useRef<THREE.Vector3 | null>(null);
  const rightHandVelRef = useRef<THREE.Vector3 | null>(null);

  const lastLeftPos = useRef<THREE.Vector3 | null>(null);
  const lastRightPos = useRef<THREE.Vector3 | null>(null);

  const NOTE_SPEED = 10.0;

  useFrame((state, delta) => {
    if (!isPlaying) return;

    const dt = Math.max(0.001, delta);

    // Map Left Hand (Wrist)
    if (poseData.leftWrist) {
       const lx = (poseData.leftWrist.x - 0.5) * 6.5;
       const ly = (1.0 - poseData.leftWrist.y) * 3.3 + 0.2;
       const pos = new THREE.Vector3(lx, ly, 0);
 
       if (lastLeftPos.current) {
         const vel = pos.clone().sub(lastLeftPos.current).divideScalar(dt);
         leftHandVelRef.current = vel;
       } else {
         leftHandVelRef.current = new THREE.Vector3(0, 0, 0);
       }
       lastLeftPos.current = pos;
       leftHandPosRef.current = pos;
     } else {
       leftHandPosRef.current = null;
       leftHandVelRef.current = null;
       lastLeftPos.current = null;
     }
 
     // Map Right Hand (Wrist)
     if (poseData.rightWrist) {
       const rx = (poseData.rightWrist.x - 0.5) * 6.5;
       const ry = (1.0 - poseData.rightWrist.y) * 3.3 + 0.2;
       const pos = new THREE.Vector3(rx, ry, 0);

      if (lastRightPos.current) {
        const vel = pos.clone().sub(lastRightPos.current).divideScalar(dt);
        rightHandVelRef.current = vel;
      } else {
        rightHandVelRef.current = new THREE.Vector3(0, 0, 0);
      }
      lastRightPos.current = pos;
      rightHandPosRef.current = pos;
    } else {
      rightHandPosRef.current = null;
      rightHandVelRef.current = null;
      lastRightPos.current = null;
    }

    // Collision checks
    const judgeTime = currentTime;
    const activeBeats = beatsRef.current;

    activeBeats.forEach((note) => {
      if (note.hit || note.miss) return;
      if (note.type === 'crouch') return; // Handled in 2D canvas update

      const timeDelta = note.time - judgeTime;

      // Miss if note passed the player plane
      if (timeDelta < -0.28) {
        note.miss = true;
        note.hitRating = 'Miss';
        missFlashIntensityRef.current = 0.65;
        gameAudioEngine.playMissSound();
        onScoreUpdate('Miss', note.type);

        // Map to 2D screen positions for floating text
        let endX = 0.5;
        let endY = 0.5;
        let trackIdx = 1;
        if (note.y < 0.4) trackIdx = 0;
        else if (note.y > 0.6) trackIdx = 2;
        if (note.type === 'left') {
          if (trackIdx === 0) { endX = 0.24; endY = 0.24; }
          else if (trackIdx === 1) { endX = 0.16; endY = 0.5; }
          else { endX = 0.24; endY = 0.76; }
        } else {
          if (trackIdx === 0) { endX = 0.76; endY = 0.24; }
          else if (trackIdx === 1) { endX = 0.84; endY = 0.5; }
          else { endX = 0.76; endY = 0.76; }
        }

        addFloatingText('MISS', '#ef4444', endX * 640, endY * 480 - 30);
        return;
      }

      // Check collision
      if (timeDelta >= -0.28 && timeDelta <= 0.28) {
        const handPos = note.type === 'left' ? leftHandPosRef.current : rightHandPosRef.current;
        const handVel = note.type === 'left' ? leftHandVelRef.current : rightHandVelRef.current;

        if (handPos && handVel) {
          const z = -(timeDelta * NOTE_SPEED);
          const trackData = getNoteTrack(note);
          const x = (trackData.endX - 0.5) * 6.5;
          const y = (1.0 - trackData.endY) * 3.3 + 0.2;
          const notePos = new THREE.Vector3(x, y, z);

          // Saber direction vector
          let dir = new THREE.Vector3();
          const elbow = note.type === 'left' ? poseData.leftElbow : poseData.rightElbow;
          const wrist = note.type === 'left' ? poseData.leftWrist : poseData.rightWrist;

          if (elbow && wrist) {
            const ex = (elbow.x - 0.5) * 6.5;
            const ey = (1.0 - elbow.y) * 3.3 + 0.2;
            const elbowPos = new THREE.Vector3(ex, ey, 0.5);
            dir.subVectors(handPos, elbowPos).normalize();
            dir.z = -0.55; // Forward tilt
            dir.normalize();
          } else {
            if (note.type === 'left') {
              dir.set(-0.3, 0.6, -0.7).normalize();
            } else {
              dir.set(0.3, 0.6, -0.7).normalize();
            }
            const speed = handVel.length();
            if (speed > 1.2) {
              dir.copy(handVel).normalize();
              dir.z = -0.5;
              dir.normalize();
            }
          }

          // Tip of the saber (length 1.0)
          const tipPos = handPos.clone().add(dir.multiplyScalar(1.0));

          // Get distance from notePos to segment [handPos, tipPos]
          const lineVec = tipPos.clone().sub(handPos);
          const noteVec = notePos.clone().sub(handPos);
          const projection = noteVec.dot(lineVec) / lineVec.lengthSq();
          const t = Math.max(0, Math.min(1, projection));
          const closestPoint = handPos.clone().add(lineVec.multiplyScalar(t));
          const dist = closestPoint.distanceTo(notePos);

          if (dist < 0.65) {
            const speed = handVel.length();

            // Swing speed threshold
            if (speed >= 1.5) {
              let goodCut = true;

              // Check direction match
              if (note.cutDirection && note.cutDirection !== 'any') {
                const requiredDir = new THREE.Vector3();
                if (note.cutDirection === 'up') requiredDir.set(0, 1, 0);
                else if (note.cutDirection === 'down') requiredDir.set(0, -1, 0);
                else if (note.cutDirection === 'left') requiredDir.set(-1, 0, 0);
                else if (note.cutDirection === 'right') requiredDir.set(1, 0, 0);

                const velXY = new THREE.Vector3(handVel.x, handVel.y, 0).normalize();
                const dot = velXY.dot(requiredDir);
                if (dot < 0.4) {
                  goodCut = false; // Incorrect direction
                }
              }

              note.hit = true;
              (note as any).hitTime = judgeTime;

              const rating = goodCut ? (Math.abs(timeDelta) <= 0.15 ? 'Perfect' : 'Good') : 'BadCut';
              note.hitRating = rating;

              if (rating === 'Perfect') {
                gridPulseIntensityRef.current = 1.0;
              } else if (rating === 'Good') {
                gridPulseIntensityRef.current = 0.6;
              } else {
                gridPulseIntensityRef.current = 0.2; // Minor pulse for BadCut
              }

              gameAudioEngine.playHitSound(note.type);
              onScoreUpdate(rating, note.type);

              // Calculate 2D overlay positions
              let endX = 0.5;
              let endY = 0.5;
              let trackIdx = 1;
              if (note.y < 0.4) trackIdx = 0;
              else if (note.y > 0.6) trackIdx = 2;
              if (note.type === 'left') {
                if (trackIdx === 0) { endX = 0.24; endY = 0.24; }
                else if (trackIdx === 1) { endX = 0.16; endY = 0.5; }
                else { endX = 0.24; endY = 0.76; }
              } else {
                if (trackIdx === 0) { endX = 0.76; endY = 0.24; }
                else if (trackIdx === 1) { endX = 0.84; endY = 0.5; }
                else { endX = 0.76; endY = 0.76; }
              }

              let ratingColor = '#ffffff';
              let ratingText = '';
              if (rating === 'Perfect') {
                ratingColor = '#ffffff';
                ratingText = 'PERFECT!';
              } else if (rating === 'Good') {
                ratingColor = note.type === 'left' ? '#f43f5e' : '#a78bfa';
                ratingText = 'GOOD!';
              } else {
                ratingColor = '#ef4444';
                ratingText = 'BAD DIRECTION!';
              }

              addFloatingText(ratingText, ratingColor, endX * 640, endY * 480 - 20);
              addHitParticles(endX * 640, endY * 480, note.type === 'left' ? '#f43f5e' : '#a78bfa', rating === 'Perfect');
            }
          }
        }
      }
    });
  });

  const visibleNotes = useMemo(() => {
    return beatsRef.current.filter((n) => {
      if (n.type === 'crouch') return false;
      if (n.miss) return false;
      const hitTime = (n as any).hitTime || (n.hit ? currentTime : undefined);
      if (n.hit && hitTime !== undefined && currentTime - hitTime > 0.5) return false;
      const timeDelta = n.time - currentTime;
      return timeDelta < 3 && timeDelta > -1.5;
    });
  }, [beatsRef.current, currentTime]);

  return (
    <>
      <ambientLight intensity={0.4} />
      <spotLight position={[0, 10, 5]} angle={0.5} penumbra={1} intensity={1.5} castShadow />
      <pointLight position={[0, 2, -2]} intensity={0.5} />

      <SaberBlade type="left" positionRef={leftHandPosRef} velocityRef={leftHandVelRef} />
      <SaberBlade type="right" positionRef={rightHandPosRef} velocityRef={rightHandVelRef} />

      {visibleNotes.map((note) => {
        const z = -((note.time - currentTime) * NOTE_SPEED);
        const trackData = getNoteTrack(note);
        const x = (trackData.endX - 0.5) * 6.5;
        const y = (1.0 - trackData.endY) * 3.3 + 0.2;
        return (
          <SaberNote 
            key={note.id} 
            data={note} 
            position={[x, y, z]} 
            currentTime={currentTime} 
          />
        );
      })}
    </>
  );
}

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

  // Reference trackers
  const beatsRef = useRef<BeatNote[]>([]);
  const particlesRef = useRef<Particle[]>([]);
  const floatingTextsRef = useRef<FloatingText[]>([]);
  const hitBurstsRef = useRef<HitBurst[]>([]);
  const finishedTriggeredRef = useRef(false);

  // Visual effects refs
  const gridPulseIntensityRef = useRef<number>(0);
  const lastFrameTimeRef = useRef<number>(performance.now());
  const missFlashIntensityRef = useRef<number>(0);
  const prevComboRef = useRef<number>(0);

  // Calibration thresholds
  const crouchYThreshold = calibration.crouchYThreshold || 0.65;

  // Track change -> load beats
  useEffect(() => {
    beatsRef.current = track.beats.map((b) => ({ ...b, hit: false, miss: false }));
    finishedTriggeredRef.current = false;
    particlesRef.current = [];
    floatingTextsRef.current = [];
    hitBurstsRef.current = [];
  }, [track]);

  // Main 2D overlay loops
  useEffect(() => {
    if (!isPlaying) {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
      return;
    }

    const runLoop = () => {
      renderGameFrames();
      animationFrameRef.current = requestAnimationFrame(runLoop);
    };

    animationFrameRef.current = requestAnimationFrame(runLoop);

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [isPlaying, currentTime, poseData, calibration, combo]);

  // Milestone combo text triggers
  useEffect(() => {
    if (combo > 0 && combo % 10 === 0 && combo !== prevComboRef.current) {
      addFloatingText(`${combo} COMBO!`, '#38bdf8', 320, 140, 24, 0.008);
    }
    prevComboRef.current = combo;
  }, [combo]);

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

  const addHitParticles = (x: number, y: number, color: string, isPerfect: boolean) => {
    let color1 = color;
    let color2 = '#ffffff';
    if (color === '#f43f5e') {
      color2 = '#fda4af';
    } else if (color === '#a78bfa') {
      color2 = '#67e8f9';
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
      const angle = (i / count) * Math.PI * 2 + (Math.random() - 0.5) * 0.15;
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

  const renderGameFrames = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const width = canvas.width;
    const height = canvas.height;

    const now = performance.now();
    const dt = (now - lastFrameTimeRef.current) / 1000;
    lastFrameTimeRef.current = now;

    if (gridPulseIntensityRef.current > 0) {
      gridPulseIntensityRef.current = Math.max(0, gridPulseIntensityRef.current - dt * 4.0);
    }

    if (missFlashIntensityRef.current > 0) {
      missFlashIntensityRef.current = Math.max(0, missFlashIntensityRef.current - dt * 4.0);
    }

    const bpm = track.bpm || 120;
    const approachBeats = 4;
    const approachSec = approachBeats * (60.0 / bpm);
    const judgeTime = currentTime;

    ctx.clearRect(0, 0, width, height);

    // Draw Calibration lines
    drawCalibrationGuides(ctx, width, height);

    const activeBeats = beatsRef.current;

    // Check track finished
    if (activeBeats.length > 0 && currentTime >= track.duration + 1 && !finishedTriggeredRef.current) {
      finishedTriggeredRef.current = true;
      setTimeout(() => {
        onTrackFinished();
      }, 500);
    }

    // 2D Crouch obstacle loop
    activeBeats.forEach((note) => {
      const timeDelta = note.time - judgeTime;

      if (timeDelta > approachSec) return;

      if (note.type === 'crouch' && timeDelta >= -0.3 && !note.hit && !note.miss) {
        const progress = Math.max(0, 1.0 - timeDelta / approachSec);
        
        const startX = width / 2;
        const startY = height * 0.5;

        const trackData = getNoteTrack(note);
        const endX = trackData.endX * width;
        const endY = trackData.endY * height;

        const easeProgress = Math.pow(progress, 2.2);
        const curX = startX + (endX - startX) * easeProgress;
        const curY = startY + (endY - startY) * easeProgress;

        drawCrouchObstacle(ctx, curX, curY, progress, timeDelta, width, height);

        if (timeDelta <= 0.22 && timeDelta >= -0.22) {
          const noseY = poseData.nose?.y || 0.4;
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
      }
    });

    // Update particles, bursts, floating text
    updateAndDrawParticles(ctx);
    updateAndDrawHitBursts(ctx, dt);
    updateAndDrawFloatingTexts(ctx);

    // Draw Miss flash
    const fxIntensity = localStorage.getItem('game_fx_intensity') || 'high';
    if (fxIntensity !== 'low' && missFlashIntensityRef.current > 0) {
      ctx.save();
      ctx.globalAlpha = Math.min(0.65, missFlashIntensityRef.current);
      const grad = ctx.createRadialGradient(width / 2, height / 2, width * 0.35, width / 2, height / 2, width * 0.7);
      grad.addColorStop(0, 'rgba(239, 68, 68, 0)');
      grad.addColorStop(1, 'rgba(239, 68, 68, 0.45)');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, width, height);
      ctx.restore();
    }
  };

  const drawCalibrationGuides = (ctx: CanvasRenderingContext2D, width: number, height: number) => {
    const cy = crouchYThreshold * height;
    ctx.beginPath();
    ctx.moveTo(0, cy);
    ctx.lineTo(width, cy);
    ctx.strokeStyle = 'rgba(245, 158, 11, 0.18)';
    ctx.lineWidth = 1;
    ctx.setLineDash([12, 6]);
    ctx.stroke();
    ctx.setLineDash([]);

    const nose = poseData.nose;
    if (nose && nose.y > crouchYThreshold) {
      ctx.strokeStyle = '#10b981';
      ctx.lineWidth = 8;
      ctx.strokeRect(0, 0, width, height);
    }
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
    
    particlesRef.current = list.filter((p) => {
      p.x += p.vx;
      p.y += p.vy;
      p.vy += 0.08;
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
      f.y -= 1.3;
      const decay = f.decayRate !== undefined ? f.decayRate : 0.022;
      f.alpha -= decay;

      if (f.alpha <= 0) return false;

      ctx.save();
      ctx.globalAlpha = f.alpha;
      ctx.fillStyle = f.color;
      const size = f.fontSize !== undefined ? f.fontSize : 15;
      ctx.font = `bold ${size}px "JetBrains Mono", sans-serif`;
      ctx.textAlign = 'center';
      ctx.shadowBlur = 6;
      ctx.shadowColor = f.color;
      ctx.fillText(f.text, f.x, f.y);
      ctx.restore();

      return true;
    });
  };

  const drawCrouchObstacle = (
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    progress: number,
    timeDelta: number,
    width: number,
    height: number
  ) => {
    const obsHeight = 35;
    const obsWidth = width * 0.8 * progress;

    ctx.save();
    ctx.beginPath();
    ctx.rect(x - obsWidth / 2, y - obsHeight / 2, obsWidth, obsHeight);
    
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

  return (
    <div 
      ref={containerRef} 
      id="game-canvas-screen" 
      className="relative w-full aspect-[4/3] rounded-2xl overflow-hidden border border-white/10 shadow-2xl flex justify-center items-center select-none bg-[#120F17] shadow-violet-500/5"
    >
      {/* Background WebGL particle animations */}
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

      <div className="absolute inset-0 z-0 pointer-events-none opacity-70">
        <Hyperspeed effectOptions={HYPERSPEED_OPTIONS} pulseRef={gridPulseIntensityRef} />
      </div>

      {/* 3D React Three Fiber Canvas Overlay */}
      <div 
        className="absolute inset-0 z-10 pointer-events-none bg-transparent"
        style={{ width: '100%', height: '100%', background: 'transparent', pointerEvents: 'none' }}
      >
        <Canvas 
          gl={{ alpha: true }} 
          camera={{ position: [0, 1.8, 4], fov: 60 }}
          {...{ style: { width: '100%', height: '100%', background: 'transparent', pointerEvents: 'none' } } as any}
        >
          <Game3DScene 
            track={track}
            currentTime={currentTime}
            poseData={poseData}
            isPlaying={isPlaying}
            onScoreUpdate={onScoreUpdate}
            onTrackFinished={onTrackFinished}
            gridPulseIntensityRef={gridPulseIntensityRef}
            missFlashIntensityRef={missFlashIntensityRef}
            addFloatingText={addFloatingText}
            addHitParticles={addHitParticles}
            beatsRef={beatsRef}
          />
        </Canvas>
      </div>

      {/* 2D Canvas Overlay */}
      <canvas
        ref={canvasRef}
        width={640}
        height={480}
        className="relative w-full h-full object-cover z-20 bg-transparent pointer-events-none"
      />
      
      <div className="absolute z-20 top-3 left-3 flex items-center gap-1.5 bg-[#050505]/80 backdrop-blur border border-white/10 px-3 py-1 rounded-md text-[9px] text-white/50 font-mono tracking-wider uppercase">
        {t.streakActive}
      </div>

      <div className="absolute z-20 top-0 left-0 w-6 h-6 border-t-2 border-l-2 border-white/20 m-3 pointer-events-none"></div>
      <div className="absolute z-20 top-0 right-0 w-6 h-6 border-t-2 border-r-2 border-white/20 m-3 pointer-events-none"></div>
      <div className="absolute z-20 bottom-0 left-0 w-6 h-6 border-b-2 border-l-2 border-white/20 m-3 pointer-events-none"></div>
      <div className="absolute z-20 bottom-0 right-0 w-6 h-6 border-b-2 border-r-2 border-white/20 m-3 pointer-events-none"></div>
    </div>
  );
}
