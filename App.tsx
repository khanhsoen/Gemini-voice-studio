import React, { useState, useRef, useEffect, useCallback } from 'react';
import { VoiceName, GeneratedAudio } from './types';
import VoiceSelector from './components/VoiceSelector';
import AudioVisualizer from './components/AudioVisualizer';
import { generateSpeech } from './services/geminiService';
import { v4 as uuidv4 } from 'uuid'; // We'll just use a simple random string generator helper actually since we can't install uuid package

// Simple ID generator since we can't rely on external packages besides standard ones
const generateId = () => Math.random().toString(36).substring(2, 9);

const App: React.FC = () => {
  const [inputText, setInputText] = useState('');
  const [selectedVoice, setSelectedVoice] = useState<VoiceName>(VoiceName.Kore);
  const [isGenerating, setIsGenerating] = useState(false);
  const [history, setHistory] = useState<GeneratedAudio[]>([]);
  const [currentAudioId, setCurrentAudioId] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Audio Context & Nodes refs
  const audioContextRef = useRef<AudioContext | null>(null);
  const sourceNodeRef = useRef<AudioBufferSourceNode | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const gainNodeRef = useRef<GainNode | null>(null);

  // Initialize Audio Context lazily (user interaction required)
  const getAudioContext = useCallback(() => {
    if (!audioContextRef.current) {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      audioContextRef.current = new AudioCtx({ sampleRate: 24000 });
      
      // Setup Analyser
      analyserRef.current = audioContextRef.current.createAnalyser();
      analyserRef.current.fftSize = 256;
      
      // Setup Gain
      gainNodeRef.current = audioContextRef.current.createGain();
      gainNodeRef.current.gain.value = 1.0;
      
      // Connect Graph: Source (created later) -> Analyser -> Gain -> Destination
      analyserRef.current.connect(gainNodeRef.current);
      gainNodeRef.current.connect(audioContextRef.current.destination);
    }
    
    // Resume if suspended (common browser policy)
    if (audioContextRef.current.state === 'suspended') {
      audioContextRef.current.resume();
    }
    
    return audioContextRef.current;
  }, []);

  const stopPlayback = useCallback(() => {
    if (sourceNodeRef.current) {
      try {
        sourceNodeRef.current.stop();
        sourceNodeRef.current.disconnect();
      } catch (e) {
        // Ignore errors if already stopped
      }
      sourceNodeRef.current = null;
    }
    setIsPlaying(false);
    setCurrentAudioId(null);
  }, []);

  const playAudio = useCallback(async (item: GeneratedAudio) => {
    // If clicking the currently playing item, toggle stop
    if (currentAudioId === item.id && isPlaying) {
      stopPlayback();
      return;
    }

    // Stop any existing playback
    stopPlayback();

    const ctx = getAudioContext();
    if (!item.audioBuffer) return;

    const source = ctx.createBufferSource();
    source.buffer = item.audioBuffer;
    
    if (analyserRef.current) {
      source.connect(analyserRef.current);
    }

    source.onended = () => {
      setIsPlaying(false);
      setCurrentAudioId(null);
    };

    source.start();
    sourceNodeRef.current = source;
    setCurrentAudioId(item.id);
    setIsPlaying(true);
  }, [currentAudioId, isPlaying, getAudioContext, stopPlayback]);

  const handleGenerate = async () => {
    if (!inputText.trim()) return;
    
    setError(null);
    setIsGenerating(true);
    stopPlayback();

    try {
      const ctx = getAudioContext();
      const audioBuffer = await generateSpeech(inputText, selectedVoice, ctx);
      
      const newItem: GeneratedAudio = {
        id: generateId(),
        text: inputText,
        voice: selectedVoice,
        timestamp: Date.now(),
        audioBuffer: audioBuffer,
        duration: audioBuffer.duration
      };

      setHistory(prev => [newItem, ...prev]);
      
      // Auto-play the new generation
      playAudio(newItem);
      
    } catch (err: any) {
      setError(err.message || "Failed to generate speech. Please try again.");
    } finally {
      setIsGenerating(false);
    }
  };

  const handleDownload = (item: GeneratedAudio) => {
    if (!item.audioBuffer) return;
    
    // Quick WAV export logic
    const buffer = item.audioBuffer;
    const numOfChan = buffer.numberOfChannels;
    const length = buffer.length * numOfChan * 2 + 44;
    const bufferOut = new ArrayBuffer(length);
    const view = new DataView(bufferOut);
    const channels = [];
    let i;
    let sample;
    let offset = 0;
    let pos = 0;

    // write WAVE header
    setUint32(0x46464952);                         // "RIFF"
    setUint32(length - 8);                         // file length - 8
    setUint32(0x45564157);                         // "WAVE"

    setUint32(0x20746d66);                         // "fmt " chunk
    setUint32(16);                                 // length = 16
    setUint16(1);                                  // PCM (uncompressed)
    setUint16(numOfChan);
    setUint32(buffer.sampleRate);
    setUint32(buffer.sampleRate * 2 * numOfChan);  // avg. bytes/sec
    setUint16(numOfChan * 2);                      // block-align
    setUint16(16);                                 // 16-bit (hardcoded in this example)

    setUint32(0x61746164);                         // "data" - chunk
    setUint32(length - pos - 4);                   // chunk length

    // write interleaved data
    for(i = 0; i < buffer.numberOfChannels; i++)
      channels.push(buffer.getChannelData(i));

    while(pos < buffer.length) {
      for(i = 0; i < numOfChan; i++) {             // interleave channels
        sample = Math.max(-1, Math.min(1, channels[i][pos])); // clamp
        sample = (0.5 + sample < 0 ? sample * 32768 : sample * 32767)|0; // scale to 16-bit signed int
        view.setInt16(44 + offset, sample, true);          // write 16-bit sample
        offset += 2;
      }
      pos++;
    }

    // Helper functions for WAV header
    function setUint16(data: number) {
      view.setUint16(pos, data, true);
      pos += 2;
    }
    function setUint32(data: number) {
      view.setUint32(pos, data, true);
      pos += 4;
    }

    const blob = new Blob([bufferOut], { type: 'audio/wav' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `gemini-voice-${item.voice}-${item.id}.wav`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 selection:bg-blue-500/30">
      
      {/* Header */}
      <header className="border-b border-slate-800 bg-slate-900/50 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center shadow-lg">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5 text-white">
                <path d="M13.5 4.06c0-1.336-1.616-2.005-2.56-1.06l-4.5 4.5H4.508c-1.141 0-2.318.664-2.66 1.905A9.76 9.76 0 001.5 12c0 2.485.877 4.796 2.348 6.617.34 1.22 1.517 1.883 2.66 1.883h1.932l4.5 4.5c.945.945 2.56.276 2.56-1.06V4.06zM18.5 12a5.25 5.25 0 01-1.3 3.434A.75.75 0 0116.128 14.3c.063-.1.125-.201.185-.304q.133-.23.254-.471a3.75 3.75 0 00-4.067-5.523.75.75 0 01-1.423-.477 5.25 5.25 0 017.423 4.471zM16.5 12a1.75 1.75 0 01-1.75 1.75.75.75 0 000 1.5 3.25 3.25 0 003.25-3.25.75.75 0 00-1.5 0z" />
              </svg>
            </div>
            <h1 className="text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-blue-400 to-purple-400">
              Gemini Voice Studio
            </h1>
          </div>
          <div className="text-xs text-slate-500 font-mono">
            Powered by Gemini 2.5 Flash
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-8 space-y-8">
        
        {/* Main Controls Section */}
        <section className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          
          {/* Left Column: Inputs */}
          <div className="lg:col-span-7 space-y-6">
            
            <div className="space-y-3">
              <label className="block text-sm font-medium text-slate-300">
                1. Select Character Voice
              </label>
              <VoiceSelector 
                selectedVoice={selectedVoice} 
                onSelect={setSelectedVoice} 
                disabled={isGenerating}
              />
            </div>

            <div className="space-y-3">
              <label className="block text-sm font-medium text-slate-300">
                2. Enter Text to Speak
              </label>
              <div className="relative">
                <textarea
                  value={inputText}
                  onChange={(e) => setInputText(e.target.value)}
                  placeholder="Type something here for the AI to speak... (e.g., 'Hello world, this is a test of the emergency broadcast system.')"
                  disabled={isGenerating}
                  className="w-full h-40 bg-slate-900 border border-slate-700 rounded-xl p-4 text-base focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none resize-none transition-all placeholder:text-slate-600 shadow-inner"
                />
                <div className="absolute bottom-3 right-3 text-xs text-slate-500">
                  {inputText.length} chars
                </div>
              </div>
            </div>

            <button
              onClick={handleGenerate}
              disabled={isGenerating || !inputText.trim()}
              className={`
                w-full py-4 rounded-xl font-bold text-lg shadow-lg flex items-center justify-center gap-2 transition-all duration-200
                ${isGenerating || !inputText.trim()
                  ? 'bg-slate-800 text-slate-500 cursor-not-allowed'
                  : 'bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-500 hover:to-purple-500 text-white shadow-blue-500/20 active:scale-[0.98]'
                }
              `}
            >
              {isGenerating ? (
                <>
                  <svg className="animate-spin h-5 w-5 text-current" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  <span>Generating Audio...</span>
                </>
              ) : (
                <>
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
                    <path fillRule="evenodd" d="M4.5 5.653c0-1.426 1.529-2.33 2.779-1.643l11.54 6.348c1.295.712 1.295 2.573 0 3.285L7.28 19.991c-1.25.687-2.779-.217-2.779-1.643V5.653z" clipRule="evenodd" />
                  </svg>
                  <span>Generate Speech</span>
                </>
              )}
            </button>

            {error && (
              <div className="p-4 rounded-lg bg-red-900/30 border border-red-800/50 text-red-200 text-sm flex items-start gap-2">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5 shrink-0 mt-0.5">
                  <path fillRule="evenodd" d="M9.401 3.003c1.155-2 4.043-2 5.197 0l7.355 12.748c1.154 2-.29 4.5-2.599 4.5H4.645c-2.309 0-3.752-2.5-2.598-4.5L9.4 3.003zM12 8.25a.75.75 0 01.75.75v3.75a.75.75 0 01-1.5 0V9a.75.75 0 01.75-.75zm0 8.25a.75.75 0 100-1.5.75.75 0 000 1.5z" clipRule="evenodd" />
                </svg>
                {error}
              </div>
            )}
          </div>

          {/* Right Column: Visualizer & Current Status */}
          <div className="lg:col-span-5 space-y-6">
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 shadow-xl sticky top-24">
              <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5 text-purple-400">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 6a7.5 7.5 0 107.5 7.5h-7.5V6z" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 10.5H21A7.5 7.5 0 0013.5 3v7.5z" />
                </svg>
                Live Visualizer
              </h2>
              
              <AudioVisualizer 
                analyser={analyserRef.current} 
                isPlaying={isPlaying} 
              />
              
              <div className="mt-4 flex items-center justify-between text-sm text-slate-400">
                <span>Status</span>
                <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${isPlaying ? 'bg-green-900/50 text-green-400' : 'bg-slate-800 text-slate-400'}`}>
                  {isPlaying ? 'Playing' : 'Ready'}
                </span>
              </div>
              
              {history.length > 0 && currentAudioId && (
                <div className="mt-4 pt-4 border-t border-slate-800">
                  <p className="text-xs text-slate-500 uppercase tracking-wider font-semibold mb-1">Now Playing</p>
                  <p className="text-sm text-slate-300 line-clamp-2 italic">
                    "{history.find(h => h.id === currentAudioId)?.text}"
                  </p>
                </div>
              )}
            </div>
          </div>
        </section>

        {/* History Section */}
        {history.length > 0 && (
          <section>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold text-white">Generation History</h2>
              <span className="text-sm text-slate-500">{history.length} items</span>
            </div>
            
            <div className="space-y-3">
              {history.map((item) => (
                <div 
                  key={item.id} 
                  className={`
                    group bg-slate-900 border rounded-xl p-4 transition-all
                    ${currentAudioId === item.id 
                      ? 'border-blue-500/50 bg-blue-900/10' 
                      : 'border-slate-800 hover:border-slate-700'
                    }
                  `}
                >
                  <div className="flex flex-col sm:flex-row sm:items-center gap-4 justify-between">
                    <div className="flex items-start gap-4 flex-1">
                      <button
                        onClick={() => playAudio(item)}
                        className={`
                          w-12 h-12 rounded-full flex items-center justify-center shrink-0 transition-all
                          ${currentAudioId === item.id 
                            ? 'bg-blue-500 text-white shadow-lg shadow-blue-500/30' 
                            : 'bg-slate-800 text-slate-400 group-hover:bg-slate-700 group-hover:text-white'
                          }
                        `}
                      >
                        {currentAudioId === item.id && isPlaying ? (
                           <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5">
                            <path fillRule="evenodd" d="M6.75 5.25a.75.75 0 01.75-.75H9a.75.75 0 01.75.75v13.5a.75.75 0 01-.75.75H7.5a.75.75 0 01-.75-.75V5.25zm7.5 0A.75.75 0 0115 4.5h1.5a.75.75 0 01.75.75v13.5a.75.75 0 01-.75.75H15a.75.75 0 01-.75-.75V5.25z" clipRule="evenodd" />
                          </svg>
                        ) : (
                          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5 ml-0.5">
                            <path fillRule="evenodd" d="M4.5 5.653c0-1.426 1.529-2.33 2.779-1.643l11.54 6.348c1.295.712 1.295 2.573 0 3.285L7.28 19.991c-1.25.687-2.779-.217-2.779-1.643V5.653z" clipRule="evenodd" />
                          </svg>
                        )}
                      </button>
                      
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="px-2 py-0.5 rounded text-xs font-bold bg-slate-800 text-slate-300 border border-slate-700">
                            {item.voice}
                          </span>
                          <span className="text-xs text-slate-500">
                            {new Date(item.timestamp).toLocaleTimeString()}
                          </span>
                        </div>
                        <p className="text-slate-300 text-sm line-clamp-2">
                          {item.text}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 sm:self-center pl-16 sm:pl-0">
                       <button 
                        onClick={() => handleDownload(item)}
                        className="p-2 text-slate-400 hover:text-blue-400 hover:bg-slate-800 rounded-lg transition-colors"
                        title="Download WAV"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
                        </svg>
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}
      </main>
    </div>
  );
};

export default App;
