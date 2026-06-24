/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { Camera, ShieldCheck, HelpCircle, Activity, Smile, ArrowDown } from 'lucide-react';
import { PoseData, CalibrationData } from '../types';
import { translations } from '../lib/translations';

interface CalibrationProps {
  poseData: PoseData;
  onCalibrationComplete: (data: CalibrationData) => void;
  onCancel: () => void;
  lang: 'en' | 'zh';
}

export default function Calibration({
  poseData,
  onCalibrationComplete,
  onCancel,
  lang,
}: CalibrationProps) {
  const t = translations[lang];
  const [neutralY, setNeutralY] = useState<number | null>(null);
  const [isMeasuring, setIsMeasuring] = useState(false);
  const [measureSamples, setMeasureSamples] = useState<number[]>([]);
  const [msgKey, setMsgKey] = useState<string>('standUpright');

  // Check if player details are visible in screen
  const hasFaceDetected = !!poseData.nose;

  // Measurement effect loop
  useEffect(() => {
    if (!isMeasuring) return;

    const interval = setInterval(() => {
      if (poseData.nose) {
        setMeasureSamples((prev) => [...prev, poseData.nose!.y]);
      }
    }, 100);

    return () => clearInterval(interval);
  }, [isMeasuring, poseData]);

  // Handle sample collections
  useEffect(() => {
    if (measureSamples.length >= 10 && isMeasuring) {
      setIsMeasuring(false);
      
      // Calculate average height
      const sum = measureSamples.reduce((a, b) => a + b, 0);
      const avg = sum / measureSamples.length;

      setNeutralY(avg);
      setMeasureSamples([]);
      setMsgKey('heightSaved');
    }
  }, [measureSamples, isMeasuring]);

  const handleStartMeasurement = () => {
    if (!hasFaceDetected) {
      setMsgKey('calibWarning');
      return;
    }
    setMeasureSamples([]);
    setIsMeasuring(true);
    setMsgKey('measuringPosture');
  };

  const handleComplete = () => {
    if (neutralY === null) return;

    // A crouch means sinking lower (increasing Y height in top-left origin coordinates)
    // Establish crouch threshold slightly lower (e.g., 0.15 screen points below standing position)
    const crouchYThreshold = Math.min(0.92, neutralY + 0.14);

    onCalibrationComplete({
      neutralY,
      crouchYThreshold,
      isCalibrated: true,
    });
  };

  return (
    <div id="calibration-overlay" className="bg-gradient-to-b from-[#0a0a0a] to-[#050505] border border-white/10 p-6 rounded-2xl w-full max-w-sm mx-auto shadow-2xl shadow-violet-500/5 relative font-sans text-left space-y-4">
      {/* Header */}
      <div className="flex items-center gap-2.5 border-b border-white/10 pb-4">
        <Activity className="w-5 h-5 text-violet-400" />
        <div>
          <h2 className="text-white font-bold text-sm tracking-widest uppercase font-mono">{t.postureCalibration}</h2>
          <p className="text-white/50 text-xs mt-1">{t.crouchThresholdsDesc}</p>
        </div>
      </div>

      {/* Realtime Pose Status */}
      <div className="bg-white/5 p-3 rounded-xl border border-white/10 flex items-center justify-between text-xs transition">
        <div className="flex items-center gap-2">
          <Smile className={`w-4 h-4 ${hasFaceDetected ? 'text-violet-400' : 'text-white/40'}`} />
          <span className="text-white/70 font-mono text-[10px] tracking-wider">{t.poseSignal}</span>
        </div>
        <div className={`font-semibold px-2.5 py-0.5 rounded-full text-[9px] uppercase tracking-wider font-mono ${
          hasFaceDetected ? 'bg-violet-500/10 text-violet-300 border border-violet-500/20 shadow-sm shadow-violet-500/10' : 'bg-white/5 text-white/40 border border-white/5'
        }`}>
          {hasFaceDetected ? t.noseLocked : t.noSubject}
        </div>
      </div>

      {/* Status instruction panel */}
      <div className="bg-violet-950/20 border border-violet-800/10 rounded-xl p-3 text-xs leading-relaxed">
        <p className="text-violet-200 font-sans">{t[msgKey as keyof typeof t] || msgKey}</p>
        {isMeasuring && (
          <div className="w-full bg-white/5 h-1.5 rounded-full mt-3.5 overflow-hidden border border-white/10">
            <div 
              className="bg-violet-500 h-full transition-all duration-100 animate-pulse"
              style={{ width: `${(measureSamples.length / 10) * 100}%` }}
            />
          </div>
        )}
      </div>

      {/* Guide details */}
      <div className="space-y-1.5 text-xs text-white/60 pl-1 leading-relaxed">
        <div className="flex items-start gap-1 pb-1">
          <ArrowDown className="w-3.5 h-3.5 mt-0.5 text-violet-400 shrink-0" />
          <span>{t.standStraightNeck}</span>
        </div>
        <div className="text-[10px] bg-black/60 p-3 rounded-xl border border-white/10 text-white/40 font-mono space-y-1">
          <div>{t.currentNoseY} <span className="text-white/60">{poseData.nose ? poseData.nose.y.toFixed(3) : t.none}</span></div>
          <div>{t.calibratedBaseline} <span className="text-white/60">{neutralY ? neutralY.toFixed(3) : t.notEstablished}</span></div>
        </div>
      </div>

      {/* Action buttons */}
      <div className="flex flex-col gap-2 pt-2">
        <button
          type="button"
          onClick={handleStartMeasurement}
          disabled={isMeasuring || !hasFaceDetected}
          className={`w-full py-2.5 rounded-full font-semibold text-xs transition cursor-pointer flex items-center justify-center gap-2 shadow-md ${
            isMeasuring || !hasFaceDetected
              ? 'bg-neutral-900 border border-neutral-800 text-neutral-500 cursor-not-allowed opacity-50'
              : 'bg-violet-600/10 text-violet-300 border border-violet-500/20 hover:bg-violet-600/20'
          }`}
        >
          {isMeasuring ? t.sampling : t.setStandingPosture}
        </button>

        <button
          type="button"
          onClick={handleComplete}
          disabled={neutralY === null}
          className={`w-full py-2.5 rounded-full font-bold text-xs border transition cursor-pointer flex items-center justify-center gap-2 ${
            neutralY === null
              ? 'bg-neutral-900 border border-neutral-800 text-neutral-500 cursor-not-allowed opacity-30'
              : 'bg-violet-600 text-white border-violet-500 hover:bg-violet-500 shadow-lg hover:shadow-violet-500/20'
          }`}
        >
          <ShieldCheck className="w-4 h-4" /> {t.lockDeploy}
        </button>

        <button
          type="button"
          onClick={onCancel}
          className="w-full py-2 rounded-full text-xs font-semibold text-white/50 border border-white/10 hover:bg-white/5 hover:text-white transition bg-transparent cursor-pointer"
        >
          {t.backLobby}
        </button>
      </div>
    </div>
  );
}
