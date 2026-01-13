'use client';

interface GoalProgressChartProps {
    current: number;
    goal: number;
    size?: number;
    strokeWidth?: number;
}

export default function GoalProgressChart({ current, goal, size = 80, strokeWidth = 8 }: GoalProgressChartProps) {
    const percentage = Math.min(100, Math.max(0, (current / goal) * 100));
    const radius = (size - strokeWidth) / 2;
    const circumference = radius * 2 * Math.PI;
    const offset = circumference - (percentage / 100) * circumference;

    const isAchieved = current >= goal;
    const colorClass = isAchieved ? 'text-green-500' : 'text-indigo-600';

    return (
        <div className="relative flex items-center justify-center" style={{ width: size, height: size }}>
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

                {/* Progress Circle */}
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
                    className={`transition-all duration-1000 ease-out ${colorClass}`}
                />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className={`text-[10px] font-bold ${isAchieved ? 'text-green-600' : 'text-gray-600'}`}>
                    {Math.round(percentage)}%
                </span>
            </div>
        </div>
    );
}
