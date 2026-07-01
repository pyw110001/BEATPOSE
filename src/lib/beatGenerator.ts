/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { ChartNote, SongTrack, BeatType, BeatGrid } from '../types';

// Helper to generate precise rhythmic beat lists matching song BPM
export function generateSongBeats(
  id: string,
  grid: BeatGrid,
  duration: number,
  difficulty: 'Easy' | 'Medium' | 'Hard'
): ChartNote[] {
  const beats: ChartNote[] = [];
  const secondsPerBeat = 60.0 / grid.bpm;
  
  // Choose frequency multiplier based on difficulty (in beats)
  let stepInterval = 4;
  if (difficulty === 'Medium') stepInterval = 2;
  if (difficulty === 'Hard') stepInterval = 1;

  let idCounter = 1;

  // Start beat index: absolute time must be at least 4.0s for preparation
  const startBeat = Math.max(0, Math.ceil((4.0 - grid.firstBeatOffsetSec) / secondsPerBeat));
  
  // End beat index: absolute time up to duration - 3.0s
  const endBeat = Math.floor((duration - 3.0 - grid.firstBeatOffsetSec) / secondsPerBeat);

  for (let beat = startBeat; beat <= endBeat; beat += stepInterval) {
    const beatTime = grid.firstBeatOffsetSec + beat * secondsPerBeat;
    
    // Choose the target beat action type
    const index = beats.length;
    let type: BeatType = 'left';
    if (index % 2 === 1) {
      type = 'right';
    }

    // Helper to generate a random float within a range (rounded to 3 decimals)
    const randomRange = (min: number, max: number) => parseFloat((Math.random() * (max - min) + min).toFixed(3));

    // Set precise coordinates with randomized locations but maintaining left/right side separation
    let xFraction = 0.5;
    let yFraction = 0.35; // Default for crouch obstacle

    if (type === 'left') {
      xFraction = randomRange(0.15, 0.42); // Left half of screen
      yFraction = randomRange(0.38, 0.65); // Mid-height range
    } else if (type === 'right') {
      xFraction = randomRange(0.58, 0.85); // Right half of screen
      yFraction = randomRange(0.38, 0.65); // Mid-height range
    }

    const directions: ('up' | 'down' | 'left' | 'right' | 'any')[] = ['up', 'down', 'left', 'right', 'any'];
    const cutDirection = directions[Math.floor(Math.random() * directions.length)];

    beats.push({
      id: `${id}_beat_${idCounter++}`,
      beat,
      time: parseFloat(beatTime.toFixed(3)),
      type,
      x: xFraction,
      y: yFraction,
      hit: false,
      miss: false,
      cutDirection,
    });
  }

  return beats;
}

export const TEMPLATE_SONGS: SongTrack[] = [
  {
    id: 'synthwave',
    name: 'Synthwave Neon Drive',
    genre: 'Synthwave',
    bpm: 110,
    duration: 50,
    difficulty: 'Easy',
    description: 'A smooth nostalgic groove with warm basslines and predictable eighth-note patterns.',
    beatGrid: {
      bpm: 110,
      firstBeatOffsetSec: 0.0,
      beatsPerBar: 4,
      inputLatencySec: 0.05,
      audioLatencySec: 0.0,
    },
    beats: [],
  },
  {
    id: 'cyberpunk',
    name: 'Cyberpunk Reckoning',
    genre: 'Techno / Electro',
    bpm: 135,
    duration: 55,
    difficulty: 'Hard',
    description: 'An aggressive, high-speed electronic banger with fast sweeps and frequent crouching dodges.',
    beatGrid: {
      bpm: 135,
      firstBeatOffsetSec: 0.0,
      beatsPerBar: 4,
      inputLatencySec: 0.05,
      audioLatencySec: 0.0,
    },
    beats: [],
  },
  {
    id: 'ambient',
    name: 'Ambient Grid Runner',
    genre: 'Ambient Pulse',
    bpm: 90,
    duration: 45,
    difficulty: 'Medium',
    description: 'Relaxed cybernetic pulses with spacious intervals and gentle bell melodies.',
    beatGrid: {
      bpm: 90,
      firstBeatOffsetSec: 0.0,
      beatsPerBar: 4,
      inputLatencySec: 0.05,
      audioLatencySec: 0.0,
    },
    beats: [],
  },
];

// Initialize templates beats list based on their respective beatGrid
TEMPLATE_SONGS.forEach((song) => {
  if (song.beatGrid) {
    song.beats = generateSongBeats(song.id, song.beatGrid, song.duration, song.difficulty);
  }
});

// Generate notes directly at the detected beat positions
export function generateBeatsFromPositions(
  id: string,
  beatPositions: number[],
  difficulty: 'Easy' | 'Medium' | 'Hard'
): ChartNote[] {
  const beats: ChartNote[] = [];
  
  // Choose frequency step based on difficulty
  let stepInterval = 4;
  if (difficulty === 'Medium') stepInterval = 2;
  if (difficulty === 'Hard') stepInterval = 1;

  let idCounter = 1;

  for (let i = 0; i < beatPositions.length; i += stepInterval) {
    const beatTime = beatPositions[i];
    
    // Preparation buffer: don't spawn notes in the first 3.5 seconds
    if (beatTime < 3.5) continue;

    const index = beats.length;
    let type: BeatType = 'left';
    if (index % 2 === 1) {
      type = 'right';
    }

    const randomRange = (min: number, max: number) => parseFloat((Math.random() * (max - min) + min).toFixed(3));

    let xFraction = 0.5;
    let yFraction = 0.35;

    if (type === 'left') {
      xFraction = randomRange(0.15, 0.42);
      yFraction = randomRange(0.38, 0.65);
    } else if (type === 'right') {
      xFraction = randomRange(0.58, 0.85);
      yFraction = randomRange(0.38, 0.65);
    }

    const directions: ('up' | 'down' | 'left' | 'right' | 'any')[] = ['up', 'down', 'left', 'right', 'any'];
    const cutDirection = directions[Math.floor(Math.random() * directions.length)];

    beats.push({
      id: `${id}_beat_${idCounter++}`,
      beat: i,
      time: parseFloat(beatTime.toFixed(3)),
      type,
      x: xFraction,
      y: yFraction,
      hit: false,
      miss: false,
      cutDirection,
    });
  }

  return beats;
}
