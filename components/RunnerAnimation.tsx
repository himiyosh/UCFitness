'use client';

import { useMemo } from 'react';

// パーティクルのランダム値を事前生成（SSR/CSR間の不一致を防止）
function generateParticles(count: number) {
    const particles = [];
    for (let i = 0; i < count; i++) {
        const size = 3 + (((i * 7 + 3) % 11) / 11) * 7;           // 3〜10px
        const yOffset = (((i * 13 + 5) % 17) / 17 - 0.5) * 160;   // -80〜80
        const drift = (((i * 11 + 7) % 13) / 13 - 0.5) * 60;      // -30〜30
        const dur = 1.2 + (((i * 9 + 2) % 15) / 15) * 1.5;        // 1.2〜2.7s
        const delay = (((i * 5 + 1) % 19) / 19) * dur;
        const hue = 220 + (((i * 3 + 4) % 12) / 12) * 60;         // 220〜280 (青〜紫)
        particles.push({ size, yOffset, drift, dur, delay, hue });
    }
    return particles;
}

const PARTICLES = generateParticles(16);

// エナジーオーラ：リング＋スパークルの事前生成
const RINGS = [
    { size: 60, dur: 1.8, delay: 0 },
    { size: 80, dur: 2.3, delay: 0.6 },
    { size: 100, dur: 2.8, delay: 1.2 },
];

function generateSparkles(count: number) {
    const sparkles = [];
    for (let i = 0; i < count; i++) {
        const angle = (Math.PI * 2 * i) / count;
        const dist = 35 + (((i * 7 + 3) % 11) / 11) * 25;
        const sx = Math.cos(angle) * 18;
        const sy = Math.sin(angle) * 18;
        const ex = Math.cos(angle) * dist;
        const ey = Math.sin(angle) * dist;
        const dur = 1.5 + (((i * 9 + 2) % 7) / 7) * 1;
        const delay = (((i * 5 + 1) % 11) / 11) * 2;
        const hue = 220 + (((i * 3 + 4) % 10) / 10) * 80;
        sparkles.push({ sx, sy, ex, ey, dur, delay, hue });
    }
    return sparkles;
}

const SPARKLES = generateSparkles(10);

export default function RunnerAnimation({ userImage }: { userImage?: string | null }) {
    return (
        <div className="relative w-48 h-48 flex items-center justify-center">
            {/* パーティクルトレイル（光粒子エフェクト） */}
            <div className="absolute inset-0">
                {PARTICLES.map((p, i) => (
                    <div
                        key={i}
                        className="absolute rounded-full runner-particle"
                        style={{
                            width: `${p.size}px`,
                            height: `${p.size}px`,
                            left: `20%`,
                            top: `${50 + p.yOffset}%`,
                            background: `hsl(${p.hue}, 80%, 75%)`,
                            boxShadow: `0 0 ${p.size * 2}px hsl(${p.hue}, 90%, 60%)`,
                            ['--drift' as string]: `${p.drift}px`,
                            animationDuration: `${p.dur}s`,
                            animationDelay: `${p.delay}s`,
                        }}
                    />
                ))}
            </div>

            {/* エナジーオーラ（パルスリング） */}
            {RINGS.map((r, i) => (
                <div
                    key={`ring-${i}`}
                    className="absolute rounded-full aura-ring"
                    style={{
                        width: `${r.size}px`,
                        height: `${r.size}px`,
                        left: '50%',
                        top: '50%',
                        border: '2px solid rgba(165, 180, 252, 0.4)',
                        animationDuration: `${r.dur}s`,
                        animationDelay: `${r.delay}s`,
                    }}
                />
            ))}

            {/* スパークル（放射状の光点） */}
            {SPARKLES.map((s, i) => (
                <div
                    key={`sparkle-${i}`}
                    className="absolute rounded-full aura-sparkle"
                    style={{
                        width: '3px',
                        height: '3px',
                        left: '50%',
                        top: '50%',
                        background: `hsl(${s.hue}, 80%, 80%)`,
                        boxShadow: `0 0 6px hsl(${s.hue}, 90%, 70%)`,
                        ['--sx' as string]: `${s.sx}px`,
                        ['--sy' as string]: `${s.sy}px`,
                        ['--ex' as string]: `${s.ex}px`,
                        ['--ey' as string]: `${s.ey}px`,
                        animationDuration: `${s.dur}s`,
                        animationDelay: `${s.delay}s`,
                    }}
                />
            ))}

            {/* ランナー（ユーザー画像 or シェブロン） */}
            <div className="relative z-10">
                {userImage ? (
                    <div className="w-24 h-24 rounded-full border-2 border-white shadow-lg overflow-hidden runner-bob">
                        <img src={userImage} alt="Runner" className="w-full h-full object-cover" />
                    </div>
                ) : (
                    <div className="flex items-center gap-1 transform skew-x-[-12deg]">
                        <div className="w-3 h-8 rounded-sm runner-chevron" style={{ backgroundColor: 'rgba(255,255,255,0.6)' }}></div>
                        <div className="w-3 h-8 rounded-sm runner-chevron" style={{ backgroundColor: 'rgba(255,255,255,0.8)', animationDelay: '0.1s' }}></div>
                        <div className="w-3 h-8 rounded-sm runner-chevron" style={{ backgroundColor: '#ffffff', animationDelay: '0.2s' }}></div>
                    </div>
                )}
            </div>

            <style jsx>{`
                @keyframes particleFlow {
                    0%   { transform: translateX(0) translateY(0) scale(1); opacity: 0; }
                    10%  { opacity: 0.9; }
                    80%  { opacity: 0.5; }
                    100% { transform: translateX(140px) translateY(var(--drift, 0px)) scale(0.3); opacity: 0; }
                }
                .runner-particle {
                    animation: particleFlow linear infinite;
                }

                @keyframes chevronPulse {
                    0%, 100% { transform: scaleY(1); opacity: 0.8; }
                    50% { transform: scaleY(1.1); opacity: 1; filter: brightness(1.2); }
                }
                .runner-chevron {
                    animation: chevronPulse 0.8s cubic-bezier(0.4, 0, 0.6, 1) infinite;
                }

                @keyframes runningBob {
                    0%, 100% { transform: translateY(0) rotate(-5deg); }
                    50% { transform: translateY(-4px) rotate(-8deg); }
                }
                .runner-bob {
                    animation: runningBob 0.4s ease-in-out infinite alternate;
                }

                @keyframes pulseRing {
                    0%   { transform: translate(-50%, -50%) scale(0.8); opacity: 0.7; }
                    100% { transform: translate(-50%, -50%) scale(2.2); opacity: 0; }
                }
                .aura-ring {
                    animation: pulseRing ease-out infinite;
                }

                @keyframes sparkleFloat {
                    0%, 100% { transform: translate(0, 0) scale(0); opacity: 0; }
                    20%  { transform: translate(var(--sx, 0), var(--sy, 0)) scale(1); opacity: 1; }
                    80%  { opacity: 0.6; }
                    100% { transform: translate(var(--ex, 0), var(--ey, 0)) scale(0); opacity: 0; }
                }
                .aura-sparkle {
                    animation: sparkleFloat ease-in-out infinite;
                }
            `}</style>
        </div>
    );
}
