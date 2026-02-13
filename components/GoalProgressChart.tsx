'use client';

import { useState, useEffect, useMemo } from 'react';
import Confetti from './Confetti';

interface GoalProgressChartProps {
    current: number;
    goal: number;
    size?: number;
    strokeWidth?: number;
}

export default function GoalProgressChart({ current, goal, size = 80, strokeWidth = 8 }: GoalProgressChartProps) {
    const { percentage, radius, circumference, offset } = useMemo(() => {
        const safeGoal = goal > 0 ? goal : 1;
        const pct = Math.min(100, Math.max(0, (current / safeGoal) * 100));
        const r = (size - strokeWidth) / 2;
        const c = r * 2 * Math.PI;
        const o = c - (pct / 100) * c;
        return { percentage: pct, radius: r, circumference: c, offset: o };
    }, [current, goal, size, strokeWidth]);

    const isAchieved = current >= goal;

    // 🎉 Confetti trigger - only fire once when goal is first achieved
    const [hasTriggeredConfetti, setHasTriggeredConfetti] = useState(false);
    const [showConfetti, setShowConfetti] = useState(false);

    useEffect(() => {
        if (isAchieved && !hasTriggeredConfetti) {
            setShowConfetti(true);
            setHasTriggeredConfetti(true);
        }
    }, [isAchieved, hasTriggeredConfetti]);

    // Celebration colors
    const ringColor = isAchieved
        ? 'text-[var(--accent-lime)]'
        : 'text-[var(--theme-ring-color,var(--theme-primary))]';

    const percentColor = isAchieved
        ? 'text-[var(--accent-lime)]'
        : 'text-[var(--theme-ring-color,var(--theme-primary))]';

    return (
        <>
            <Confetti
                trigger={showConfetti}
                duration={4000}
                pieceCount={80}
                onComplete={() => setShowConfetti(false)}
            />
            <div
                className={`relative flex items-center justify-center ${isAchieved ? 'animate-celebrate' : ''}`}
                style={{ width: size, height: size }}
            >
                <svg
                    width={size}
                    height={size}
                    viewBox={`0 0 ${size} ${size}`}
                    className="transform -rotate-90"
                >
                    {/* Background Circle */}
                    <circle
                        cx={size / 2}
                        cy={size / 2}
                        r={radius}
                        fill="transparent"
                        stroke="currentColor"
                        strokeWidth={strokeWidth}
                        className="text-gray-100"
                    />

                    {/* Progress Circle - with gradient for achievement */}
                    <circle
                        cx={size / 2}
                        cy={size / 2}
                        r={radius}
                        fill="transparent"
                        stroke="currentColor"
                        strokeWidth={strokeWidth}
                        strokeDasharray={circumference}
                        strokeDashoffset={offset}
                        strokeLinecap="round"
                        className={`transition-all duration-1000 ease-out ${ringColor}`}
                    />
                </svg>
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                    {isAchieved ? (
                        <span className="text-lg">🎉</span>
                    ) : (
                        <span className={`text-sm font-bold ${percentColor}`}>
                            {Math.round(percentage)}%
                        </span>
                    )}
                </div>
            </div>
        </>
    );
}
