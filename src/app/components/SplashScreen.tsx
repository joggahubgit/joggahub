import { useEffect, useState } from 'react';

const HOLD_MS = 1100;
const EXIT_MS = 900;

/**
 * One-time branded intro shown while the app boots (every cold page load,
 * not just first-ever visit — same spirit as a native app splash). Mirrors
 * Landing.tsx's violet gradient + frosted logo badge so the very first
 * thing a visitor sees is already on-brand, instead of a blank white flash.
 */
export default function SplashScreen({ onFinish }: { onFinish: () => void }) {
  const [phase, setPhase] = useState<'enter' | 'hold' | 'exit'>('enter');

  useEffect(() => {
    const toHold = requestAnimationFrame(() => setPhase('hold'));
    const toExit = setTimeout(() => setPhase('exit'), HOLD_MS);
    const finish = setTimeout(onFinish, HOLD_MS + EXIT_MS);
    return () => {
      cancelAnimationFrame(toHold);
      clearTimeout(toExit);
      clearTimeout(finish);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div
      className={`fixed inset-0 z-[9999] flex items-center justify-center bg-gradient-to-b from-violet-600 to-violet-800 transition-opacity duration-[900ms] ${
        phase === 'exit' ? 'opacity-0 pointer-events-none' : 'opacity-100'
      }`}
    >
      <div
        className={`flex flex-col items-center transition-all duration-[900ms] ease-out ${
          phase === 'enter' ? 'opacity-0 scale-90' : phase === 'exit' ? 'opacity-0 scale-105' : 'opacity-100 scale-100'
        }`}
      >
        <div className="bg-white/10 backdrop-blur-sm rounded-full p-5 mb-3">
          <img src="/logo.png" alt="JoggaHub" className="w-14 h-14 object-contain" style={{ filter: 'brightness(0) invert(1)' }} />
        </div>
        <p className="text-white font-bold text-lg tracking-wide">JoggaHub</p>
      </div>
    </div>
  );
}
