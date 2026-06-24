/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export interface Keypoint {
  x: number; // Normalized (0 to 1) or canvas pixels
  y: number; // Normalized (0 to 1) or canvas pixels
  score: number;
}

export interface PoseData {
  nose?: Keypoint;
  leftEye?: Keypoint;
  rightEye?: Keypoint;
  leftEar?: Keypoint;
  rightEar?: Keypoint;
  leftShoulder?: Keypoint;
  rightShoulder?: Keypoint;
  leftElbow?: Keypoint;
  rightElbow?: Keypoint;
  leftWrist?: Keypoint;
  rightWrist?: Keypoint;
  leftHip?: Keypoint;
  rightHip?: Keypoint;
}

export type BeatType = 'left' | 'right' | 'crouch';

export interface BeatNote {
  id: string;
  time: number; // Peak time of the beat in seconds relative to song start
  type: BeatType;
  x: number;    // Multiplier/Target canvas coordinate X (e.g. percentage 0.1 to 0.9 or exact coordinate)
  y: number;    // Multiplier/Target canvas coordinate Y
  hit: boolean;
  miss: boolean;
  hitRating?: 'Perfect' | 'Good' | 'Miss';
}

export interface SongTrack {
  id: string;
  name: string;
  genre: string;
  bpm: number;
  duration: number; // In seconds
  difficulty: 'Easy' | 'Medium' | 'Hard';
  description: string;
  beats: BeatNote[];
  isCustom?: boolean;
  audioBuffer?: AudioBuffer;
}

export type GameStatus = 'IDLE' | 'CALIBRATING' | 'PLAYING' | 'GAMEOVER';

export interface GameStats {
  score: number;
  combo: number;
  maxCombo: number;
  perfectCount: number;
  goodCount: number;
  missCount: number;
}

export interface CalibrationData {
  crouchYThreshold: number; // Y coordinate beyond which is counted as a crouch
  neutralY: number;        // Neutral nose/shoulder Y coordinate
  isCalibrated: boolean;
}
