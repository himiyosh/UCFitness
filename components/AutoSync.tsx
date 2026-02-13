'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function AutoSync() {
    const router = useRouter();

    useEffect(() => {
        const syncSteps = async () => {
            try {
                const res = await fetch('/api/steps/sync', {
                    method: 'POST',
                });

                if (res.ok) {
                    // サーバーコンポーネントをリフレッシュして新しいデータを表示
                    router.refresh();
                }
            } catch (_error: unknown) {
                // 自動同期の失敗はサイレントに処理（ユーザー操作は不要）
            }
        };

        syncSteps();
    }, [router]);

    return null;
}
