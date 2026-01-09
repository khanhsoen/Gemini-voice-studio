import { GoogleGenAI, Modality } from "@google/genai";
import { VoiceName } from "../types";
import { decodeBase64, decodeAudioData } from "../utils/audioUtils";

const API_KEY = process.env.API_KEY || '';

if (!API_KEY) {
  console.warn("Missing API_KEY in process.env");
}

const ai = new GoogleGenAI({ apiKey: API_KEY });

export const generateSpeech = async (
  text: string, 
  voiceName: VoiceName,
  audioContext: AudioContext
): Promise<AudioBuffer> => {
  if (!text.trim()) {
    throw new Error("Text cannot be empty");
  }

  try {
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash-preview-tts",
      contents: [{ parts: [{ text: text }] }],
      config: {
        responseModalities: [Modality.AUDIO],
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: { voiceName: voiceName },
          },
        },
      },
    });

    const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
    
    if (!base64Audio) {
      throw new Error("No audio data received from Gemini API");
    }

    const rawBytes = decodeBase64(base64Audio);
    // Gemini 2.5 Flash TTS typically returns 24kHz audio
    const audioBuffer = await decodeAudioData(rawBytes, audioContext, 24000, 1);
    
    return audioBuffer;
  } catch (error) {
    console.error("Gemini TTS Error:", error);
    throw error;
  }
};
