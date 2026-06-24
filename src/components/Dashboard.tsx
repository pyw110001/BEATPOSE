/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import { Play, Flame, Award, HelpCircle, Activity, Star, RefreshCw, Trophy, Zap, Compass, Sparkles, Smile, ShieldCheck, Upload, Music, Plus, Loader2 } from 'lucide-react';
import { SongTrack, GameStats, CalibrationData } from '../types';
import { TEMPLATE_SONGS, generateSongBeats } from '../lib/beatGenerator';
import { gameAudioEngine } from '../lib/audioEngine';
import { translations } from '../lib/translations';

interface DashboardProps {
  onStartTrack: (track: SongTrack) => void;
  onOpenCalibration: () => void;
  calibration: CalibrationData;
  lastStats: GameStats | null;
  lastPlayedTrack: SongTrack | null;
  simulationMode: boolean;
  setSimulationMode: (val: boolean) => void;
  customTracks: SongTrack[];
  onAddCustomTrack: (track: SongTrack) => void;
  lang: 'en' | 'zh';
}

export default function Dashboard({
  onStartTrack,
  onOpenCalibration,
  calibration,
  lastStats,
  lastPlayedTrack,
  simulationMode,
  setSimulationMode,
  customTracks,
  onAddCustomTrack,
  lang,
}: DashboardProps) {
  const [highScores, setHighScores] = useState<Record<string, number>>({});

  // Custom music upload states
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [customAudioBuffer, setCustomAudioBuffer] = useState<AudioBuffer | null>(null);
  const [songName, setSongName] = useState('');
  const [bpm, setBpm] = useState(120);
  const [difficulty, setDifficulty] = useState<'Easy' | 'Medium' | 'Hard'>('Medium');

  const t = translations[lang];

  // Sync high scores from localStorage
  useEffect(() => {
    const scores: Record<string, number> = {};
    [...TEMPLATE_SONGS, ...customTracks].forEach((song) => {
      const val = localStorage.getItem(`high_score_${song.id}`);
      scores[song.id] = val ? parseInt(val) : 0;
    });
    setHighScores(scores);
  }, [lastStats, customTracks]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setError(null);
    setUploading(true);
    setSongName(file.name.replace(/\.[^/.]+$/, '')); // Default title is filename without extension

    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const arrayBuffer = event.target?.result as ArrayBuffer;
        const decodedBuffer = await gameAudioEngine.decodeAudio(arrayBuffer);
        setCustomAudioBuffer(decodedBuffer);
      } catch (err: any) {
        console.error(err);
        setError(t.errorDecode);
      } finally {
        setUploading(false);
      }
    };
    reader.onerror = () => {
      setError(t.errorRead);
      setUploading(false);
    };
    reader.readAsArrayBuffer(file);
  };

  const handleAddSong = () => {
    if (!customAudioBuffer) return;
    if (!songName.trim()) {
      setError(t.errorSongName);
      return;
    }

    const duration = Math.round(customAudioBuffer.duration);
    const newTrackId = `custom_${Date.now()}`;
    
    // Generate beats based on BPM, duration and difficulty
    const beats = generateSongBeats(newTrackId, bpm, duration, difficulty);

    const newTrack: SongTrack = {
      id: newTrackId,
      name: songName,
      genre: lang === 'zh' ? '自定义上传' : 'Custom Upload',
      bpm: bpm,
      duration: duration,
      difficulty: difficulty,
      description: lang === 'zh' ? '您上传的本地音乐音轨，已准备就绪！' : 'Your uploaded local music track. Ready to play!',
      beats: beats,
      isCustom: true,
      audioBuffer: customAudioBuffer,
    };

    onAddCustomTrack(newTrack);

    // Reset state
    setCustomAudioBuffer(null);
    setSongName('');
    setBpm(120);
    setDifficulty('Medium');
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  // Score multiplier percentage calculation
  const getAccuracy = (stats: GameStats) => {
    const total = stats.perfectCount + stats.goodCount + stats.missCount;
    if (total === 0) return 0;
    return Math.round(((stats.perfectCount + stats.goodCount * 0.6) / total) * 100);
  };

  const getAccuracyRating = (accuracy: number) => {
    if (accuracy >= 95) return '👑 SSS RANK';
    if (accuracy >= 90) return '🔥 SS RANK';
    if (accuracy >= 80) return '⭐ S RANK';
    if (accuracy >= 70) return '✨ A RANK';
    return '👍 PASSED';
  };

  const allTracks = [...TEMPLATE_SONGS, ...customTracks];

  return (
    <div id="lobby-panel" className="w-full flex flex-col gap-6 font-sans text-left text-white max-w-4xl mx-auto selection:bg-violet-500 selection:text-white">
      
      {/* 1. Cyber Banner Title with Immersive styling */}
      <div className="relative overflow-hidden bg-gradient-to-tr from-violet-950/20 via-[#050505] to-rose-950/15 border border-white/10 p-6 rounded-2xl flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-xl shadow-violet-500/5">
        <div className="space-y-1.5 z-10">
          <div className="flex items-center gap-2">
            <span className="bg-violet-500/10 text-violet-300 font-mono text-[10px] uppercase font-bold tracking-widest px-2.5 py-0.5 rounded-full border border-violet-500/25 shadow-sm shadow-violet-500/10">{t.betaPoseInteractive}</span>
            <div className="h-1.5 w-1.5 rounded-full bg-violet-400 animate-pulse" />
          </div>
          <h1 className="text-3xl md:text-4xl font-extrabold tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-white via-violet-100 to-rose-200">
            {t.beatPoseTitle}
          </h1>
          <p className="text-white/60 text-sm max-w-lg leading-relaxed font-sans">
            {t.beatPoseDesc}
          </p>
        </div>

        {/* Rapid calibration buttons action with glow style */}
        <div className="flex flex-wrap gap-2 z-10 shrink-0">
          <button
            type="button"
            onClick={onOpenCalibration}
            className={`px-5 py-2.5 rounded-full text-xs font-bold transition flex items-center gap-2 border cursor-pointer ${
              calibration.isCalibrated 
                ? 'bg-white/5 border-white/10 hover:bg-white/10 text-white/90' 
                : 'bg-violet-600 border-violet-500 text-white hover:bg-violet-500 shadow-[0_0_15px_rgba(139,92,246,0.35)] animate-pulse'
            }`}
          >
            <Activity className="w-4 h-4 text-violet-400 animate-pulse" />
            {calibration.isCalibrated ? t.recalibratePose : t.setupCamera}
          </button>
        </div>

        {/* Ambient background grid decoration */}
        <div className="absolute inset-0 opacity-1 pointer-events-none select-none">
          <div className="absolute bottom-0 right-0 w-80 h-32 bg-violet-600/10 rounded-full blur-[100px] -z-10" />
          <div className="absolute top-0 left-0 w-48 h-20 bg-rose-500/5 rounded-full blur-[70px] -z-10" />
        </div>
      </div>

      {/* 2. Last Match Results Sheet with Glass/Neon themes */}
      {lastStats && lastPlayedTrack && (
        <div className="bg-gradient-to-b from-[#0a0a0a] to-[#050505] border border-violet-500/30 p-6 rounded-2xl shadow-2xl shadow-violet-500/5 relative overflow-hidden animate-in fade-in zoom-in duration-300">
          <div className="absolute top-0 right-0 p-4 shrink-0 text-3xl font-black text-violet-500/20 tracking-wider select-none">
            {getAccuracyRating(getAccuracy(lastStats))}
          </div>

          <div className="flex items-center gap-2 mb-4">
            <Trophy className="w-5 h-5 text-violet-400" />
            <h3 className="text-white font-extrabold text-xs uppercase tracking-widest font-mono">
              {t.performanceOverview} <span className="text-rose-400 font-bold">{lastPlayedTrack.name}</span>
            </h3>
          </div>

          {/* Results Grid Dashboard */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
            <div className="bg-white/5 p-4 rounded-xl border border-white/10">
              <span className="text-[10px] text-white/40 font-mono block uppercase">{t.totalScore}</span>
              <span className="text-2xl font-black text-rose-400 font-mono tracking-tight">{lastStats.score}</span>
            </div>

            <div className="bg-white/5 p-4 rounded-xl border border-white/10">
              <span className="text-[10px] text-white/40 font-mono block uppercase">{t.accuracy}</span>
              <span className="text-2xl font-black text-emerald-400 font-mono tracking-tight">{getAccuracy(lastStats)}%</span>
            </div>

            <div className="bg-white/5 p-4 rounded-xl border border-white/10">
              <span className="text-[10px] text-white/40 font-mono block uppercase">{t.maxStreak}</span>
              <span className="text-2xl font-black text-violet-400 font-mono tracking-tight">{lastStats.maxCombo}x</span>
            </div>

            <div className="bg-white/5 p-4 rounded-xl border border-white/10 flex items-center justify-center gap-1">
              <div className="text-left py-0.5 space-y-0.5">
                <div className="text-[9px] text-white/50 font-mono uppercase"><span className="text-white font-bold">{lastStats.perfectCount}</span> {t.perfects}</div>
                <div className="text-[9px] text-white/50 font-mono uppercase"><span className="text-violet-400 font-bold">{lastStats.goodCount}</span> {t.goods}</div>
                <div className="text-[9px] text-white/50 font-mono uppercase"><span className="text-rose-500 font-bold">{lastStats.missCount}</span> {t.misses}</div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 3. Primary Lobby Section: Tracks & Guides */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-6 items-start">
        
        {/* Left Side: Song Track selection - 7 Columns */}
        <div className="md:col-span-7 space-y-4">
          <div className="flex items-center gap-2">
            <Compass className="w-4.5 h-4.5 text-violet-400" />
            <h2 className="text-white font-bold text-xs tracking-widest uppercase font-mono">{t.chooseTrack}</h2>
          </div>

          <div className="space-y-3.5">
            {allTracks.map((song) => {
              const score = highScores[song.id] || 0;
              
              let levelColor = 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20';
              if (song.difficulty === 'Medium') {
                levelColor = 'bg-amber-500/10 text-amber-400 border-amber-500/20';
              } else if (song.difficulty === 'Hard') {
                levelColor = 'bg-rose-500/10 text-rose-400 border-rose-500/20';
              }

              return (
                <div 
                  key={song.id} 
                  className={`group relative bg-black/40 border p-4 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-4 transition shadow-lg hover:shadow-violet-500/5 duration-300 transform hover:-translate-y-0.5 ${
                    song.isCustom ? 'border-violet-500/35 shadow-[0_0_15px_rgba(139,92,246,0.05)]' : 'border-white/10 hover:border-violet-500/40'
                  }`}
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`text-[10px] font-mono tracking-widest uppercase font-bold border px-2 py-0.5 rounded-full ${levelColor}`}>
                        {song.difficulty === 'Easy' ? t.easy : (song.difficulty === 'Medium' ? t.medium : t.hard)}
                      </span>
                      {song.isCustom && (
                        <span className="bg-violet-500/20 text-violet-300 font-mono text-[9px] uppercase font-bold tracking-wider px-2 py-0.5 rounded border border-violet-500/30">
                          {t.custom}
                        </span>
                      )}
                      <span className="text-xs text-white/40 font-mono">
                        {song.bpm} {t.bpm} • {song.duration}s
                      </span>
                    </div>

                    <h4 className="text-white font-bold text-[15px] group-hover:text-violet-300 transition-colors">
                      {song.name}
                    </h4>
                    <p className="text-white/60 text-xs leading-relaxed max-w-md font-sans">
                      {song.description}
                    </p>
                  </div>

                  {/* Actions & Highscores */}
                  <div className="flex sm:flex-col items-end gap-2 shrink-0 justify-between sm:justify-center border-t sm:border-t-0 border-white/10 pt-2 sm:pt-0">
                    {score > 0 && (
                      <div className="flex items-center gap-1 bg-violet-500/5 border border-violet-500/20 px-2.5 py-0.5 rounded text-[10px] text-violet-300 font-mono uppercase">
                        <Award className="w-3.5 h-3.5" /> {t.high}: {score}
                      </div>
                    )}

                    <button
                      type="button"
                      onClick={() => onStartTrack(song)}
                      className="px-5 py-2 bg-violet-600 hover:bg-violet-500 text-white font-bold rounded-full text-xs transition cursor-pointer flex items-center gap-1.5 shadow-md active:scale-95 shrink-0 hover:shadow-[0_0_15px_rgba(139,92,246,0.4)]"
                    >
                      <Play className="w-3.5 h-3.5 fill-white" /> {t.launchGame}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Right Side: Upload panel & Tutorial - 5 Columns */}
        <div className="md:col-span-5 space-y-6">
          {/* Upload Custom Music Card */}
          <div className="bg-[#0c0c0e]/80 border border-white/10 hover:border-violet-500/30 p-5 rounded-2xl space-y-4 shadow-xl backdrop-blur-md relative overflow-hidden transition duration-300 text-left">
            <div className="absolute inset-0 bg-gradient-to-tr from-violet-600/5 to-transparent pointer-events-none -z-10" />
            
            <div className="flex items-center gap-2">
              <Upload className="w-4.5 h-4.5 text-violet-400" />
              <h2 className="text-white font-bold text-xs tracking-widest uppercase font-mono">{t.uploadCustomMusic}</h2>
            </div>
            
            {/* File drop zone / selector */}
            <div 
              onClick={() => !uploading && fileInputRef.current?.click()}
              className={`border border-dashed border-white/20 hover:border-violet-400/50 rounded-xl p-4 text-center cursor-pointer transition flex flex-col items-center justify-center min-h-[90px] bg-white/5 relative ${
                uploading ? 'pointer-events-none opacity-60' : ''
              }`}
            >
              <input 
                type="file" 
                ref={fileInputRef} 
                onChange={handleFileChange} 
                accept="audio/*" 
                className="hidden" 
              />
              
              {uploading ? (
                <>
                  <Loader2 className="w-6 h-6 text-violet-400 animate-spin mb-2" />
                  <span className="text-[11px] font-mono text-violet-300">{t.decodingAudio}</span>
                </>
              ) : customAudioBuffer ? (
                <>
                  <Music className="w-6 h-6 text-emerald-400 mb-1.5 animate-pulse" />
                  <span className="text-[11px] font-medium text-emerald-400 truncate max-w-[200px]">
                    {t.audioLoaded} ({Math.round(customAudioBuffer.duration)}s)
                  </span>
                  <span className="text-[9px] text-white/40 mt-0.5">{t.clickReplace}</span>
                </>
              ) : (
                <>
                  <Upload className="w-6 h-6 text-white/30 mb-1.5 transition" />
                  <span className="text-[11px] font-medium text-white/70">{t.selectFile}</span>
                  <span className="text-[9px] text-white/40 mt-0.5">{t.maxSizeRecommended}</span>
                </>
              )}
            </div>

            {error && (
              <div className="text-[10px] text-rose-400 bg-rose-500/10 border border-rose-500/20 p-2.5 rounded-lg text-left leading-relaxed">
                ⚠️ {error}
              </div>
            )}

            {/* Form settings (Visible once file is loaded) */}
            {customAudioBuffer && (
              <div className="space-y-3.5 pt-2 border-t border-white/5 animate-in fade-in slide-in-from-top-2 duration-300">
                {/* Song Name Input */}
                <div className="space-y-1">
                  <label className="text-[9px] text-white/50 font-mono uppercase block">{t.songTitle}</label>
                  <input 
                    type="text" 
                    value={songName}
                    onChange={(e) => setSongName(e.target.value)}
                    placeholder={lang === 'zh' ? '请输入歌曲标题' : 'Enter song title'}
                    className="w-full bg-white/5 border border-white/10 focus:border-violet-500/50 rounded-lg px-3 py-1.5 text-xs text-white outline-none transition"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3.5">
                  {/* BPM Input */}
                  <div className="space-y-1">
                    <label className="text-[9px] text-white/50 font-mono uppercase block">{t.tempo}</label>
                    <input 
                      type="number" 
                      value={bpm}
                      onChange={(e) => setBpm(Math.max(1, parseInt(e.target.value) || 0))}
                      min="1"
                      max="300"
                      className="w-full bg-white/5 border border-white/10 focus:border-violet-500/50 rounded-lg px-3 py-1.5 text-xs text-white outline-none transition font-mono"
                    />
                  </div>

                  {/* Difficulty Selection */}
                  <div className="space-y-1">
                    <label className="text-[9px] text-white/50 font-mono uppercase block">{t.difficulty}</label>
                    <select
                      value={difficulty}
                      onChange={(e) => setDifficulty(e.target.value as any)}
                      className="w-full bg-white/5 border border-white/10 focus:border-violet-500/50 rounded-lg px-2.5 py-1.5 text-xs text-white outline-none transition cursor-pointer select-none text-white"
                    >
                      <option value="Easy" className="bg-[#0c0c0e] text-emerald-400">{t.easy}</option>
                      <option value="Medium" className="bg-[#0c0c0e] text-amber-400">{t.medium}</option>
                      <option value="Hard" className="bg-[#0c0c0e] text-rose-400">{t.hard}</option>
                    </select>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={handleAddSong}
                  className="w-full py-2 bg-violet-600 hover:bg-violet-500 text-white font-bold rounded-lg text-xs transition cursor-pointer flex items-center justify-center gap-1.5 shadow-md active:scale-95 hover:shadow-[0_0_15px_rgba(139,92,246,0.35)]"
                >
                  <Plus className="w-3.5 h-3.5" /> {t.integrateTrack}
                </button>
              </div>
            )}
          </div>

          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <HelpCircle className="w-4.5 h-4.5 text-rose-400" />
              <h2 className="text-white font-bold text-xs tracking-widest uppercase font-mono">{t.howToPlay}</h2>
            </div>

            <div className="bg-black/20 border border-white/10 p-6 rounded-2xl space-y-4 shadow-lg">
              
              <div className="flex gap-3">
                <div className="h-6 w-6 rounded-full bg-rose-500/10 text-rose-400 border border-rose-500/25 font-black text-xs flex items-center justify-center shrink-0">1</div>
                <div className="text-xs space-y-1 font-sans">
                  <span className="font-bold text-white/90 block">{t.matchTargetsTitle}</span>
                  <p className="text-white/50">
                    {t.matchTargetsDesc}
                  </p>
                </div>
              </div>

              <div className="flex gap-3">
                <div className="h-6 w-6 rounded-full bg-violet-500/10 text-violet-400 border border-violet-500/25 font-black text-xs flex items-center justify-center shrink-0">2</div>
                <div className="text-xs space-y-1 font-sans">
                  <span className="font-bold text-white/90 block">{t.dodgeWallsTitle}</span>
                  <p className="text-white/50">
                    {t.dodgeWallsDesc}
                  </p>
                </div>
              </div>

              <div className="flex gap-3">
                <div className="h-6 w-6 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/25 font-black text-xs flex items-center justify-center shrink-0">3</div>
                <div className="text-xs space-y-1 font-sans">
                  <span className="font-bold text-white/90 block">{t.maintainCombosTitle}</span>
                  <p className="text-white/50">
                    {t.maintainCombosDesc}
                  </p>
                </div>
              </div>

              {/* Simulated fallback notice */}
              <div className="pt-3.5 border-t border-white/10 bg-white/5 p-3 rounded-xl border border-white/10 flex items-start gap-2.5">
                <Smile className="w-4 h-4 text-violet-400 shrink-0 mt-0.5" />
                <div className="text-[10px] text-white/50 font-sans">
                  <span className="font-semibold text-white/80 block mb-0.5">🎮 {t.deviceFallbackTitle}</span>
                  {t.deviceFallbackDesc}
                </div>
              </div>

            </div>
          </div>
        </div>

      </div>
    </div>
  );
}
