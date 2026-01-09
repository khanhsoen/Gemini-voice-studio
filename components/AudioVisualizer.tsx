import React, { useRef, useEffect } from 'react';

interface AudioVisualizerProps {
  analyser: AnalyserNode | null;
  isPlaying: boolean;
}

const AudioVisualizer: React.FC<AudioVisualizerProps> = ({ analyser, isPlaying }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationRef = useRef<number>();

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !analyser) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);

    const draw = () => {
      const width = canvas.width;
      const height = canvas.height;

      analyser.getByteFrequencyData(dataArray);

      ctx.clearRect(0, 0, width, height);

      // Draw background
      // ctx.fillStyle = 'rgba(15, 23, 42, 0.5)'; // Transparent clear
      // ctx.fillRect(0, 0, width, height);

      const barWidth = (width / bufferLength) * 2.5;
      let barHeight;
      let x = 0;

      for (let i = 0; i < bufferLength; i++) {
        barHeight = (dataArray[i] / 255) * height;

        // Gradient for bars
        const gradient = ctx.createLinearGradient(0, height, 0, height - barHeight);
        gradient.addColorStop(0, '#3b82f6'); // Blue 500
        gradient.addColorStop(1, '#a855f7'); // Purple 500

        ctx.fillStyle = gradient;
        
        // Rounded caps aesthetic
        ctx.beginPath();
        ctx.roundRect(x, height - barHeight, barWidth, barHeight, 2);
        ctx.fill();

        x += barWidth + 1;
      }

      if (isPlaying) {
        animationRef.current = requestAnimationFrame(draw);
      } else {
        // Draw a flat line or reset state when stopped
        // But we might want to keep the last frame or slowly decay
        // For simplicity, we stop updating, but let's clear to a flat line if stopped abruptly
        if (analyser.context.state === 'closed' || analyser.context.state === 'suspended') {
             ctx.clearRect(0, 0, width, height);
             ctx.fillStyle = '#334155';
             ctx.fillRect(0, height - 2, width, 2);
        } else {
            // Keep animating a bit for decay if we wanted, but simple stop is fine
            animationRef.current = requestAnimationFrame(draw);
        }
      }
    };

    draw();

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [analyser, isPlaying]);

  return (
    <canvas 
      ref={canvasRef} 
      width={600} 
      height={100} 
      className="w-full h-24 rounded-lg bg-slate-900/50 border border-slate-700/50"
    />
  );
};

export default AudioVisualizer;
