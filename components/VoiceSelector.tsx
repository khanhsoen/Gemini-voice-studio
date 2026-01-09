import React from 'react';
import { VoiceName, VoiceOption } from '../types';

interface VoiceSelectorProps {
  selectedVoice: VoiceName;
  onSelect: (voice: VoiceName) => void;
  disabled?: boolean;
}

const VOICES: VoiceOption[] = [
  { id: VoiceName.Kore, name: 'Kore', description: 'Calm, soothing, nature-inspired', gender: 'Female' },
  { id: VoiceName.Fenrir, name: 'Fenrir', description: 'Deep, resonant, authoritative', gender: 'Male' },
  { id: VoiceName.Puck, name: 'Puck', description: 'Playful, energetic, mischievous', gender: 'Male' },
  { id: VoiceName.Charon, name: 'Charon', description: 'Steady, deep, composed', gender: 'Male' },
  { id: VoiceName.Zephyr, name: 'Zephyr', description: 'Light, airy, soft', gender: 'Female' },
];

const VoiceSelector: React.FC<VoiceSelectorProps> = ({ selectedVoice, onSelect, disabled }) => {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
      {VOICES.map((voice) => (
        <button
          key={voice.id}
          onClick={() => onSelect(voice.id)}
          disabled={disabled}
          className={`
            relative p-4 rounded-xl border text-left transition-all duration-200
            ${selectedVoice === voice.id 
              ? 'border-blue-500 bg-blue-900/20 shadow-[0_0_15px_rgba(59,130,246,0.3)]' 
              : 'border-slate-700 bg-slate-800/50 hover:border-slate-500 hover:bg-slate-800'
            }
            ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
          `}
        >
          <div className="flex items-center justify-between mb-1">
            <span className={`font-semibold ${selectedVoice === voice.id ? 'text-blue-400' : 'text-slate-200'}`}>
              {voice.name}
            </span>
            <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-slate-700 text-slate-300">
              {voice.gender}
            </span>
          </div>
          <p className="text-sm text-slate-400">{voice.description}</p>
          
          {selectedVoice === voice.id && (
            <div className="absolute top-2 right-2 w-2 h-2 rounded-full bg-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.8)]" />
          )}
        </button>
      ))}
    </div>
  );
};

export default VoiceSelector;
