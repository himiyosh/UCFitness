'use client';

import { useEffect, useState, useCallback, memo } from 'react';

interface ConfettiPiece {
  id: number;
  x: number;
  color: string;
  delay: number;
  size: number;
  duration: number;
}

interface ConfettiProps {
  trigger: boolean;
  duration?: number;
  pieceCount?: number;
  onComplete?: () => void;
}

const COLORS = [
  '#FF6B6B', // coral
  '#4ECDC4', // turquoise
  '#95E500', // lime
  '#FF85A2', // pink
  '#FFE66D', // yellow
  '#A855F7', // purple
  '#60A5FA', // blue
];

const Confetti = memo(function Confetti({ 
  trigger, 
  duration = 3000, 
  pieceCount = 50,
  onComplete 
}: ConfettiProps) {
  const [pieces, setPieces] = useState<ConfettiPiece[]>([]);
  const [isActive, setIsActive] = useState(false);

  const generatePieces = useCallback(() => {
    return Array.from({ length: pieceCount }, (_, i) => ({
      id: i,
      x: Math.random() * 100, // percentage across screen
      color: COLORS[Math.floor(Math.random() * COLORS.length)],
      delay: Math.random() * 0.5, // stagger start
      size: Math.random() * 10 + 6, // 6-16px
      duration: Math.random() * 2 + 2, // 2-4s fall time
    }));
  }, [pieceCount]);

  useEffect(() => {
    if (trigger && !isActive) {
      setIsActive(true);
      setPieces(generatePieces());

      const timer = setTimeout(() => {
        setIsActive(false);
        setPieces([]);
        onComplete?.();
      }, duration);

      return () => clearTimeout(timer);
    }
  }, [trigger, isActive, duration, generatePieces, onComplete]);

  if (!isActive || pieces.length === 0) return null;

  return (
    <div 
      className="fixed inset-0 pointer-events-none z-[9999] overflow-hidden"
      aria-hidden="true"
    >
      {pieces.map((piece) => (
        <div
          key={piece.id}
          className="absolute"
          style={{
            left: `${piece.x}%`,
            top: '-20px',
            width: `${piece.size}px`,
            height: `${piece.size}px`,
            backgroundColor: piece.color,
            borderRadius: Math.random() > 0.5 ? '50%' : '2px',
            animation: `confettiFall ${piece.duration}s linear ${piece.delay}s forwards`,
            transform: `rotate(${Math.random() * 360}deg)`,
          }}
        />
      ))}
    </div>
  );
});

export default Confetti;
