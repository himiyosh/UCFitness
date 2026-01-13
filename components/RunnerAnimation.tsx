'use client';

export default function RunnerAnimation({ userImage }: { userImage?: string | null }) {
    return (
        <div className="relative w-24 h-24 flex items-center justify-center overflow-hidden rounded-full">
            {/* Speed Lines Background */}
            <div className="absolute inset-0 opacity-40">
                {/* Randomly positioned lines moving fast */}
                {[...Array(6)].map((_, i) => (
                    <div
                        key={i}
                        className="absolute h-0.5 bg-white rounded-full animate-speed-line"
                        style={{
                            top: `${10 + Math.random() * 80}%`,
                            left: '-100%',
                            width: `${20 + Math.random() * 40}%`,
                            animationDuration: `${0.5 + Math.random() * 0.5}s`,
                            animationDelay: `${Math.random() * 0.5}s`,
                        }}
                    ></div>
                ))}
            </div>

            {/* Runner (User Image or Chevrons) */}
            <div className="relative z-10">
                {userImage ? (
                    <div className="w-16 h-16 rounded-full border-2 border-white shadow-lg overflow-hidden animate-running">
                        <img src={userImage} alt="Runner" className="w-full h-full object-cover" />
                    </div>
                ) : (
                    <div className="flex items-center gap-1 transform skew-x-[-12deg]">
                        {/* Chevron 1 */}
                        <div className="w-3 h-8 bg-white/60 rounded-sm animate-pulse-fast"></div>
                        {/* Chevron 2 */}
                        <div className="w-3 h-8 bg-white/80 rounded-sm animate-pulse-fast" style={{ animationDelay: '0.1s' }}></div>
                        {/* Chevron 3 (Main) */}
                        <div className="w-3 h-8 bg-white rounded-sm animate-pulse-fast" style={{ animationDelay: '0.2s' }}></div>
                    </div>
                )}
            </div>

            <style jsx>{`
                @keyframes speed-line {
                    0% { left: -50%; opacity: 0; }
                    50% { opacity: 1; }
                    100% { left: 150%; opacity: 0; }
                }
                .animate-speed-line {
                    animation-name: speed-line;
                    animation-timing-function: linear;
                    animation-iteration-count: infinite;
                }

                @keyframes pulse-fast {
                    0%, 100% { transform: scaleY(1); opacity: 0.8; }
                    50% { transform: scaleY(1.1); opacity: 1; filter: brightness(1.2); }
                }
                .animate-pulse-fast {
                    animation: pulse-fast 0.8s cubic-bezier(0.4, 0, 0.6, 1) infinite;
                }

                @keyframes running-bob {
                    0%, 100% { transform: translateY(0) rotate(5deg); }
                    50% { transform: translateY(-4px) rotate(8deg); }
                }
                .animate-running {
                    animation: running-bob 0.4s ease-in-out infinite alternate;
                }
            `}</style>
        </div>
    );
}
