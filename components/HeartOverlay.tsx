
import React, { useState, useImperativeHandle, forwardRef, useEffect, useCallback } from 'react';
import { Heart } from 'lucide-react';
import { LikeEvent } from '../types';

export interface HeartOverlayRef {
  addLike: (event: LikeEvent) => void;
}

interface HeartItem {
  id: number;
  x: number; // Random horizontal start offset
  color: string;
  avatarUrl?: string;
  rotation: number;
}

const COLORS = ['#ef4444', '#ec4899', '#f472b6', '#a855f7', '#8b5cf6'];

const HeartOverlay = forwardRef<HeartOverlayRef, {}>((props, ref) => {
  const [hearts, setHearts] = useState<HeartItem[]>([]);
  
  // Use a counter ref to generate unique IDs without state dependancy issues
  const counterRef = React.useRef(0);

  const addLike = useCallback((event: LikeEvent) => {
    counterRef.current += 1;
    const id = counterRef.current;
    
    // Randomize starting position (wiggle room)
    const randomX = Math.random() * 60 - 30; // -30px to 30px
    const randomColor = COLORS[Math.floor(Math.random() * COLORS.length)];
    const randomRotation = Math.random() * 30 - 15;

    const newHeart: HeartItem = {
      id,
      x: randomX,
      color: randomColor,
      avatarUrl: event.profilePictureUrl,
      rotation: randomRotation
    };

    setHearts((prev) => [...prev, newHeart]);

    // Auto remove after animation finishes (2s)
    setTimeout(() => {
      setHearts((prev) => prev.filter((h) => h.id !== id));
    }, 2000);
  }, []);

  useImperativeHandle(ref, () => ({
    addLike
  }));

  return (
    <div className="absolute inset-0 pointer-events-none z-40 overflow-hidden">
      {/* Position container: Bottom Right, slightly above controls */}
      <div className="absolute bottom-32 right-6 w-20 h-full flex flex-col justify-end items-center">
        {hearts.map((heart) => (
          <div
            key={heart.id}
            className="absolute bottom-0 flex flex-col items-center"
            style={{
              left: `calc(50% + ${heart.x}px)`,
              animation: `floatUp 2s ease-out forwards`,
              transform: `rotate(${heart.rotation}deg)`
            }}
          >
            {/* Avatar Bubble */}
            {heart.avatarUrl ? (
                <div className="relative mb-1">
                     <img 
                        src={heart.avatarUrl} 
                        alt="user" 
                        className="w-8 h-8 rounded-full border-2 border-white shadow-lg object-cover"
                     />
                     <div className="absolute -bottom-1 -right-1 bg-white rounded-full p-0.5">
                         <Heart size={10} fill={heart.color} stroke="none" />
                     </div>
                </div>
            ) : (
                <Heart 
                    size={28} 
                    fill={heart.color} 
                    color={heart.color} 
                    className="drop-shadow-md"
                />
            )}
          </div>
        ))}
      </div>
      
      {/* Inline styles for the specific keyframe animation */}
      <style>{`
        @keyframes floatUp {
          0% {
            transform: translateY(0) scale(0.5);
            opacity: 0;
          }
          10% {
            transform: translateY(-20px) scale(1.1);
            opacity: 1;
          }
          50% {
            transform: translateY(-120px) scale(1) translateX(10px);
          }
          100% {
            transform: translateY(-300px) scale(0.8) translateX(-10px);
            opacity: 0;
          }
        }
      `}</style>
    </div>
  );
});

export default HeartOverlay;
