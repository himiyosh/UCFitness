'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useTranslations } from 'next-intl';
import UserAvatar from '@/components/UserAvatar';

// ============================================
// GroupChat — グループ内チャットコンポーネント
// グループ詳細ページに配置するシンプルなテキストチャット
// ============================================

interface ChatUser {
    id: string;
    name: string | null;
    image: string | null;
    username: string | null;
}

interface ChatMessage {
    id: string;
    user_id: string;
    message: string;
    created_at: string;
    users: ChatUser;
}

interface GroupChatProps {
    groupId: string;
    currentUserId: string;
}

/** メッセージのポーリング間隔（ms） */
const POLL_INTERVAL = 15000;

/** 最大メッセージ文字数 */
const MAX_LENGTH = 500;

export default function GroupChat({ groupId, currentUserId }: GroupChatProps) {
    const t = useTranslations('GroupChat');

    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState(false);
    const [inputText, setInputText] = useState('');
    const [isSending, setIsSending] = useState(false);

    const chatContainerRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);

    const fetchMessages = useCallback(async () => {
        try {
            const res = await fetch(`/api/group/${groupId}/messages`);
            if (!res.ok) throw new Error('fetch failed');
            const data = await res.json();
            setMessages(data.messages || []);
            setError(false);
        } catch {
            setError(true);
        } finally {
            setIsLoading(false);
        }
    }, [groupId]);

    // 初回ロード
    useEffect(() => {
        fetchMessages();
    }, [fetchMessages]);

    // ポーリング（常時）
    useEffect(() => {
        const interval = setInterval(fetchMessages, POLL_INTERVAL);
        return () => clearInterval(interval);
    }, [fetchMessages]);

    // 新メッセージが来たらチャットコンテナ内のみスクロール（ページ全体は動かさない）
    useEffect(() => {
        if (chatContainerRef.current) {
            chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
        }
    }, [messages.length]);

    // メッセージ送信
    const handleSend = useCallback(async () => {
        const text = inputText.trim();
        if (!text || isSending) return;

        setIsSending(true);
        try {
            const res = await fetch(`/api/group/${groupId}/messages`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ message: text }),
            });

            if (!res.ok) throw new Error('send failed');
            const data = await res.json();

            // 新メッセージをローカルに追加（再取得を待たずに即座に表示）
            setMessages((prev) => [...prev, data.message]);
            setInputText('');
            inputRef.current?.focus();
        } catch {
            // 送信失敗時は何もしない（入力テキストは保持）
        } finally {
            setIsSending(false);
        }
    }, [inputText, isSending, groupId]);

    // Enter キーで送信
    const handleKeyDown = useCallback(
        (e: React.KeyboardEvent) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSend();
            }
        },
        [handleSend]
    );

    // 相対時刻表示
    const formatTime = useCallback(
        (dateStr: string): string => {
            const now = Date.now();
            const date = new Date(dateStr).getTime();
            const diffMs = now - date;
            const diffMin = Math.floor(diffMs / 60000);

            if (diffMin < 1) return t('justNow');
            if (diffMin < 60) return t('minutesAgo', { count: diffMin });
            const diffHour = Math.floor(diffMin / 60);
            if (diffHour < 24) return t('hoursAgo', { count: diffHour });
            const diffDay = Math.floor(diffHour / 24);
            return t('daysAgo', { count: diffDay });
        },
        [t]
    );

    const messageCount = messages.length;

    // プロフィールカードのホバー状態
    const [hoveredUser, setHoveredUser] = useState<ChatUser | null>(null);
    const [cardPos, setCardPos] = useState<{ top: number; left: number } | null>(null);
    const hoverTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const showTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const pendingUserRef = useRef<{ user: ChatUser; rect: DOMRect } | null>(null);
    const isHoveringCardRef = useRef(false);

    /** 表示遅延: 500ms ホバー後にカードを表示 */
    const handleAvatarEnter = useCallback((e: React.MouseEvent, user: ChatUser) => {
        if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current);
        const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
        pendingUserRef.current = { user, rect };

        // 既に同じユーザーのカードが表示中なら即座にキープ
        if (hoveredUser?.id === user.id) return;

        if (showTimerRef.current) clearTimeout(showTimerRef.current);
        showTimerRef.current = setTimeout(() => {
            if (!pendingUserRef.current) return;
            const { user: u, rect: r } = pendingUserRef.current;
            // アバター直下・中央寄せで配置（付近に表示）
            const cardWidth = 220;
            const viewportW = window.innerWidth;
            // アバター中心を基準にカードを中央配置
            const avatarCenterX = r.left + r.width / 2;
            let left = avatarCenterX - cardWidth / 2;
            // ビューポート端のクランプ
            if (left + cardWidth > viewportW - 8) left = viewportW - cardWidth - 8;
            if (left < 8) left = 8;
            // アバター直下に 4px ギャップ
            const top = r.bottom + 4;
            setCardPos({ top, left });
            setHoveredUser(u);
        }, 500);
    }, [hoveredUser]);

    const handleAvatarLeave = useCallback(() => {
        // 表示遅延中ならキャンセル
        if (showTimerRef.current) clearTimeout(showTimerRef.current);
        pendingUserRef.current = null;

        hoverTimerRef.current = setTimeout(() => {
            if (!isHoveringCardRef.current) {
                setHoveredUser(null);
                setCardPos(null);
            }
        }, 200);
    }, []);

    const handleCardEnter = useCallback(() => {
        isHoveringCardRef.current = true;
        if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current);
    }, []);

    const handleCardLeave = useCallback(() => {
        isHoveringCardRef.current = false;
        setHoveredUser(null);
        setCardPos(null);
    }, []);

    return (
        <div className="bg-white midnight-solid-panel rounded-2xl border border-gray-100 overflow-hidden hover:shadow-lg transition-shadow w-full flex flex-col">
            {/* ヘッダー */}
            <div className="px-4 py-3 flex items-center min-h-[44px]">
                <h3 className="text-sm font-bold text-gray-900 flex items-center gap-1.5">
                    💬 {t('title')}
                    {messageCount > 0 && (
                        <span className="text-[10px] font-medium text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded-full">
                            {messageCount}
                        </span>
                    )}
                </h3>
            </div>

            {/* チャットエリア（常時表示） */}
            <div id="group-chat-messages" className="flex-1 flex flex-col">
                    {/* メッセージ一覧 */}
                    <div
                        ref={chatContainerRef}
                        className="max-h-[300px] overflow-y-auto px-4 py-2 space-y-2 flex-1"
                        role="log"
                        aria-live="polite"
                    >
                        {isLoading && (
                            <div className="flex justify-center py-8">
                                <div className="w-5 h-5 border-2 border-[var(--theme-primary)] border-t-transparent rounded-full animate-spin" />
                            </div>
                        )}

                        {error && !isLoading && (
                            <div className="text-center py-4">
                                <p className="text-sm text-red-500">{t('loadError')}</p>
                                <button
                                    onClick={fetchMessages}
                                    className="mt-1 text-xs text-[var(--theme-primary)] font-semibold hover:underline min-h-[44px] px-2"
                                >
                                    🔄 {t('retry')}
                                </button>
                            </div>
                        )}

                        {!isLoading && !error && messages.length === 0 && (
                            <div className="text-center py-6">
                                <p className="text-2xl mb-1">💬</p>
                                <p className="text-xs text-gray-400">{t('empty')}</p>
                            </div>
                        )}

                        {messages.map((msg) => {
                            const isMe = msg.user_id === currentUserId;
                            return (
                                <div
                                    key={msg.id}
                                    className={`flex gap-2 ${isMe ? 'flex-row-reverse' : 'flex-row'}`}
                                >
                                    {/* アバター（全ユーザー表示） */}
                                    <div
                                        className="flex-shrink-0 cursor-pointer"
                                        onMouseEnter={(e) => msg.users && handleAvatarEnter(e, msg.users)}
                                        onMouseLeave={handleAvatarLeave}
                                    >
                                        <UserAvatar
                                            src={msg.users?.image}
                                            name={msg.users?.name || '?'}
                                            size="sm"
                                        />
                                    </div>

                                    {/* メッセージバブル */}
                                    <div className={`max-w-[70%] ${isMe ? 'items-end' : 'items-start'}`}>
                                        {!isMe && (
                                            <p className="text-[10px] text-gray-400 mb-0.5 px-1">
                                                {msg.users?.name || t('unknown')}
                                            </p>
                                        )}
                                        <div
                                            className={`px-3 py-1.5 rounded-2xl text-sm break-words ${
                                                isMe
                                                    ? 'bg-[var(--theme-primary)] text-white rounded-br-sm'
                                                    : 'bg-gray-100 text-gray-800 rounded-bl-sm'
                                            }`}
                                        >
                                            {msg.message}
                                        </div>
                                        <p className={`text-[9px] text-gray-300 mt-0.5 px-1 ${isMe ? 'text-right' : ''}`}>
                                            {formatTime(msg.created_at)}
                                        </p>
                                    </div>
                                </div>
                            );
                        })}
                    </div>

                    {/* 入力エリア */}
                    <div className="border-t border-gray-100 px-3 py-2 flex items-center gap-2">
                        <input
                            ref={inputRef}
                            type="text"
                            value={inputText}
                            onChange={(e) => setInputText(e.target.value.slice(0, MAX_LENGTH))}
                            onKeyDown={handleKeyDown}
                            placeholder={t('placeholder')}
                            className="flex-1 px-3 py-2 text-sm border border-gray-200 rounded-full focus:outline-none focus:ring-2 focus:ring-[var(--theme-primary)]/30 focus:border-[var(--theme-primary)] min-h-[44px]"
                            disabled={isSending}
                            maxLength={MAX_LENGTH}
                            aria-label={t('placeholder')}
                        />
                        <button
                            onClick={handleSend}
                            disabled={!inputText.trim() || isSending}
                            className="flex-shrink-0 w-10 h-10 min-h-[44px] min-w-[44px] flex items-center justify-center rounded-full bg-[var(--theme-primary)] text-white disabled:opacity-40 hover:scale-105 active:scale-95 transition-transform"
                            aria-label={t('send')}
                        >
                            {isSending ? (
                                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                            ) : (
                                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                                    <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" />
                                </svg>
                            )}
                        </button>
                    </div>

                    {/* 文字数カウンター */}
                    {inputText.length > MAX_LENGTH * 0.8 && (
                        <div className="px-4 pb-1 text-right">
                            <span className={`text-[10px] ${inputText.length >= MAX_LENGTH ? 'text-red-500' : 'text-gray-400'}`}>
                                {inputText.length}/{MAX_LENGTH}
                            </span>
                        </div>
                    )}
                </div>

            {/* プロフィールカード（Portal） */}
            {hoveredUser && cardPos && typeof document !== 'undefined' && createPortal(
                <div
                    className="fixed z-[60] bg-white rounded-xl shadow-xl border border-gray-200 p-3 min-w-[200px] pointer-events-auto"
                    style={{ top: cardPos.top, left: cardPos.left }}
                    onMouseEnter={handleCardEnter}
                    onMouseLeave={handleCardLeave}
                >
                    <div className="flex items-center gap-3">
                        <UserAvatar
                            src={hoveredUser.image}
                            name={hoveredUser.name || '?'}
                            size="md"
                        />
                        <div className="min-w-0">
                            <p className="text-sm font-bold text-gray-900 truncate">{hoveredUser.name || t('unknown')}</p>
                            {hoveredUser.username && (
                                <p className="text-xs text-gray-400 truncate">@{hoveredUser.username}</p>
                            )}
                        </div>
                    </div>
                    {hoveredUser.username && (
                        <a
                            href={`/user/${hoveredUser.username}`}
                            className="mt-2 block text-center text-xs font-semibold text-[var(--theme-primary)] bg-[var(--theme-primary-light)] rounded-lg py-1.5 hover:opacity-80 transition-opacity"
                        >
                            {t('viewProfile')}
                        </a>
                    )}
                </div>,
                document.body
            )}
        </div>
    );
}
