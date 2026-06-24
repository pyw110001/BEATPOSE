import Essentia from 'essentia.js/dist/essentia.js-core.es.js';
import { EssentiaWASM } from 'essentia.js/dist/essentia-wasm.es.js';

let essentiaInstance: any = null;

export function getEssentiaInstance() {
  if (!essentiaInstance) {
    essentiaInstance = new Essentia(EssentiaWASM);
  }
  return essentiaInstance;
}

export interface AudioAnalysisResult {
  bpm: number;
  beats: number[];
  onsets: number[];
}

export async function analyzeAudioBuffer(audioBuffer: AudioBuffer): Promise<AudioAnalysisResult> {
  const essentia = getEssentiaInstance();
  const channelData = audioBuffer.getChannelData(0); // Mono channel data

  let audioVector = null;
  let rhythmResult = null;
  let onsetsResult = null;

  try {
    // Convert Float32Array to Essentia's WASM VectorFloat
    audioVector = essentia.arrayToVector(channelData);

    // RhythmExtractor2013: extracts estimated BPM and beat positions (ticks)
    // Params: signal, maxTempo (208), method ("multifeature"), minTempo (40)
    rhythmResult = essentia.RhythmExtractor2013(audioVector, 208, 'multifeature', 40);
    const bpm = rhythmResult.bpm;
    const ticksFloat32 = essentia.vectorToArray(rhythmResult.ticks);
    const beats = Array.from(ticksFloat32);

    // SuperFluxExtractor: extracts transient onset peaks
    // Params: signal, combine (20ms), frameSize (2048), hopSize (256), ratioThreshold (16), sampleRate, threshold (0.05)
    onsetsResult = essentia.SuperFluxExtractor(
      audioVector,
      20,
      2048,
      256,
      16,
      audioBuffer.sampleRate,
      0.05
    );
    const onsetsFloat32 = essentia.vectorToArray(onsetsResult.onsets);
    const onsets = Array.from(onsetsFloat32);

    return {
      bpm: Math.round(bpm) || 120,
      beats,
      onsets,
    };
  } catch (error) {
    console.error('Essentia.js analysis failed:', error);
    throw error;
  } finally {
    // Explicitly delete WASM heap allocations to prevent memory leaks
    if (audioVector) {
      try {
        audioVector.delete();
      } catch (e) {
        console.warn('Failed to delete audioVector:', e);
      }
    }
    if (rhythmResult && rhythmResult.ticks) {
      try {
        rhythmResult.ticks.delete();
      } catch (e) {
        console.warn('Failed to delete rhythmResult.ticks:', e);
      }
    }
    if (onsetsResult && onsetsResult.onsets) {
      try {
        onsetsResult.onsets.delete();
      } catch (e) {
        console.warn('Failed to delete onsetsResult.onsets:', e);
      }
    }
  }
}
