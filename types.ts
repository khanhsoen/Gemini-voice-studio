export enum VoiceName {
  Puck = 'Puck',
  Charon = 'Charon',
  Kore = 'Kore',
  Fenrir = 'Fenrir',
  Zephyr = 'Zephyr',
}

export interface VoiceOption {
  id: VoiceName;
  name: string;
  description: string;
  gender: 'Male' | 'Female';
}

export interface GeneratedAudio {
  id: string;
  text: string;
  voice: VoiceName;
  timestamp: number;
  audioBuffer: AudioBuffer | null;
  duration: number;
}
