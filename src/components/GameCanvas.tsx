/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useRef, useState } from 'react';
import { SongTrack, PoseData, BeatNote, CalibrationData, GameStats } from '../types';
import { gameAudioEngine } from '../lib/audioEngine';
import { translations } from '../lib/translations';

interface GameCanvasProps {
  track: SongTrack;
  currentTime: number;
  poseData: PoseData;
  onScoreUpdate: (rating: 'Perfect' | 'Good' | 'Miss', type: 'left' | 'right' | 'crouch') => void;
  calibration: CalibrationData;
  isPlaying: boolean;
  onTrackFinished: () => void;
  lang: 'en' | 'zh';
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
}: GameCanvasProps) {
  const t = translations[lang];
  const containerRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const animationFrameRef = useRef<number | null>(null);

  // Maintain interactive list states via refs to bypass React render delay in game loops
  const beatsRef = useRef<BeatNote[]>([]);
  const particlesRef = useRef<Particle[]>([]);
  const floatingTextsRef = useRef<FloatingText[]>([]);
  const finishedTriggeredRef = useRef(false);

  // Calibration references
  const crouchYThreshold = calibration.crouchYThreshold || 0.65;

  // Track changed -> load beats anew
  useEffect(() => {
    // Deep clone beats from track to avoid mutating source
    beatsRef.current = track.beats.map((b) => ({ ...b, hit: false, miss: false }));
    finishedTriggeredRef.current = false;
    particlesRef.current = [];
    floatingTextsRef.current = [];
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
      renderGameFrames();
      animationFrameRef.current = requestAnimationFrame(runLoop);
    };

    animationFrameRef.current = requestAnimationFrame(runLoop);

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [isPlaying, currentTime, poseData, calibration]);

  // Push floating text indicator
  const addFloatingText = (text: string, color: string, x: number, y: number) => {
    floatingTextsRef.current.push({
      id: Math.random().toString(),
      text,
      color,
      x,
      y,
      alpha: 1.0,
    });
  };

  // Push glowing spark particles
  const addHitParticles = (x: number, y: number, color: string) => {
    const count = 15;
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 2 + Math.random() * 5;
      particlesRef.current.push({
        id: Math.random().toString(),
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        color,
        alpha: 1.0,
        size: 3 + Math.random() * 4,
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
      return {
        x: (closestNote as BeatNote).x * w,
        y: (closestNote as BeatNote).y * h,
      };
    }
    
    // Fallback to default lane targets
    return {
      x: type === 'left' ? 0.28 * w : 0.72 * w,
      y: 0.48 * h,
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

    // Grid BPM and dynamic approach time based on beats (default 4 beats)
    const bpm = track.bpm || 120;
    const approachBeats = 4;
    const approachSec = approachBeats * (60.0 / bpm);

    // Latency compensated Judge Time
    const inputLatencySec = track.beatGrid?.inputLatencySec || 0.0;
    const judgeTime = currentTime - inputLatencySec;

    // 1. Reset Context with Pitch Black background matching Immersive UI
    ctx.fillStyle = '#050505';
    ctx.fillRect(0, 0, width, height);

    // Draw dynamic radial background center glow
    const radialGrad = ctx.createRadialGradient(width / 2, height / 2, 50, width / 2, height / 2, width * 0.75);
    radialGrad.addColorStop(0, 'rgba(139, 92, 246, 0.12)'); // Violet center touch
    radialGrad.addColorStop(1, '#050505');
    ctx.fillStyle = radialGrad;
    ctx.fillRect(0, 0, width, height);

    // 2. Draw 3D-effect floor grid
    drawGrid(ctx, width, height);

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
        gameAudioEngine.playMissSound();
        onScoreUpdate('Miss', note.type);
        
        const spawnX = note.type === 'crouch' ? width / 2 : note.x * width;
        const spawnY = note.type === 'crouch' ? height * 0.35 : note.y * height;
        addFloatingText(t.missRating, '#ef4444', spawnX, spawnY - 30);
        return;
      }

      // Draw active note
      if (timeDelta >= -0.3 && !note.hit && !note.miss) {
        // Calculate progress percentage: 0.0 (just spawning far away) to 1.0 (perfect hit peak time)
        const progress = Math.max(0, 1.0 - timeDelta / approachSec);
        
        let startX = width / 2;
        let startY = height * 0.28; // Spawns from "horizon" midpoint

        const endX = note.type === 'crouch' ? width / 2 : note.x * width;
        const endY = note.type === 'crouch' ? height * 0.32 : note.y * height;

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
              gameAudioEngine.playHitSound('crouch');
              onScoreUpdate('Perfect', 'crouch');
              addFloatingText(t.dodgedPerfect, '#f59e0b', width / 2, height * 0.3);
              addHitParticles(width / 2, height * 0.3, '#f59e0b');
            }
          }
        } else {
          // Normal Wrist Targets
          const leftColor = '#f43f5e';  // rose-500
          const rightColor = '#a78bfa'; // violet-400
          const color = note.type === 'left' ? leftColor : rightColor;

          // Draw the dynamic target landing zone circle at (endX, endY)
          const targetOpacity = Math.min(0.6, progress * 2.5); // Fades in quickly as the note approaches
          ctx.save();
          ctx.globalAlpha = targetOpacity;
          ctx.beginPath();
          ctx.arc(endX, endY, 44, 0, Math.PI * 2);
          ctx.strokeStyle = color;
          ctx.lineWidth = 3;
          ctx.shadowColor = color;
          ctx.shadowBlur = 10;
          ctx.stroke();
          
          // Pulsing outer ring
          ctx.beginPath();
          ctx.arc(endX, endY, 44 + Math.sin(currentTime * 10) * 3, 0, Math.PI * 2);
          ctx.strokeStyle = color;
          ctx.lineWidth = 1;
          ctx.stroke();
          ctx.restore();

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

              gameAudioEngine.playHitSound(note.type);
              onScoreUpdate(rating, note.type);

              const hitColor = rating === 'Perfect' ? '#ffffff' : color;
              const ratingText = rating === 'Perfect' ? t.perfectRating : t.goodRating;
              addFloatingText(`${ratingText}!`, hitColor, endX, endY - 20);
              addHitParticles(endX, endY, color);
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

    // 8. Update and Draw floating texts
    updateAndDrawFloatingTexts(ctx);
  };

  // 3D Perspective horizon line grid drawer
  const drawGrid = (ctx: CanvasRenderingContext2D, width: number, height: number) => {
    ctx.strokeStyle = 'rgba(167, 139, 250, 0.08)'; // Violet tracking fanned mesh grids
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

    // Horizon line itself
    ctx.beginPath();
    ctx.moveTo(0, horizonY);
    ctx.lineTo(width, horizonY);
    ctx.strokeStyle = 'rgba(244, 63, 94, 0.25)'; // Rose horizon line bar glow
    ctx.lineWidth = 2;
    ctx.stroke();

    // Floor lines grouping scrolling forward based on currentTime mapping
    const gridOffset = (currentTime * 110) % 40;
    for (let y = horizonY; y < height; y += 40) {
      const cy = y + gridOffset;
      if (cy > horizonY && cy < height) {
        ctx.beginPath();
        // Curve perspective
        ctx.moveTo(0, cy);
        ctx.lineTo(width, cy);
        ctx.strokeStyle = 'rgba(167, 139, 250, 0.05)';
        ctx.stroke();
      }
    }
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

    const ry = height * 0.25 + (height * 0.15 * progress);

    ctx.save();
    // Glowing neon orange orange bar
    ctx.beginPath();
    ctx.rect(x - obsWidth / 2, ry, obsWidth, obsHeight);
    
    // Gradient forcefield flash to highlight urgent dodge action (Rose/Magenta to Violet)
    const warningGrad = ctx.createLinearGradient(x - obsWidth/2, ry, x + obsWidth/2, ry);
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
      ctx.fillText(t.duckObstacle, width / 2, ry - 14 + (Math.sin(currentTime * 20) * 2));
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
      f.alpha -= 0.022;

      if (f.alpha <= 0) return false;

      ctx.save();
      ctx.globalAlpha = f.alpha;
      ctx.fillStyle = f.color;
      ctx.font = 'bold 15px "JetBrains Mono", sans-serif';
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
      className="relative w-full aspect-[4/3] rounded-2xl overflow-hidden border border-white/10 shadow-2xl flex justify-center items-center select-none bg-black shadow-violet-500/5"
    >
      <canvas
        ref={canvasRef}
        width={640}
        height={480}
        className="w-full h-full object-cover"
      />
      
      {/* Decorative HUD metadata indicators */}
      <div className="absolute top-3 left-3 flex items-center gap-1.5 bg-[#050505]/80 backdrop-blur border border-white/10 px-3 py-1 rounded-md text-[9px] text-white/50 font-mono tracking-wider uppercase">
        {t.streakActive}
      </div>

      {/* Corner Accents matching BeatPose Immersive feed design */}
      <div className="absolute top-0 left-0 w-6 h-6 border-t-2 border-l-2 border-white/20 m-3 pointer-events-none"></div>
      <div className="absolute top-0 right-0 w-6 h-6 border-t-2 border-r-2 border-white/20 m-3 pointer-events-none"></div>
      <div className="absolute bottom-0 left-0 w-6 h-6 border-b-2 border-l-2 border-white/20 m-3 pointer-events-none"></div>
      <div className="absolute bottom-0 right-0 w-6 h-6 border-b-2 border-r-2 border-white/20 m-3 pointer-events-none"></div>
    </div>
  );
}
