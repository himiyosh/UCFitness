'use client';

import { useState, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import Spinner from '@/components/ui/Spinner';
import { useToast } from '@/components/ui/Toast';
import {
    DndContext,
    closestCenter,
    KeyboardSensor,
    PointerSensor,
    TouchSensor,
    useSensor,
    useSensors,
} from '@dnd-kit/core';
import type { DragEndEvent } from '@dnd-kit/core';
import {
    arrayMove,
    SortableContext,
    sortableKeyboardCoordinates,
    verticalListSortingStrategy,
    useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

interface GroupMembership {
    role: string;
    joined_at: string;
    rank?: number | null;
    totalMembers?: number;
    groups: {
        id: string;
        name: string;
        keyword: string;
        image_url?: string | null;
        header_image_url?: string | null;
    };
}

// ドラッグ可能なカード（編集モード用）
function SortableGroupCard({ m, t }: { m: GroupMembership; t: ReturnType<typeof useTranslations<'Groups'>> }) {
    const {
        attributes,
        listeners,
        setNodeRef,
        transform,
        transition,
        isDragging,
    } = useSortable({ id: m.groups.id });

    const style = {
        transform: CSS.Transform.toString(transform),
        transition,
    };

    return (
        <div
            ref={setNodeRef}
            style={style}
            className={`relative bg-white midnight-solid-panel rounded-xl border shadow-sm flex items-center gap-3 p-3 ${
                isDragging
                    ? 'border-[var(--theme-primary)] shadow-lg z-50 opacity-90'
                    : 'border-gray-100'
            }`}
        >
            {/* ドラッグハンドル */}
            <button
                className="cursor-grab active:cursor-grabbing p-1.5 rounded-lg text-gray-400 hover:text-[var(--theme-primary)] hover:bg-[var(--theme-primary-light)] transition-colors shrink-0 touch-none"
                aria-label={t('dragToReorder')}
                {...attributes}
                {...listeners}
            >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8h16M4 16h16" />
                </svg>
            </button>

            {/* グループアイコン */}
            <div className="w-10 h-10 rounded-lg overflow-hidden shrink-0 bg-[var(--theme-primary-light)] flex items-center justify-center">
                {m.groups.image_url ? (
                    <img src={m.groups.image_url} alt="" className="w-full h-full object-cover" />
                ) : (
                    <span className="font-bold text-sm text-[var(--theme-primary)]">
                        {m.groups.name.substring(0, 1).toUpperCase()}
                    </span>
                )}
            </div>

            {/* グループ情報 */}
            <div className="min-w-0 flex-1">
                <h3 className="text-sm font-bold text-gray-900 truncate">{m.groups.name}</h3>
                <span className="text-xs text-gray-500">#{m.groups.keyword}</span>
            </div>

            {/* 順位バッジ */}
            {m.rank && (
                <span className={`shrink-0 px-2 py-0.5 rounded text-xs font-bold ${
                    m.rank === 1 ? 'bg-yellow-100 text-yellow-700' :
                    m.rank === 2 ? 'bg-gray-100 text-gray-600' :
                    m.rank === 3 ? 'bg-orange-100 text-orange-700' :
                    'bg-gray-50 text-gray-500'
                }`}>
                    #{m.rank}
                </span>
            )}
        </div>
    );
}

export default function GroupList({ initialMemberships }: { initialMemberships: GroupMembership[] }) {
    const [memberships, setMemberships] = useState(initialMemberships);
    const [isEditing, setIsEditing] = useState(false);
    const [isUpdating, setIsUpdating] = useState(false);
    const [editOrder, setEditOrder] = useState<GroupMembership[]>(initialMemberships);
    const [copiedId, setCopiedId] = useState<string | null>(null);
    const router = useRouter();
    const t = useTranslations('Groups');
    const { error: toastError } = useToast();

    // DnD センサー設定（タッチ + ポインター + キーボード）
    const sensors = useSensors(
        useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
        useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 5 } }),
        useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
    );

    // 編集モード開始
    const startEditing = useCallback(() => {
        setEditOrder([...memberships]);
        setIsEditing(true);
    }, [memberships]);

    // 編集キャンセル
    const cancelEditing = useCallback(() => {
        setIsEditing(false);
        setEditOrder(memberships);
    }, [memberships]);

    // 並び替え保存
    const saveOrder = useCallback(async () => {
        setIsUpdating(true);
        setMemberships(editOrder); // Optimistic
        setIsEditing(false);

        try {
            const keywords = editOrder.map(m => m.groups.keyword);
            const res = await fetch('/api/user/group', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'reorder', groupKeywords: keywords }),
            });
            if (!res.ok) throw new Error('Failed to update order');
            router.refresh();
        } catch {
            toastError(t('reorderFailed'));
            setMemberships(initialMemberships);
        } finally {
            setIsUpdating(false);
        }
    }, [editOrder, router, toastError, t, initialMemberships]);

    // DnD完了
    const handleDragEnd = useCallback((event: DragEndEvent) => {
        const { active, over } = event;
        if (!over || active.id === over.id) return;

        setEditOrder((prev) => {
            const oldIndex = prev.findIndex(m => m.groups.id === active.id);
            const newIndex = prev.findIndex(m => m.groups.id === over.id);
            return arrayMove(prev, oldIndex, newIndex);
        });
    }, []);

    // 招待リンクコピー
    const handleShareInvite = useCallback(async (keyword: string, groupId: string) => {
        const url = `${window.location.origin}/groups/join?keyword=${encodeURIComponent(keyword)}`;
        try {
            await navigator.clipboard.writeText(url);
            setCopiedId(groupId);
            setTimeout(() => setCopiedId(null), 2000);
        } catch {
            const textarea = document.createElement('textarea');
            textarea.value = url;
            document.body.appendChild(textarea);
            textarea.select();
            document.execCommand('copy');
            document.body.removeChild(textarea);
            setCopiedId(groupId);
            setTimeout(() => setCopiedId(null), 2000);
        }
    }, []);

    if (memberships.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
                <span className="text-5xl mb-4">👥</span>
                <h3 className="text-lg font-bold mb-2" style={{ color: 'var(--theme-primary)' }}>
                    {t('noGroups')}
                </h3>
                <p className="text-sm mb-6 max-w-xs" style={{ color: 'var(--foreground-muted)' }}>
                    {t('noGroupsDescription')}
                </p>
            </div>
        );
    }

    // === 編集モード ===
    if (isEditing) {
        return (
            <div className="space-y-3">
                <div className="flex items-center justify-between">
                    <p className="text-sm text-gray-500 font-medium">{t('dragToReorder')}</p>
                    <div className="flex items-center gap-2">
                        <button
                            onClick={cancelEditing}
                            className="px-3 py-1.5 text-sm font-semibold text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
                        >
                            {t('cancel')}
                        </button>
                        <button
                            onClick={saveOrder}
                            disabled={isUpdating}
                            className="px-3 py-1.5 text-sm font-semibold text-white bg-[var(--theme-primary)] hover:opacity-90 rounded-lg transition-opacity flex items-center gap-1.5 disabled:opacity-50"
                        >
                            {isUpdating && <Spinner size="sm" className="text-white" />}
                            {t('saveOrder')}
                        </button>
                    </div>
                </div>
                <DndContext
                    sensors={sensors}
                    collisionDetection={closestCenter}
                    onDragEnd={handleDragEnd}
                >
                    <SortableContext
                        items={editOrder.map(m => m.groups.id)}
                        strategy={verticalListSortingStrategy}
                    >
                        <div className="space-y-2">
                            {editOrder.map((m) => (
                                <SortableGroupCard key={m.groups.id} m={m} t={t} />
                            ))}
                        </div>
                    </SortableContext>
                </DndContext>
            </div>
        );
    }

    // === 通常モード ===
    return (
        <div>
            {/* 編集ボタン（グループが2つ以上ある場合のみ表示） */}
            {memberships.length >= 2 && (
                <div className="flex justify-end mb-3">
                    <button
                        onClick={startEditing}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
                        aria-label={t('editOrder')}
                    >
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4" />
                        </svg>
                        {t('editOrder')}
                    </button>
                </div>
            )}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-1.5 md:gap-3">
            {memberships.map((m) => (
                <div
                    key={m.groups.id}
                    className="relative bg-white midnight-solid-panel rounded-xl border border-gray-100 shadow-sm hover:shadow-md transition-all group"
                >
                    <Link href={`/groups/${m.groups.id}`} className="block h-full">
                        {/* バナー — md 以上のみフル表示 */}
                        <div className="hidden md:block w-full h-28 bg-[var(--theme-primary-light)] relative overflow-hidden rounded-t-xl border-b border-gray-100">
                            {m.rank && (
                                <div className={`absolute top-2 left-2 z-10 px-2 py-0.5 rounded text-xs font-black uppercase tracking-wide shadow-sm border border-white/20 backdrop-blur-md
                                    ${m.rank === 1 ? 'bg-yellow-400 text-yellow-900' :
                                        m.rank === 2 ? 'bg-gray-200 text-gray-800' :
                                            m.rank === 3 ? 'bg-orange-400 text-orange-900' : 'bg-white/90 text-[var(--theme-primary)]'}
                                `}>
                                    #{m.rank}
                                </div>
                            )}
                            {m.groups.header_image_url ? (
                                <div className="absolute inset-0">
                                    <img src={m.groups.header_image_url} alt="" className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105" />
                                    <div className="absolute inset-0 bg-black/10 group-hover:bg-black/0 transition-colors" />
                                </div>
                            ) : (
                                <div className="absolute inset-0 bg-gradient-to-br from-[var(--theme-primary-light)] to-[var(--theme-gradient-to)]/20" />
                            )}
                        </div>

                        {/* コンテンツ — モバイル(<md): 横型コンパクト+背景バナー / デスクトップ(md+): 縦型リッチ */}
                        <div className="relative">
                            {/* モバイル背景: バナー画像を半透明で表示 */}
                            {m.groups.header_image_url && (
                                <div className="md:hidden absolute inset-0 z-0 rounded-xl overflow-hidden">
                                    <img src={m.groups.header_image_url} alt="" className="w-full h-full object-cover" />
                                    <div className="absolute inset-0 bg-gradient-to-r from-white/90 via-white/80 to-white/60" />
                                </div>
                            )}
                            <div className="flex items-center gap-2.5 px-2.5 py-2 md:block md:px-4 md:pb-4 md:pt-0 relative z-[1]">
                            {/* アイコン — モバイル: インライン / デスクトップ: ネガティブマージンでバナーに重ねる */}
                            <div className="w-10 h-10 md:w-16 md:h-16 rounded-lg md:rounded-2xl md:-mt-8 md:mb-2 border-2 md:border-4 border-white shadow-sm shrink-0 bg-[var(--theme-primary-light)] overflow-hidden">
                                {m.groups.image_url ? (
                                    <img src={m.groups.image_url} alt="" className="w-full h-full object-cover" />
                                ) : (
                                    <div className="w-full h-full flex items-center justify-center font-bold text-sm md:text-xl text-[var(--theme-primary)]">
                                        {m.groups.name.substring(0, 1).toUpperCase()}
                                    </div>
                                )}
                            </div>

                            {/* テキスト */}
                            <div className="relative z-[1] min-w-0 flex-1 md:flex-none md:w-full md:pr-10">
                                <h3 className="text-sm md:text-lg font-bold text-gray-900 group-hover:text-[var(--theme-primary)] truncate transition-colors leading-tight">
                                    {m.groups.name}
                                </h3>
                                <div className="flex items-center gap-1.5 mt-0.5">
                                    {m.role === 'OWNER' && (
                                        <span className="shrink-0 px-1 py-0.5 bg-amber-100 text-amber-700 text-[10px] font-bold uppercase rounded leading-none">
                                            {t('owner')}
                                        </span>
                                    )}
                                    <span className="text-[11px] text-gray-400 truncate">#{m.groups.keyword}</span>
                                </div>
                                <div className="flex items-center gap-2 md:gap-3 mt-0.5 md:mt-2">
                                    {m.totalMembers && (
                                        <span className="inline-flex items-center gap-1 text-[11px] md:text-xs text-gray-500">
                                            <svg className="hidden md:inline w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656-.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                                            {t('members', { count: m.totalMembers })}
                                        </span>
                                    )}
                                    {m.rank && m.totalMembers && (
                                        <span className="inline-flex items-center gap-1 text-[11px] md:text-xs text-[var(--theme-primary)] font-bold">
                                            🏆 {t('rankOf', { rank: m.rank, total: m.totalMembers })}
                                        </span>
                                    )}
                                </div>
                                {/* プログレスバー — デスクトップのみ */}
                                {m.rank && m.totalMembers && m.totalMembers > 1 && (
                                    <div className="hidden md:block mt-2.5 w-full">
                                        <div className="w-full h-1.5 bg-gray-100 rounded-full overflow-hidden">
                                            <div
                                                className={`h-full rounded-full transition-all duration-700 ease-out ${
                                                    m.rank === 1 ? 'bg-yellow-400' :
                                                    m.rank === 2 ? 'bg-gray-400' :
                                                    m.rank === 3 ? 'bg-orange-400' : 'bg-[var(--theme-primary)]/60'
                                                }`}
                                                style={{ width: `${Math.max(10, ((m.totalMembers - m.rank + 1) / m.totalMembers) * 100)}%` }}
                                            />
                                        </div>
                                    </div>
                                )}
                            </div>
                            </div>
                        </div>
                    </Link>

                    {/* シェアボタン */}
                    <div className="absolute right-2 top-2 md:right-3 md:top-[calc(7rem-1.25rem)] z-20">
                        <button
                            onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                handleShareInvite(m.groups.keyword, m.groups.id);
                            }}
                            className="cursor-pointer p-1 rounded-full bg-white/80 shadow-sm border border-gray-200 text-gray-400 hover:text-[var(--theme-primary)] hover:bg-[var(--theme-primary-light)] transition-all flex items-center justify-center"
                            title={copiedId === m.groups.id ? t('copiedLink') : t('shareInvite')}
                            aria-label={t('shareInvite')}
                        >
                            {copiedId === m.groups.id ? (
                                <svg className="w-4 h-4 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
                            ) : (
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" /></svg>
                            )}
                        </button>
                    </div>
                </div>
            ))}
            </div>
        </div>
    );
}
