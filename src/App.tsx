/**
 * @license
 * SPDX-License-Identifier: Apache-2.5
 */

import React, { useState, useEffect, useRef } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Sparkles, Play, ShieldAlert, Award, Compass, Volume2, StepBack, Activity, HelpCircle, Flame, Keyboard, Music, Info, CircleCheck } from 'lucide-react';
import { SongTrack, PoseData, GameStatus, GameStats, CalibrationData } from './types';
import PoseTracker from './components/PoseTracker';
import GameCanvas from './components/GameCanvas';
import Dashboard from './components/Dashboard';
import Calibration from './components/Calibration';
import { gameAudioEngine } from './lib/audioEngine';
import { generateSongBeats } from './lib/beatGenerator';
import { translations } from './lib/translations';

export default function App() {
  const [status, setStatus] = useState<GameStatus>('IDLE');
  const [selectedTrack, setSelectedTrack] = useState<SongTrack | null>(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [poseData, setPoseData] = useState<PoseData>({});
  const [simulationMode, setSimulationMode] = useState(false);
  const [customTracks, setCustomTracks] = useState<SongTrack[]>([]);

  const [lang, setLang] = useState<'en' | 'zh'>(() => {
    const cached = localStorage.getItem('app_lang');
    return (cached === 'en' || cached === 'zh') ? cached : 'zh';
  });

  const handleToggleLang = () => {
    const nextLang = lang === 'en' ? 'zh' : 'en';
    setLang(nextLang);
    localStorage.setItem('app_lang', nextLang);
  };

  const [sfxEnabled, setSfxEnabled] = useState<boolean>(() => {
    const cached = localStorage.getItem('game_sfx_enabled');
    return cached !== 'false';
  });

  const handleToggleSfx = () => {
    const nextSfx = !sfxEnabled;
    setSfxEnabled(nextSfx);
    localStorage.setItem('game_sfx_enabled', nextSfx.toString());
  };

  const t = translations[lang];

  // Calibration settings default state
  const [calibration, setCalibration] = useState<CalibrationData>({
    crouchYThreshold: 0.65,
    neutralY: 0.5,
    isCalibrated: false,
  });

  // Score stats tracking
  const [gameStats, setGameStats] = useState<GameStats>({
    score: 0,
    combo: 0,
    maxCombo: 0,
    perfectCount: 0,
    goodCount: 0,
    missCount: 0,
  });

  // State caches for dashboard outcomes
  const [lastStats, setLastStats] = useState<GameStats | null>(null);
  const [lastPlayedTrack, setLastPlayedTrack] = useState<SongTrack | null>(null);

  // Countdown intro before song plays
  const [countdown, setCountdown] = useState<number | null>(null);
  const countdownIntervalRef = useRef<number | null>(null);

  // Game loop tick interval
  useEffect(() => {
    if (status !== 'PLAYING' || countdown !== null) return;

    const tick = setInterval(() => {
      const runTime = gameAudioEngine.getCurrentTime();
      setCurrentTime(runTime);
    }, 16); // 60 FPS checking

    return () => clearInterval(tick);
  }, [status, countdown]);

  // Calibration defaults restore from localstorage
  useEffect(() => {
    const cachedNeutral = localStorage.getItem('calib_neutral_y');
    const cachedCrouch = localStorage.getItem('calib_crouch_threshold');
    
    if (cachedNeutral && cachedCrouch) {
      setCalibration({
        neutralY: parseFloat(cachedNeutral),
        crouchYThreshold: parseFloat(cachedCrouch),
        isCalibrated: true,
      });
    }
  }, []);

  // Launch track gameplay
  const handleStartTrack = (track: SongTrack) => {
    // 1. Reset game counters
    setGameStats({
      score: 0,
      combo: 0,
      maxCombo: 0,
      perfectCount: 0,
      goodCount: 0,
      missCount: 0,
    });

    // Reset hits/misses of the track's beats instead of generating new ones!
    // If it has no beats, generate default beats once.
    let beats = track.beats || [];
    if (beats.length === 0) {
      const defaultGrid = track.beatGrid || {
        bpm: track.bpm,
        firstBeatOffsetSec: 0.0,
        beatsPerBar: 4,
        inputLatencySec: 0.05,
        audioLatencySec: 0.0,
      };
      beats = generateSongBeats(track.id, defaultGrid, track.duration, track.difficulty);
      track.beats = beats; // Save it to the original track object so it persists!
    }

    const resetBeats = beats.map((b) => ({
      ...b,
      hit: false,
      miss: false,
      hitRating: undefined,
    }));

    const playableTrack = {
      ...track,
      beats: resetBeats,
    };

    setSelectedTrack(playableTrack);
    setCurrentTime(0);

    // 2. Trigger Countdown (3 seconds) to let user posture/step back
    setCountdown(3);
    setStatus('PLAYING');

    if (countdownIntervalRef.current) clearInterval(countdownIntervalRef.current);
    
    let cnt = 3;
    countdownIntervalRef.current = window.setInterval(() => {
      cnt--;
      if (cnt > 0) {
        setCountdown(cnt);
      } else {
        setCountdown(null);
        if (countdownIntervalRef.current) clearInterval(countdownIntervalRef.current);
        
        // Starts Web Audio synthesizer
        gameAudioEngine.startSong(playableTrack, (beatTime, beatIndex) => {
          // Sync timing
        });
      }
    }, 1000);
  };

  // Stop track & return to lobby
  const handleStopGame = () => {
    gameAudioEngine.stop();
    if (countdownIntervalRef.current) {
      clearInterval(countdownIntervalRef.current);
      countdownIntervalRef.current = null;
    }
    setCountdown(null);
    setStatus('IDLE');
    setSelectedTrack(null);
  };

  // Perform calibration completion save
  const handleCalibrationComplete = (data: CalibrationData) => {
    setCalibration(data);
    localStorage.setItem('calib_neutral_y', data.neutralY.toString());
    localStorage.setItem('calib_crouch_threshold', data.crouchYThreshold.toString());
    setStatus('IDLE');
  };

  // Score updates from canvas collision events
  const handleScoreUpdate = (rating: 'Perfect' | 'Good' | 'BadCut' | 'Miss', type: 'left' | 'right' | 'crouch') => {
    setGameStats((prev) => {
      let scoreAdd = 0;
      let nextCombo = prev.combo;
      let nextPerfect = prev.perfectCount;
      let nextGood = prev.goodCount;
      let nextMiss = prev.missCount;

      if (rating === 'Perfect') {
        nextCombo += 1;
        scoreAdd = 100 * (1 + Math.floor(nextCombo / 10)); // Progressive multipliers scaling
        nextPerfect += 1;
      } else if (rating === 'Good') {
        nextCombo += 1;
        scoreAdd = 50 * (1 + Math.floor(nextCombo / 10));
        nextGood += 1;
      } else if (rating === 'BadCut') {
        nextCombo = 0; // Reset streak
        scoreAdd = 10;
        nextMiss += 1; // Count as miss for statistics
      } else {
        nextCombo = 0; // Miss resets streak
        nextMiss += 1;
      }

      const nextMaxCombo = Math.max(prev.maxCombo, nextCombo);
      return {
        score: prev.score + scoreAdd,
        combo: nextCombo,
        maxCombo: nextMaxCombo,
        perfectCount: nextPerfect,
        goodCount: nextGood,
        missCount: nextMiss,
      };
    });
  };

  // Track finished callback
  const handleTrackFinished = () => {
    gameAudioEngine.stop();
    setStatus('IDLE');

    // Archive stats and configure local persistence
    if (selectedTrack) {
      setLastStats(gameStats);
      setLastPlayedTrack(selectedTrack);

      const cachedHigh = localStorage.getItem(`high_score_${selectedTrack.id}`);
      const prevHigh = cachedHigh ? parseInt(cachedHigh) : 0;
      if (gameStats.score > prevHigh) {
        localStorage.setItem(`high_score_${selectedTrack.id}`, gameStats.score.toString());
        // Sound notification on high score
        setTimeout(() => gameAudioEngine.playSuccessSound(), 100);
      }
    }

    setSelectedTrack(null);
  };

  return (
    <div className="min-h-screen bg-[#050505] text-white font-sans overflow-x-hidden relative flex flex-col justify-between py-6 px-4 md:px-8">
      
      {/* Decorative ambient background grid lines matching Immersive UI */}
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_2px_2px,rgba(255,255,255,0.05)_1px,transparent_0)] bg-[size:40px_40px] pointer-events-none select-none z-0" />

      {/* Top Navbar Header */}
      <header className="w-full max-w-5xl mx-auto h-16 px-6 flex items-center justify-between border border-white/10 bg-black/40 backdrop-blur-md rounded-2xl mb-6 z-10 select-none">
        <div className="flex items-center gap-4">
          <div className="w-6 h-6 rounded-full bg-gradient-to-tr from-violet-600 to-rose-500 animate-pulse"></div>
          <h1 className="text-lg font-black tracking-widest uppercase text-white">Z-LAB <span className="text-violet-400 font-light">BEATPOSE</span></h1>
          <div className="px-3 py-1 rounded bg-white/5 border border-white/10 text-[9px] font-mono text-violet-300 ml-2">
            {t.rhythmEngineActive}
          </div>
        </div>

        <div className="flex items-center gap-3">
          {calibration.isCalibrated && (
            <div className="hidden sm:flex items-center gap-1.5 bg-emerald-500/10 border border-emerald-500/20 px-2.5 py-1 rounded-md text-[10px] text-emerald-400 font-mono uppercase">
              <CircleCheck className="w-3.5 h-3.5" /> {t.sensorsLocked}
            </div>
          )}

          {simulationMode && (
            <div className="flex items-center gap-1.5 bg-violet-500/10 border border-violet-500/20 px-2.5 py-1 rounded-md text-[10px] text-violet-400 font-mono uppercase">
              <Keyboard className="w-3.5 h-3.5" /> {t.simulatorActive}
            </div>
          )}

          <button
            onClick={handleToggleSfx}
            className="flex items-center justify-center bg-white/5 border border-white/10 hover:bg-white/10 hover:border-white/20 text-white font-mono font-bold text-[10px] px-3 py-1.5 rounded-md cursor-pointer transition active:scale-95 uppercase tracking-wider gap-1.5"
          >
            <Volume2 className="w-3.5 h-3.5" />
            {sfxEnabled ? t.sfxOn : t.sfxOff}
          </button>

          <button
            onClick={handleToggleLang}
            className="flex items-center justify-center bg-white/5 border border-white/10 hover:bg-white/10 hover:border-white/20 text-white font-mono font-bold text-[10px] px-3 py-1.5 rounded-md cursor-pointer transition active:scale-95 uppercase tracking-wider"
          >
            {lang === 'en' ? '中文' : 'EN'}
          </button>
        </div>
      </header>

      {/* Main Panel Content Routing */}
      <main className="w-full flex-1 max-w-5xl mx-auto z-10 flex flex-col justify-center items-center">
        <AnimatePresence mode="wait">
          
          {/* SCENE 1: LOBBY / IDLE */}
          {status === 'IDLE' && (
            <motion.div
              key="scene-lobby"
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -15 }}
              transition={{ duration: 0.35, ease: 'easeOut' }}
              className="w-full"
            >
              <Dashboard
                onStartTrack={handleStartTrack}
                onOpenCalibration={() => setStatus('CALIBRATING')}
                calibration={calibration}
                lastStats={lastStats}
                lastPlayedTrack={lastPlayedTrack}
                simulationMode={simulationMode}
                setSimulationMode={setSimulationMode}
                customTracks={customTracks}
                onAddCustomTrack={(newTrack) => setCustomTracks((prev) => [...prev, newTrack])}
                lang={lang}
              />
            </motion.div>
          )}

          {/* SCENE 2: ACTIVE GAME PLAYING */}
          {status === 'PLAYING' && selectedTrack && (
            <motion.div
              key="scene-playing"
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.98 }}
              className="w-full grid grid-cols-1 md:grid-cols-12 gap-6 items-stretch"
            >
              
              {/* TOP GAMEPLAY BAR (COMPACT HUB CONTROLS) */}
              <div className="col-span-12 flex flex-wrap items-center justify-between bg-black/40 backdrop-blur-md border border-white/10 px-6 py-4 rounded-2xl gap-4 shadow-xl select-none">
                <div className="space-y-0.5">
                  <span className="text-[10px] uppercase font-mono tracking-wider text-white/40">{t.playingNow}</span>
                  <h3 className="text-white font-black text-base">{selectedTrack.name}</h3>
                </div>

                {/* Score Indicators */}
                <div className="flex gap-4 sm:gap-6 items-center">
                  <div className="text-center">
                    <span className="text-[9px] text-white/40 font-mono block uppercase">{t.score}</span>
                    <span className="text-xl font-bold font-mono tracking-tight text-rose-500">{gameStats.score}</span>
                  </div>

                  <div className="text-center border-l border-white/10 pl-4 sm:pl-6">
                    <span className="text-[9px] text-white/40 font-mono block uppercase">{t.comboMulti}</span>
                    <span className="text-xl font-bold font-mono tracking-tight text-violet-400">
                      {gameStats.combo}
                      <span className="text-[11px] font-normal text-white/40">x ({1 + Math.floor(gameStats.combo / 10)}x)</span>
                    </span>
                  </div>

                  {/* Song track timeline progress bar */}
                  <div className="hidden sm:block text-center border-l border-white/10 pl-6 w-32">
                    <span className="text-[9px] text-white/40 font-mono block uppercase mb-1">{t.completion}</span>
                    <div className="w-full bg-white/5 h-1.5 rounded-full overflow-hidden border border-white/10">
                      <div 
                        className="bg-gradient-to-r from-violet-600 to-rose-400 h-full transition-all duration-100"
                        style={{ width: `${Math.min(100, (currentTime / selectedTrack.duration) * 100)}%` }}
                      />
                    </div>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={handleStopGame}
                  className="bg-white/5 border border-white/10 hover:bg-white/10 hover:border-white/20 text-white/80 font-semibold px-4 py-2 rounded-full text-xs transition cursor-pointer"
                >
                  {t.surrenderLevel}
                </button>
              </div>

              {/* DUAL DISPLAY PANEL VIEW */}
              {/* Left Column: Visual game canvas - 6 Columns */}
              <div className="md:col-span-7 flex flex-col justify-between items-stretch">
                <GameCanvas
                  track={selectedTrack}
                  currentTime={currentTime}
                  poseData={poseData}
                  calibration={calibration}
                  isPlaying={status === 'PLAYING' && countdown === null}
                  onScoreUpdate={handleScoreUpdate}
                  onTrackFinished={handleTrackFinished}
                  lang={lang}
                  combo={gameStats.combo}
                />
              </div>

              {/* Right Column: Camera feedback skeleton overlay - 5 Columns */}
              <div className="md:col-span-5 flex flex-col justify-between items-stretch">
                <PoseTracker
                  onPoseDetected={(pose) => setPoseData(pose)}
                  isCalibrating={false}
                  neutralY={calibration.neutralY}
                  crouchThreshold={calibration.crouchYThreshold}
                  simulationMode={simulationMode}
                  setSimulationMode={setSimulationMode}
                  lang={lang}
                />
              </div>

              {/* Fullscreen countdown overlay card */}
              {countdown !== null && (
                <div className="fixed inset-0 bg-[#050505]/95 backdrop-blur-md z-50 flex flex-col items-center justify-center text-center select-none animate-in fade-in duration-200">
                  <motion.div
                    key={countdown}
                    initial={{ opacity: 0, scale: 0.6 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 1.4 }}
                    transition={{ duration: 0.4 }}
                    className="space-y-4"
                  >
                    <span className="text-[12px] uppercase tracking-widest font-mono text-violet-400 font-semibold block">{t.preparePosture}</span>
                    <h2 className="text-8xl font-black tracking-tighter text-white font-mono leading-none">
                      {countdown}
                    </h2>
                    <p className="text-white/60 text-sm max-w-xs leading-relaxed font-sans mt-2 mx-auto">
                      {simulationMode ? t.alignCursor : t.stepBack}
                    </p>
                  </motion.div>
                </div>
              )}

            </motion.div>
          )}

          {/* SCENE 3: SENSURE CALIBRATION SCREEN */}
          {status === 'CALIBRATING' && (
            <motion.div
              key="scene-calibrating"
              initial={{ opacity: 0, y: 15 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -15 }}
              className="w-full grid grid-cols-1 md:grid-cols-12 gap-6 items-stretch"
            >
              
              {/* Backing tracker feedback stream - 5 cols */}
              <div className="md:col-span-5 flex flex-col justify-center">
                <PoseTracker
                  onPoseDetected={(pose) => setPoseData(pose)}
                  isCalibrating={true}
                  neutralY={calibration.neutralY}
                  crouchThreshold={calibration.crouchYThreshold}
                  simulationMode={simulationMode}
                  setSimulationMode={setSimulationMode}
                  lang={lang}
                />
              </div>

              {/* Calibrator wizard - 7 cols */}
              <div className="md:col-span-7 flex flex-col justify-center">
                <Calibration
                  poseData={poseData}
                  onCalibrationComplete={handleCalibrationComplete}
                  onCancel={() => setStatus('IDLE')}
                  lang={lang}
                />
              </div>

            </motion.div>
          )}

        </AnimatePresence>
      </main>

      {/* Footer copyright labels */}
      <footer className="w-full max-w-5xl mx-auto border-t border-white/10 pt-4 mt-6 text-center text-[9px] text-white/30 font-mono tracking-widest select-none uppercase">
        BEAT POSE EXPERIENCE • POWERED BY GOOGLE AI STUDIO SANDBOX BUILDER
      </footer>

    </div>
  );
}
