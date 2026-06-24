/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { BeatNote, SongTrack, BeatType } from '../types';

export class AudioEngine {
  private ctx: AudioContext | null = null;
  private isPlaying = false;
  private bpm = 120;
  private startTime = 0;
  private currentBeat = 0;
  private nextNoteTime = 0;
  private scheduleAheadTime = 0.1; // How far ahead to schedule audio (seconds)
  private lookahead = 25.0; // How frequently to call scheduler (ms)
  private timerId: number | null = null;
  private onBeatTrigger: ((beatTime: number, beatIndex: number) => void) | null = null;
  private songDuration = 60; // in seconds
  private beatCallbackHistory: Set<number> = new Set();
  private songId = '';
  private customSource: AudioBufferSourceNode | null = null;
  private isCustomTrack = false;
  private previewSource: AudioBufferSourceNode | null = null;
  private previewStartTime = 0;

  constructor() {
    // Audio Context is initialized lazily upon user interaction
  }

  private initCtx() {
    if (!this.ctx) {
      this.ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    }
    if (this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }

  public async decodeAudio(arrayBuffer: ArrayBuffer): Promise<AudioBuffer> {
    this.initCtx();
    if (!this.ctx) {
      throw new Error('AudioContext failed to initialize');
    }
    return await this.ctx.decodeAudioData(arrayBuffer);
  }

  public startSong(track: SongTrack, onBeat: (beatTime: number, beatIndex: number) => void) {
    this.initCtx();
    if (!this.ctx) return;

    this.stop();

    this.isPlaying = true;
    this.bpm = track.bpm;
    this.songDuration = track.duration;
    this.songId = track.id;
    this.isCustomTrack = !!track.isCustom;
    this.onBeatTrigger = onBeat;
    this.beatCallbackHistory.clear();

    this.startTime = this.ctx.currentTime + 0.3; // Short delay to let filters stabilize
    this.nextNoteTime = this.startTime;
    this.currentBeat = 0;

    // Play custom audio buffer if it exists
    if (this.isCustomTrack && track.audioBuffer) {
      this.customSource = this.ctx.createBufferSource();
      this.customSource.buffer = track.audioBuffer;
      this.customSource.connect(this.ctx.destination);
      this.customSource.start(this.startTime);
    }

    this.scheduler();
  }

  public stop() {
    this.isPlaying = false;
    if (this.timerId !== null) {
      clearTimeout(this.timerId);
      this.timerId = null;
    }
    if (this.customSource !== null) {
      try {
        this.customSource.stop();
      } catch (e) {
        // Source might not have started or already stopped
      }
      this.customSource = null;
    }
  }

  public getCurrentTime(): number {
    if (!this.ctx || !this.isPlaying) return 0;
    return Math.max(0, this.ctx.currentTime - this.startTime);
  }

  private scheduler() {
    if (!this.isPlaying || !this.ctx) return;

    // While there are notes to play before the next scheduled frame...
    while (this.nextNoteTime < this.ctx.currentTime + this.scheduleAheadTime) {
      const beatRelativeTime = this.nextNoteTime - this.startTime;
      if (beatRelativeTime >= this.songDuration) {
        this.stop();
        return;
      }

      this.scheduleNote(this.currentBeat, this.nextNoteTime);
      this.advanceNote();
    }

    this.timerId = window.setTimeout(() => this.scheduler(), this.lookahead);
  }

  private advanceNote() {
    const secondsPerBeat = 60.0 / this.bpm;
    
    // In our synth, let's schedule eighth notes (0.5 beats per note step) for better rhythmic richness
    const stepDuration = 0.5 * secondsPerBeat; 
    
    this.nextNoteTime += stepDuration;
    this.currentBeat++;
  }

  // Scheduling dynamic drums and synthesize neon melodies!
  private scheduleNote(step: number, time: number) {
    if (!this.ctx) return;

    const isDownbeat = step % 8 === 0;
    const isMainBeat = step % 4 === 0;
    const isOffbeat = step % 4 === 2;
    const isEighth = step % 2 === 1;

    // Trigger game events at the exact visual schedule matching beats (typically on quarter beats)
    if (isMainBeat && this.onBeatTrigger) {
      const beatIndexInSong = step / 4;
      const exactBeatTimeInSong = (step * (60.0 / this.bpm) * 0.5);
      
      // Schedule visual update slightly early for projection matching
      const delayMs = Math.max(0, (time - this.ctx.currentTime) * 1000);
      setTimeout(() => {
        if (this.isPlaying && this.onBeatTrigger) {
          this.onBeatTrigger(exactBeatTimeInSong, beatIndexInSong);
        }
      }, delayMs);
    }

    if (this.isCustomTrack) {
      // Custom track: bypass background synth/drum generation
      return;
    }

    // Drum synthesis (Kick drum on 1, 3)
    if (isMainBeat) {
      this.createKick(time);
    }

    // Snare / Clap synthesis on 2, 4
    if (isOffbeat) {
      this.createSnare(time);
    }

    // Hi-hats
    if (isEighth || isOffbeat) {
      this.createHihat(time, isOffbeat ? 0.08 : 0.04);
    }

    // Synth loops matching the song design
    if (this.songId === 'synthwave') {
      this.playSynthwaveBass(step, time);
    } else if (this.songId === 'cyberpunk') {
      this.playCyberpunkBass(step, time);
    } else {
      this.playAmbientPulse(step, time);
    }
  }

  // --- Drum Synthesizers ---
  private createKick(time: number) {
    const ctx = this.ctx;
    if (!ctx) return;

    const osc = ctx.createOscillator();
    const gainNode = ctx.createGain();

    osc.connect(gainNode);
    gainNode.connect(ctx.destination);

    // Deep electronic kick filter sweep
    osc.frequency.setValueAtTime(150, time);
    osc.frequency.exponentialRampToValueAtTime(0.01, time + 0.3);

    gainNode.gain.setValueAtTime(0.6, time);
    gainNode.gain.exponentialRampToValueAtTime(0.01, time + 0.25);

    osc.start(time);
    osc.stop(time + 0.3);
  }

  private createSnare(time: number) {
    const ctx = this.ctx;
    if (!ctx) return;

    // White noise generator
    const bufferSize = ctx.sampleRate * 0.2; // 0.2s duration
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = Math.random() * 2 - 1;
    }

    const noiseNode = ctx.createBufferSource();
    noiseNode.buffer = buffer;

    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = 1000;

    const gainNode = ctx.createGain();
    gainNode.gain.setValueAtTime(0.35, time);
    gainNode.gain.exponentialRampToValueAtTime(0.01, time + 0.15);

    noiseNode.connect(filter);
    filter.connect(gainNode);
    gainNode.connect(ctx.destination);

    // Snap snare oscillator punch
    const snapOsc = ctx.createOscillator();
    const snapGain = ctx.createGain();
    snapOsc.type = 'triangle';
    snapOsc.frequency.setValueAtTime(180, time);
    
    snapGain.gain.setValueAtTime(0.4, time);
    snapGain.gain.exponentialRampToValueAtTime(0.01, time + 0.08);

    snapOsc.connect(snapGain);
    snapGain.connect(ctx.destination);

    noiseNode.start(time);
    noiseNode.stop(time + 0.2);
    snapOsc.start(time);
    snapOsc.stop(time + 0.1);
  }

  private createHihat(time: number, duration: number) {
    const ctx = this.ctx;
    if (!ctx) return;

    const bufferSize = ctx.sampleRate * duration;
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = Math.random() * 2 - 1;
    }

    const source = ctx.createBufferSource();
    source.buffer = buffer;

    const filter = ctx.createBiquadFilter();
    filter.type = 'highpass';
    filter.frequency.value = 7500;

    const gainNode = ctx.createGain();
    gainNode.gain.setValueAtTime(0.12, time);
    gainNode.gain.exponentialRampToValueAtTime(0.001, time + duration);

    source.connect(filter);
    filter.connect(gainNode);
    gainNode.connect(ctx.destination);

    source.start(time);
    source.stop(time + duration);
  }

  // --- Melodic Synthesizers ---
  private playSynthwaveBass(step: number, time: number) {
    const ctx = this.ctx;
    if (!ctx) return;

    // Classic 8-note driving Synthwave root notes (I - bVII - bVI - bV)
    // Notes: C2 (65Hz), Bb1 (58Hz), Ab1 (52Hz), G1 (49Hz)
    const notes = [65.41, 65.41, 58.27, 58.27, 51.91, 51.91, 49.00, 49.00];
    const pitch = notes[Math.floor(step / 8) % notes.length];

    const osc = ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(pitch, time);

    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.Q.value = 6;
    // Sweep sound
    filter.frequency.setValueAtTime(300, time);
    filter.frequency.exponentialRampToValueAtTime(800, time + 0.1);

    const gainNode = ctx.createGain();
    const accent = (step % 4 === 0) ? 0.35 : 0.2;
    gainNode.gain.setValueAtTime(accent, time);
    gainNode.gain.exponentialRampToValueAtTime(0.005, time + 0.18);

    osc.connect(filter);
    filter.connect(gainNode);
    gainNode.connect(ctx.destination);

    osc.start(time);
    osc.stop(time + 0.2);

    // Melody lead lines on top!
    if (step % 16 === 8 || step % 16 === 12 || step % 16 === 14) {
      const melodyNotes = [130.81, 146.83, 196.00, 261.63, 293.66, 392.00]; // Pentatonic scales
      const leadPitch = melodyNotes[Math.floor(step / 4) * 2 % melodyNotes.length] * 2; // high octave
      
      this.playLeadNote(leadPitch, time, 0.2, 0.15);
    }
  }

  private playCyberpunkBass(step: number, time: number) {
    const ctx = this.ctx;
    if (!ctx) return;

    // Deep rhythmic driving techno baseline
    // Eb2 (73.4Hz), D2 (73.4Hz), F2 (87.3Hz)
    let pitch = 73.42; // Eb2
    const block = Math.floor(step / 16) % 4;
    if (block === 1) pitch = 65.41; // C2
    if (block === 2) pitch = 87.31; // F2
    if (block === 3) pitch = 69.30; // Db2

    const osc = ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(pitch, time);

    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(150, time);
    filter.frequency.exponentialRampToValueAtTime(450, time + 0.08);

    const gainNode = ctx.createGain();
    const volume = 0.45;
    gainNode.gain.setValueAtTime(volume, time);
    gainNode.gain.exponentialRampToValueAtTime(0.01, time + 0.12);

    osc.connect(filter);
    filter.connect(gainNode);
    gainNode.connect(ctx.destination);

    osc.start(time);
    osc.stop(time + 0.15);

    // Extra high piercing techno beep synthesizer on eighths
    if (step % 32 === 4 || step % 32 === 12 || step % 32 === 22 || step % 32 === 30) {
      this.playLeadNote(pitch * 4, time, 0.06, 0.08);
    }
  }

  private playAmbientPulse(step: number, time: number) {
    const ctx = this.ctx;
    if (!ctx) return;

    // Ethereal progression
    // Am (A2: 110Hz) -> Fmaj (F2: 87Hz) -> Cmaj (C2: 65Hz) -> Gmaj (G2: 98Hz)
    const chords = [110.00, 87.31, 65.41, 98.00];
    const root = chords[Math.floor(step/16) % chords.length];

    const osc = ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(root, time);

    const gainNode = ctx.createGain();
    gainNode.gain.setValueAtTime(0.3, time);
    gainNode.gain.linearRampToValueAtTime(0.001, time + 0.35);

    osc.connect(gainNode);
    gainNode.connect(ctx.destination);

    osc.start(time);
    osc.stop(time + 0.4);

    // Polyphonic gentle bells
    if (step % 8 === 2 || step % 8 === 6) {
      const bellNote = root * 3; // Fifth harmonic harmonic range
      this.playBellNote(bellNote, time, 0.4);
    }
  }

  private playLeadNote(frequency: number, time: number, dur: number, vol: number) {
    const ctx = this.ctx;
    if (!ctx) return;

    const osc = ctx.createOscillator();
    const gainNode = ctx.createGain();
    const delay = ctx.createDelay();
    const feedback = ctx.createGain();

    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(frequency, time);

    gainNode.gain.setValueAtTime(vol, time);
    gainNode.gain.exponentialRampToValueAtTime(0.001, time + dur);

    delay.delayTime.value = 0.15;
    feedback.gain.value = 0.3;

    osc.connect(gainNode);
    gainNode.connect(ctx.destination);

    // Simple delay network integration
    gainNode.connect(delay);
    delay.connect(feedback);
    feedback.connect(delay);
    delay.connect(ctx.destination);

    osc.start(time);
    osc.stop(time + dur * 1.5);
  }

  private playBellNote(frequency: number, time: number, vol: number) {
    const ctx = this.ctx;
    if (!ctx) return;

    const osc = ctx.createOscillator();
    const subOsc = ctx.createOscillator();
    const gainNode = ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(frequency, time);

    subOsc.type = 'triangle';
    subOsc.frequency.setValueAtTime(frequency * 1.5, time); // Fifth ring

    gainNode.gain.setValueAtTime(vol, time);
    gainNode.gain.exponentialRampToValueAtTime(0.001, time + 0.6);

    osc.connect(gainNode);
    subOsc.connect(gainNode);
    gainNode.connect(ctx.destination);

    osc.start(time);
    subOsc.start(time);
    osc.stop(time + 0.7);
    subOsc.stop(time + 0.7);
  }

  // --- Sound Effects ---
  public playHitSound(type: BeatType) {
    this.initCtx();
    const ctx = this.ctx;
    if (!ctx) return;

    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gainNode = ctx.createGain();

    if (type === 'left') {
      osc.type = 'sine';
      osc.frequency.setValueAtTime(500, now);
      osc.frequency.exponentialRampToValueAtTime(800, now + 0.08);
      gainNode.gain.setValueAtTime(0.35, now);
    } else if (type === 'right') {
      osc.type = 'sine';
      osc.frequency.setValueAtTime(600, now);
      osc.frequency.exponentialRampToValueAtTime(950, now + 0.08);
      gainNode.gain.setValueAtTime(0.35, now);
    } else { // Crouch success
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(250, now);
      osc.frequency.exponentialRampToValueAtTime(500, now + 0.12);
      gainNode.gain.setValueAtTime(0.4, now);
    }

    gainNode.gain.exponentialRampToValueAtTime(0.001, now + 0.1);

    osc.connect(gainNode);
    gainNode.connect(ctx.destination);

    osc.start(now);
    osc.stop(now + 0.12);
  }

  public playMissSound() {
    this.initCtx();
    const ctx = this.ctx;
    if (!ctx) return;

    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gainNode = ctx.createGain();

    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(140, now);
    osc.frequency.linearRampToValueAtTime(60, now + 0.2);

    gainNode.gain.setValueAtTime(0.25, now);
    gainNode.gain.linearRampToValueAtTime(0.001, now + 0.22);

    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 400;

    osc.connect(filter);
    filter.connect(gainNode);
    gainNode.connect(ctx.destination);

    osc.start(now);
    osc.stop(now + 0.25);
  }

  public playSuccessSound() {
    this.initCtx();
    const ctx = this.ctx;
    if (!ctx) return;

    const now = ctx.currentTime;
    const chords = [261.63, 329.63, 392.00, 523.25]; // C major chord arpeggio
    
    chords.forEach((note, index) => {
      const osc = ctx.createOscillator();
      const gainNode = ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(note, now + index * 0.06);

      gainNode.gain.setValueAtTime(0.18, now + index * 0.06);
      gainNode.gain.exponentialRampToValueAtTime(0.001, now + index * 0.06 + 0.25);

      osc.connect(gainNode);
      gainNode.connect(ctx.destination);

      osc.start(now + index * 0.06);
      osc.stop(now + index * 0.06 + 0.3);
    });
  }

  public startPreview(buffer: AudioBuffer) {
    this.initCtx();
    if (!this.ctx) return;
    this.stopPreview();

    this.previewSource = this.ctx.createBufferSource();
    this.previewSource.buffer = buffer;
    this.previewSource.connect(this.ctx.destination);
    this.previewStartTime = this.ctx.currentTime;
    
    this.previewSource.onended = () => {
      this.previewSource = null;
    };
    
    this.previewSource.start(0);
  }

  public stopPreview() {
    if (this.previewSource) {
      try {
        this.previewSource.stop();
      } catch (e) {}
      this.previewSource = null;
    }
  }

  public getPreviewTime(): number {
    if (!this.ctx || !this.previewSource) return 0;
    return this.ctx.currentTime - this.previewStartTime;
  }

  public isPreviewPlaying(): boolean {
    return !!this.previewSource;
  }
}

// Single active instance
export const gameAudioEngine = new AudioEngine();
