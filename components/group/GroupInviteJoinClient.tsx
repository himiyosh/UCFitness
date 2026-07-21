'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import { useTranslations } from 'next-intl';

import { parseGroupInviteHash } from '@/lib/group-invite';
import { Link } from '@/navigation';

import Spinner from '@/components/ui/Spinner';

type JoinStatus =
    | 'loading'
    | 'invalid'
    | 'expired'
    | 'success'
    | 'alreadyMember'
    | 'authRequired'
    | 'networkError'
    | 'serviceError';

interface Props {
    signInHref: string;
}

interface JoinResult {
    groupId: string;
    alreadyMember: boolean;
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null;
}

function isJoinResult(value: unknown): value is JoinResult {
    return isRecord(value)
        && typeof value.groupId === 'string'
        && typeof value.alreadyMember === 'boolean';
}

export default function GroupInviteJoinClient({ signInHref }: Props) {
    const t = useTranslations('GroupInvite');
    const tokenRef = useRef<string | null>(null);
    const startedRef = useRef(false);
    const mountedRef = useRef(true);
    const requestIdRef = useRef(0);
    const focusResultAfterRetryRef = useRef(false);
    const resultTitleRef = useRef<HTMLHeadingElement>(null);
    const [status, setStatus] = useState<JoinStatus>('loading');
    const [groupId, setGroupId] = useState<string | null>(null);
    const [isRetrying, setIsRetrying] = useState(false);

    const joinGroup = useCallback(async (token: string): Promise<void> => {
        const requestId = ++requestIdRef.current;
        setStatus('loading');

        try {
            const response = await fetch('/api/group/invite', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'join', token }),
            });
            const body: unknown = await response.json().catch(() => null);
            if (!mountedRef.current || requestId !== requestIdRef.current) return;

            if (response.status === 404) return setStatus('invalid');
            if (response.status === 410) return setStatus('expired');
            if (response.status === 401) return setStatus('authRequired');
            if (!response.ok || !isJoinResult(body)) return setStatus('serviceError');

            setGroupId(body.groupId);
            setStatus(body.alreadyMember ? 'alreadyMember' : 'success');
        } catch {
            if (mountedRef.current && requestId === requestIdRef.current) {
                setStatus('networkError');
            }
        } finally {
            if (mountedRef.current && requestId === requestIdRef.current) {
                setIsRetrying(false);
            }
        }
    }, []);

    const handleRetry = useCallback(() => {
        if (tokenRef.current) {
            focusResultAfterRetryRef.current = true;
            setIsRetrying(true);
            void joinGroup(tokenRef.current);
        }
    }, [joinGroup]);

    useEffect(() => {
        mountedRef.current = true;
        if (!startedRef.current) {
            startedRef.current = true;
            const token = parseGroupInviteHash(window.location.hash);
            window.history.replaceState(
                window.history.state,
                '',
                `${window.location.pathname}${window.location.search}`,
            );
            tokenRef.current = token;
            if (token) void joinGroup(token);
            else setStatus('invalid');
        }
        return () => {
            mountedRef.current = false;
        };
    }, [joinGroup]);

    useEffect(() => {
        if (status !== 'loading' && focusResultAfterRetryRef.current) {
            focusResultAfterRetryRef.current = false;
            resultTitleRef.current?.focus();
        }
    }, [status]);

    const isComplete = (status === 'success' || status === 'alreadyMember') && groupId;
    const canRetry = status === 'authRequired' || status === 'networkError' || status === 'serviceError';
    const canLeave = status === 'invalid' || status === 'expired';
    const title = t(`${status}Title`);
    const description = t(`${status}Desc`);

    return (
        <section
            aria-labelledby="invite-result-title"
            aria-live="polite"
            aria-busy={status === 'loading'}
            className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4 shadow-sm sm:p-5"
        >
            <div className="flex min-w-0 items-start gap-3">
                <span
                    className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[var(--color-competition-soft)] text-[var(--color-competition-strong)]"
                    aria-hidden="true"
                >
                    {status === 'loading' ? <Spinner className="text-current" label={title} /> : '↗'}
                </span>
                <div className="min-w-0 flex-1">
                    <h2
                        ref={resultTitleRef}
                        id="invite-result-title"
                        tabIndex={-1}
                        className="text-lg font-bold text-[var(--color-text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)]"
                    >
                        {title}
                    </h2>
                    <p className="mt-1 text-sm leading-6 text-[var(--color-text-muted)]">{description}</p>
                    {isComplete ? (
                        <Link
                            href={`/groups/${encodeURIComponent(groupId)}`}
                            className="mt-4 inline-flex min-h-[44px] max-w-full min-w-0 items-center justify-center rounded-xl bg-[var(--color-primary-solid)] px-4 py-2 text-center text-sm font-bold text-white transition-colors [overflow-wrap:anywhere] hover:bg-[var(--color-inverse-surface)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-primary-strong)]"
                        >
                            {t('openGroup')}
                        </Link>
                    ) : (
                        <div className="mt-4 flex flex-col gap-2 sm:flex-row">
                            {status === 'authRequired' && (
                                <Link
                                    href={signInHref}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="inline-flex min-h-[44px] max-w-full min-w-0 items-center justify-center rounded-xl bg-[var(--color-primary-solid)] px-4 py-2 text-center text-sm font-bold text-white transition-colors [overflow-wrap:anywhere] hover:bg-[var(--color-inverse-surface)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-primary-strong)]"
                                >
                                    {t('signInNewTab')}
                                </Link>
                            )}
                            {canLeave && (
                                <Link
                                    href="/groups"
                                    className="inline-flex min-h-[44px] max-w-full min-w-0 items-center justify-center rounded-xl border border-[var(--color-primary)] px-4 py-2 text-center text-sm font-bold text-[var(--color-primary-strong)] [overflow-wrap:anywhere] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-primary-strong)]"
                                >
                                    {t('backToGroups')}
                                </Link>
                            )}
                            {(canRetry || isRetrying) && (
                                <button
                                    type="button"
                                    onClick={handleRetry}
                                    disabled={status === 'loading'}
                                    className="inline-flex min-h-[44px] max-w-full min-w-0 items-center justify-center gap-2 rounded-xl border border-[var(--color-primary)] px-4 py-2 text-center text-sm font-bold text-[var(--color-primary-strong)] transition-colors [overflow-wrap:anywhere] hover:bg-[var(--color-primary-soft)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-primary-strong)] disabled:cursor-not-allowed disabled:opacity-70"
                                >
                                    {status === 'loading' && <Spinner size="xs" label={t('retrying')} />}
                                    {t(status === 'loading' ? 'retrying' : 'retry')}
                                </button>
                            )}
                        </div>
                    )}
                </div>
            </div>
        </section>
    );
}
