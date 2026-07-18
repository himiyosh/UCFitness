'use client';

import dynamic from 'next/dynamic';
import { useTranslations } from 'next-intl';

import { useNearViewport } from '@/hooks/useNearViewport';

import type { GroupChatProps } from '@/components/group/GroupChat';
import type { GroupGearProps } from '@/components/group/GroupGear';

function GroupChatFallback(): React.ReactNode {
    const t = useTranslations('GroupChat');

    return (
        <div
            aria-busy="true"
            aria-label={t('title')}
            className="midnight-solid-panel flex w-full flex-col overflow-hidden rounded-2xl border border-gray-100 bg-white"
        >
            <div className="flex min-h-[44px] items-center px-4 py-3">
                <h3 className="flex items-center gap-1.5 text-sm font-bold text-gray-900">
                    <span aria-hidden="true">💬</span> {t('title')}
                </h3>
            </div>
            <div className="mx-4 h-36 animate-pulse rounded-xl bg-[var(--color-surface-muted)] motion-reduce:animate-none" />
            <div className="mx-4 mb-4 mt-3 h-11 animate-pulse rounded-xl bg-[var(--color-surface-muted)] motion-reduce:animate-none" />
        </div>
    );
}

const GroupChat = dynamic(
    () => import('@/components/group/GroupChat'),
    {
        ssr: false,
        loading: GroupChatFallback,
    },
);

export default function DeferredGroupChat(
    props: GroupChatProps,
): React.ReactNode {
    const { targetRef, isNearViewport } = useNearViewport();

    return (
        <div ref={targetRef} className="flex w-full">
            {isNearViewport ? <GroupChat {...props} /> : <GroupChatFallback />}
        </div>
    );
}

function GroupGearFallback(): React.ReactNode {
    const t = useTranslations('GroupGear');

    return (
        <div
            aria-busy="true"
            aria-label={t('title')}
            className="rounded-2xl border border-gray-100 bg-white p-3 shadow-sm sm:p-5"
        >
            <h3 className="text-sm font-bold text-[var(--color-text)]">{t('title')}</h3>
            <p className="mt-0.5 text-xs text-[var(--color-text-muted)]">{t('subtitle')}</p>
            <div className="mt-3 h-28 animate-pulse rounded-xl bg-[var(--color-surface-muted)] motion-reduce:animate-none" />
        </div>
    );
}

const GroupGear = dynamic(
    () => import('@/components/group/GroupGear'),
    {
        ssr: false,
        loading: GroupGearFallback,
    },
);

export function DeferredGroupGear(
    props: GroupGearProps,
): React.ReactNode {
    const { targetRef, isNearViewport } = useNearViewport();

    return (
        <div ref={targetRef}>
            {isNearViewport ? <GroupGear {...props} /> : <GroupGearFallback />}
        </div>
    );
}
