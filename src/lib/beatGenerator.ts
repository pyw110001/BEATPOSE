/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { BeatNote, SongTrack, BeatType } from '../types';

// Helper to generate precise rhythmic beat lists matching song BPM
export function generateSongBeats(
  id: string,
  bpm: number,
  duration: number,
  difficulty: 'Easy' | 'Medium' | 'Hard'
): BeatNote[] {
  const beats: BeatNote[] = [];
  const secondsPerBeat = 60.0 / bpm;
  
  // Choose frequency multiplier based on difficulty
  // Easy: beat every 4 quarter beats
  // Medium: beat every 2 quarter beats
  // Hard: beat every beat or complex combinations
  let stepInterval = 4;
  if (difficulty === 'Medium') stepInterval = 2;
  if (difficulty === 'Hard') stepInterval = 1.5;

  let idCounter = 1;

  // Let's loop step beats from 4 seconds onward (to give user time to prepare) up to duration - 3 seconds
  const startOffset = 4.0; // seconds
  const endOffset = duration - 3.0; // seconds

  const totalBeats = Math.floor((endOffset - startOffset) / (secondsPerBeat * stepInterval));

  for (let i = 0; i < totalBeats; i++) {
    const beatTime = startOffset + i * secondsPerBeat * stepInterval;
    
    // Choose the target beat action type
    // Random or structured:
    // Every 8th beat could be a Crouch to add dynamic excitement
    let type: BeatType = 'left';
    if (i % 8 === 7) {
      type = 'crouch';
    } else if (i % 2 === 1) {
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

    beats.push({
      id: `${id}_beat_${idCounter++}`,
      time: parseFloat(beatTime.toFixed(3)),
      type,
      x: xFraction,
      y: yFraction,
      hit: false,
      miss: false,
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
    beats: generateSongBeats('synthwave', 110, 50, 'Easy'),
  },
  {
    id: 'cyberpunk',
    name: 'Cyberpunk Reckoning',
    genre: 'Techno / Electro',
    bpm: 135,
    duration: 55,
    difficulty: 'Hard',
    description: 'An aggressive, high-speed electronic banger with fast sweeps and frequent crouching dodges.',
    beats: generateSongBeats('cyberpunk', 135, 55, 'Hard'),
  },
  {
    id: 'ambient',
    name: 'Ambient Grid Runner',
    genre: 'Ambient Pulse',
    bpm: 90,
    duration: 45,
    difficulty: 'Medium',
    description: 'Relaxed cybernetic pulses with spacious intervals and gentle bell melodies.',
    beats: generateSongBeats('ambient', 90, 45, 'Medium'),
  },
];
