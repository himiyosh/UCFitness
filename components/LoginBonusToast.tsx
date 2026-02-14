'use client';

import { useEffect, useState } from 'react';

interface LoginBonusToastProps {
    userId: string;
}

/**
 * デイリーログインボーナス通知コンポーネント
 * マウント時にAPIを呼び出し、ボーナス獲得時にトーストを表示する
 */
export default function LoginBonusToast({ userId }: LoginBonusToastProps) {
    const [visible, setVisible] = useState(false);
    const [amount, setAmount] = useState(0);
    const [streak, setStreak] = useState(0);
    const [dismissing, setDismissing] = useState(false);

    useEffect(() => {
        if (!userId) return;

        const claimBonus = async () => {
            try {
                const res = await fetch('/api/user/login-bonus', {
                    method: 'POST',
                });

                if (!res.ok) return;

                const data = await res.json();

                if (data.claimed && !data.alreadyClaimed) {
                    setAmount(data.amount);
                    setStreak(data.streak);
                    setVisible(true);

                    // 5秒後に自動で閉じる
                    setTimeout(() => {
                        setDismissing(true);
                        setTimeout(() => setVisible(false), 400);
                    }, 5000);
                }
            } catch {
                // ログインボーナスの失敗はサイレントに処理
            }
        };

        claimBonus();
    }, [userId]);

    if (!visible) return null;

    return (
        <div
            className={`login-bonus-toast fixed top-4 left-1/2 z-50 ${dismissing ? 'login-bonus-exit' : 'login-bonus-enter'}`}
            role="status"
            aria-live="polite"
        >
            <div
                className="bg-white midnight-solid-panel rounded-2xl shadow-2xl border border-gray-200 px-5 py-4 flex items-center gap-3 min-w-[280px] max-w-[400px]"
                style={{
                    borderLeft: '4px solid var(--theme-primary)',
                    boxShadow: '0 8px 32px rgba(0, 0, 0, 0.12), 0 0 0 1px rgba(0, 0, 0, 0.04)',
                }}
            >
                {/* アイコン */}
                <div
                    className="flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center text-lg"
                    style={{ backgroundColor: 'var(--theme-primary)', color: 'white' }}
                >
                    🎁
                </div>

                {/* テキスト */}
                <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-gray-900" style={{ color: 'var(--theme-primary)' }}>
                        デイリーボーナス
                    </p>
                    <p className="text-base font-black text-gray-800">
                        +{amount.toLocaleString()} UC!
                    </p>
                    <p className="text-xs text-gray-500 mt-0.5">
                        🔥 {streak}日連続ログイン
                        {streak >= 30 && ' — x3.0 ボーナス!'}
                        {streak >= 14 && streak < 30 && ' — x2.0 ボーナス!'}
                        {streak >= 7 && streak < 14 && ' — x1.5 ボーナス!'}
                        {streak >= 3 && streak < 7 && ' — x1.2 ボーナス!'}
                    </p>
                </div>

                {/* 閉じるボタン */}
                <button
                    onClick={() => {
                        setDismissing(true);
                        setTimeout(() => setVisible(false), 400);
                    }}
                    className="flex-shrink-0 text-gray-400 hover:text-gray-600 transition-colors p-1"
                    aria-label="閉じる"
                >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                </button>
            </div>

            {/* CSS アニメーション */}
            <style jsx>{`
                .login-bonus-toast {
                    transform: translateX(-50%);
                }
                .login-bonus-enter {
                    animation: loginBonusSlideIn 0.5s cubic-bezier(0.16, 1, 0.3, 1) forwards;
                }
                .login-bonus-exit {
                    animation: loginBonusSlideOut 0.4s cubic-bezier(0.16, 1, 0.3, 1) forwards;
                }
                @keyframes loginBonusSlideIn {
                    from {
                        opacity: 0;
                        transform: translateX(-50%) translateY(-20px) scale(0.95);
                    }
                    to {
                        opacity: 1;
                        transform: translateX(-50%) translateY(0) scale(1);
                    }
                }
                @keyframes loginBonusSlideOut {
                    from {
                        opacity: 1;
                        transform: translateX(-50%) translateY(0) scale(1);
                    }
                    to {
                        opacity: 0;
                        transform: translateX(-50%) translateY(-20px) scale(0.95);
                    }
                }
            `}</style>
        </div>
    );
}
