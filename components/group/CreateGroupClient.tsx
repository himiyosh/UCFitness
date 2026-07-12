'use client';

import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import Spinner from '@/components/ui/Spinner';

const KEYWORD_REGEX = /^[a-zA-Z0-9_-]{3,50}$/;

interface SearchUser {
  id: string;
  name: string | null;
  username: string | null;
  image: string | null;
}

export default function CreateGroupClient() {
  // ── ステップ管理 ──
  const [step, setStep] = useState(1);

  // ── Step 1: 基本情報 ──
  const [groupId, setGroupId] = useState('');
  const [groupName, setGroupName] = useState('');
  const [description, setDescription] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ── Step 2: メンバー招待 ──
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SearchUser[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [invitedMembers, setInvitedMembers] = useState<SearchUser[]>([]);
  const [invitingId, setInvitingId] = useState<string | null>(null);
  const [removingInvitedId, setRemovingInvitedId] = useState<string | null>(null);
  const [inviteSuccess, setInviteSuccess] = useState<Set<string>>(new Set());
  const [inviteError, setInviteError] = useState<string | null>(null);
  const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // ── タイムアウトクリーンアップ ──
  useEffect(() => {
    return () => {
      if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    };
  }, []);

  // ── 完了 ──
  const [createdKeyword, setCreatedKeyword] = useState('');
  const [createdGroupId, setCreatedGroupId] = useState<string | null>(null);

  const router = useRouter();
  const t = useTranslations('Groups');

  // ── ID バリデーション ──
  const idValid = groupId.trim().length >= 3 && KEYWORD_REGEX.test(groupId.trim());
  const idTouched = groupId.length > 0;

  // ── ユーザー検索（デバウンス付き） ──
  const handleSearch = useCallback((query: string) => {
    setSearchQuery(query);
    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    if (query.length < 3) {
      setSearchResults([]);
      return;
    }
    setIsSearching(true);
    searchTimeoutRef.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/user/search?q=${encodeURIComponent(query)}`);
        const data = await res.json();
        if (res.ok) {
          const invitedIds = new Set(invitedMembers.map(m => m.id));
          setSearchResults((data.users || []).filter((u: SearchUser) => !invitedIds.has(u.id)));
        }
      } catch {
        // ignore
      } finally {
        setIsSearching(false);
      }
    }, 400);
  }, [invitedMembers]);

  // ── ステップ1: グループ作成 ──
  const handleCreate = useCallback(async () => {
    setError(null);
    const id = groupId.trim();
    if (!id) { setError(t('groupIdRequired')); return; }
    if (!KEYWORD_REGEX.test(id)) { setError(t('groupIdInvalid')); return; }

    setIsCreating(true);
    try {
      const response = await fetch('/api/user/group', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'add',
          keyword: id,
          name: groupName.trim() || undefined,
          description: description.trim() || undefined,
        }),
      });
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || t('createError'));
      }
      const data = await response.json();
      setCreatedKeyword(id);
      setCreatedGroupId(typeof data.groupId === 'string' ? data.groupId : null);
      setStep(2);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : t('createError'));
    } finally {
      setIsCreating(false);
    }
  }, [groupId, groupName, description, t]);

  // ── ステップ2: メンバー招待 ──
  const handleInvite = async (user: SearchUser) => {
    setInvitingId(user.id);
    setInviteError(null);
    try {
      const res = await fetch('/api/user/group', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'invite',
          keyword: createdKeyword,
          targetUserId: user.id,
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        setInviteError(err.error || t('inviteFailed'));
        return;
      }
      setInvitedMembers(prev => [...prev, user]);
      setSearchResults(prev => prev.filter(u => u.id !== user.id));
      setInviteSuccess(prev => new Set(prev).add(user.id));
    } catch {
      setInviteError(t('inviteFailed'));
    } finally {
      setInvitingId(null);
    }
  };

  const handleRemoveInvited = async (userId: string) => {
    setRemovingInvitedId(userId);
    setInviteError(null);
    try {
      const response = await fetch('/api/user/group', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'kick',
          keyword: createdKeyword,
          targetUserId: userId,
        }),
      });
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || t('removeInviteFailed'));
      }
      setInvitedMembers(prev => prev.filter(member => member.id !== userId));
      setInviteSuccess(prev => {
        const next = new Set(prev);
        next.delete(userId);
        return next;
      });
    } catch (removeError: unknown) {
      setInviteError(removeError instanceof Error ? removeError.message : t('removeInviteFailed'));
    } finally {
      setRemovingInvitedId(null);
    }
  };

  const handleFinish = () => {
    router.push(createdGroupId ? `/groups/${createdGroupId}` : '/groups');
    router.refresh();
  };

  // ── ステップインジケーター（useMemoで安定化し不要なDOM再生成を防止） ──
  const stepIndicator = useMemo(() => (
    <div className="flex items-center justify-center gap-0">
      {/* ステップ1 */}
      <div className="flex items-center gap-2">
        <div className={`w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold transition-all duration-300 ${
          step >= 1
            ? 'bg-gradient-to-br from-[var(--theme-primary)] to-[var(--theme-gradient-to)] text-white shadow-md'
            : 'bg-gray-200 text-gray-400'
        }`}>
          {step > 1 ? '✓' : '1'}
        </div>
        <span className={`text-xs font-bold hidden sm:inline transition-colors ${step >= 1 ? 'text-gray-900' : 'text-gray-400'}`}>
          {t('stepBasicInfo')}
        </span>
      </div>
      {/* コネクター */}
      <div className={`w-12 sm:w-20 h-0.5 mx-2 rounded-full transition-all duration-500 ${
        step >= 2 ? 'bg-gradient-to-r from-[var(--theme-primary)] to-[var(--theme-gradient-to)]' : 'bg-gray-200'
      }`} />
      {/* ステップ2 */}
      <div className="flex items-center gap-2">
        <div className={`w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold transition-all duration-300 ${
          step >= 2
            ? 'bg-gradient-to-br from-[var(--theme-primary)] to-[var(--theme-gradient-to)] text-white shadow-md'
            : 'bg-gray-200 text-gray-400'
        }`}>
          2
        </div>
        <span className={`text-xs font-bold hidden sm:inline transition-colors ${step >= 2 ? 'text-gray-900' : 'text-gray-400'}`}>
          {t('stepInviteMembers')}
        </span>
      </div>
    </div>
  ), [step, t]);

  return (
    <main className="flex-1 flex flex-col bg-[var(--theme-page-bg)]">
      <div className="mx-auto max-w-2xl px-4 sm:px-6 lg:px-8 py-4 space-y-4">

        {/* パンくずリスト */}
        <nav className="flex items-center gap-1.5 text-sm text-gray-500">
          <Link href="/" className="hover:text-gray-700 transition-colors">🏠</Link>
          <span className="text-gray-300">/</span>
          <Link href="/groups" className="hover:text-[var(--theme-primary)] transition-colors">{t('title')}</Link>
          <span className="text-gray-300">/</span>
          <span className="text-gray-900 font-medium">{t('createPageTitle')}</span>
        </nav>

        {/* ヘッダー */}
        <div className="text-center sm:text-left">
          <h1 className="text-3xl sm:text-4xl font-bold tracking-tight flex items-center justify-center sm:justify-start gap-2.5">
            <span className="text-3xl">🏃‍♂️</span>
            <span className="text-[var(--color-primary-strong)]">
              {t('createPageTitle')}
            </span>
          </h1>
          <p className="mt-2 text-sm text-[var(--color-text-muted)]">
            {t('createPageDesc')}
          </p>
          <div className="mt-4 h-1 w-24 rounded-full bg-gradient-to-r from-[var(--theme-primary)] to-[var(--theme-gradient-to)] opacity-60 mx-auto sm:mx-0" />
        </div>

        {/* ステップインジケーター */}
        {stepIndicator}

        {/* ═══════════════════ ステップ1: 基本情報 ═══════════════════ */}
        {step === 1 && (
          <div className="space-y-5 animate-in fade-in slide-in-from-bottom-2 duration-300">

            {/* プレビューカード */}
            <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-[var(--theme-primary)]/5 to-[var(--theme-gradient-to)]/10 border border-[var(--theme-primary)]/10 p-5">
              <div className="absolute -top-6 -right-6 text-8xl opacity-10 select-none">🏆</div>
              <p className="text-xs uppercase tracking-wider text-gray-400 font-bold mb-2">{t('previewLabel')}</p>
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-[var(--theme-primary)] to-[var(--theme-gradient-to)] flex items-center justify-center text-white text-lg font-bold shadow-md">
                  {(groupName || groupId || 'G').charAt(0).toUpperCase()}
                </div>
                <div className="min-w-0">
                  <h3 className="font-bold text-gray-900 truncate">
                    {groupName || groupId || t('previewGroupName')}
                  </h3>
                  <p className="text-xs text-gray-400 truncate">
                    ID: {groupId || '---'}
                  </p>
                </div>
              </div>
            </div>

            {/* フォームカード */}
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 space-y-5">

              {/* グループID */}
              <div>
                <label htmlFor="group-id" className="flex items-center gap-2 text-sm font-bold text-gray-900 mb-1">
                  <span className="w-5 h-5 rounded bg-[var(--theme-primary)]/10 flex items-center justify-center text-xs">🔑</span>
                  {t('groupIdLabel')} <span className="text-red-500">*</span>
                </label>
                <p className="text-xs text-gray-400 mb-2 ml-7">{t('groupIdHelp')}</p>
                <div className="relative">
                  <input
                    id="group-id"
                    type="text"
                    value={groupId}
                    onChange={(e) => setGroupId(e.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, ''))}
                    onKeyDown={(e) => e.key === 'Enter' && idValid && handleCreate()}
                    placeholder="my-walking-group"
                    className={`block w-full rounded-xl border-0 py-3 px-4 pr-10 text-gray-900 shadow-sm ring-1 ring-inset placeholder:text-gray-300 focus:ring-2 focus:ring-inset focus:ring-[var(--theme-primary)] text-sm transition-all ${
                      idTouched
                        ? idValid ? 'ring-green-300 bg-green-50/30' : 'ring-red-300 bg-red-50/30'
                        : 'ring-gray-200'
                    }`}
                    maxLength={50}
                    disabled={isCreating}
                    autoFocus
                  />
                  {idTouched && (
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm">
                      {idValid ? '✅' : '❌'}
                    </span>
                  )}
                </div>
                {idTouched && !idValid && (
                  <p className="text-xs text-red-400 mt-1 ml-1">{t('groupIdInvalid')}</p>
                )}
              </div>

              {/* グループ名 */}
              <div>
                <label htmlFor="group-name" className="flex items-center gap-2 text-sm font-bold text-gray-900 mb-1">
                  <span className="w-5 h-5 rounded bg-[var(--theme-primary)]/10 flex items-center justify-center text-xs">✏️</span>
                  {t('groupNameLabel')}
                </label>
                <p className="text-xs text-gray-400 mb-2 ml-7">{t('groupNameHelp')}</p>
                <input
                  id="group-name"
                  type="text"
                  value={groupName}
                  onChange={(e) => setGroupName(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && idValid && handleCreate()}
                  placeholder={groupId || 'My Walking Group'}
                  className="block w-full rounded-xl border-0 py-3 px-4 text-gray-900 shadow-sm ring-1 ring-inset ring-gray-200 placeholder:text-gray-300 focus:ring-2 focus:ring-inset focus:ring-[var(--theme-primary)] text-sm"
                  disabled={isCreating}
                />
              </div>

              {/* 説明 */}
              <div>
                <label htmlFor="group-desc" className="flex items-center gap-2 text-sm font-bold text-gray-900 mb-1">
                  <span className="w-5 h-5 rounded bg-[var(--theme-primary)]/10 flex items-center justify-center text-xs">📝</span>
                  {t('groupDescLabel')}
                </label>
                <p className="text-xs text-gray-400 mb-2 ml-7">{t('groupDescHelp')}</p>
                <textarea
                  id="group-desc"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder={t('groupDescPlaceholder')}
                  rows={3}
                  className="block w-full rounded-xl border-0 py-3 px-4 text-gray-900 shadow-sm ring-1 ring-inset ring-gray-200 placeholder:text-gray-300 focus:ring-2 focus:ring-inset focus:ring-[var(--theme-primary)] text-sm resize-none"
                  disabled={isCreating}
                />
              </div>

              {/* エラー表示 */}
              {error && (
                <div className="flex items-center gap-2 p-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm animate-in fade-in duration-200">
                  <span className="text-base">⚠️</span>
                  {error}
                </div>
              )}

              {/* ボタン */}
              <div className="flex flex-col sm:flex-row gap-3 pt-2">
                <button
                  type="button"
                  onClick={handleCreate}
                  disabled={isCreating || !idValid}
                  className="flex-1 inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-[var(--theme-primary)] to-[var(--theme-gradient-to)] px-5 py-3.5 text-sm font-bold text-white shadow-md hover:shadow-lg hover:scale-[1.02] active:scale-[0.98] transition-all disabled:opacity-50 disabled:hover:scale-100 cursor-pointer"
                >
                  {isCreating ? (
                    <>
                      <Spinner size="sm" />
                      {t('creating')}
                    </>
                  ) : (
                    <>
                      {t('createAndNext')}
                      <span className="text-base">→</span>
                    </>
                  )}
                </button>
                <Link
                  href="/groups"
                  className="inline-flex items-center justify-center gap-2 rounded-xl px-5 py-3.5 text-sm font-bold text-gray-500 bg-gray-50 hover:bg-gray-100 border border-gray-200 transition-colors"
                >
                  {t('backToGroups')}
                </Link>
              </div>
            </div>

            {/* ヒント */}
            <div className="flex items-start gap-3 p-4 rounded-xl bg-blue-50/50 border border-blue-100 text-xs text-blue-700">
              <span className="text-lg mt-[-2px]">💡</span>
              <div>
                <p className="font-bold mb-0.5">{t('tipTitle')}</p>
                <p className="text-blue-600/70">{t('tipBody')}</p>
              </div>
            </div>
          </div>
        )}

        {/* ═══════════════════ ステップ2: メンバー招待 ═══════════════════ */}
        {step === 2 && (
          <div className="space-y-5 animate-in fade-in slide-in-from-bottom-2 duration-300">

            {/* 作成成功バナー */}
            <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-green-50 to-emerald-50 border border-green-200 p-5">
              <div className="absolute -top-4 -right-4 text-7xl opacity-10 select-none">🎉</div>
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-green-500 flex items-center justify-center text-white text-lg shadow-md">✓</div>
                <div>
                  <h3 className="font-bold text-green-900">{t('createSuccess')}</h3>
                  <p className="text-xs text-green-600">{t('createSuccessDesc')}</p>
                </div>
              </div>
            </div>

            {/* メンバー招待カード */}
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6 space-y-5">
              <div>
                <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                  <span>👥</span> {t('inviteMembersTitle')}
                </h2>
                <p className="text-xs text-gray-400 mt-1">{t('inviteMembersDesc')}</p>
              </div>

              {/* 検索バー */}
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                  </svg>
                </div>
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => handleSearch(e.target.value)}
                  placeholder={t('searchPlaceholder')}
                  className="block w-full rounded-xl border-0 py-3 pl-10 pr-4 text-gray-900 shadow-sm ring-1 ring-inset ring-gray-200 placeholder:text-gray-300 focus:ring-2 focus:ring-inset focus:ring-[var(--theme-primary)] text-sm"
                  autoFocus
                />
                {isSearching && (
                  <div className="absolute inset-y-0 right-3 flex items-center">
                    <Spinner size="sm" />
                  </div>
                )}
              </div>

              {/* 検索結果 */}
              {searchResults.length > 0 && (
                <div className="rounded-xl border border-gray-100 divide-y divide-gray-50 overflow-hidden max-h-60 overflow-y-auto">
                  {searchResults.map(user => (
                    <div key={user.id} className="flex items-center justify-between px-4 py-3 hover:bg-gray-50 transition-colors">
                      <div className="flex items-center gap-3 min-w-0">
                        {user.image ? (
                          <img src={user.image} alt="" className="w-9 h-9 rounded-full object-cover ring-2 ring-gray-100" />
                        ) : (
                          <div className="w-9 h-9 rounded-full bg-gradient-to-br from-gray-200 to-gray-300 flex items-center justify-center text-xs font-bold text-gray-500">
                            {(user.name || user.username || '?').charAt(0).toUpperCase()}
                          </div>
                        )}
                        <div className="min-w-0">
                          <p className="text-sm font-bold text-gray-900 truncate">{user.name || user.username || 'User'}</p>
                          {user.username && <p className="text-xs text-gray-400 truncate">@{user.username}</p>}
                        </div>
                      </div>
                      <button
                        onClick={() => handleInvite(user)}
                        disabled={invitingId === user.id}
                        className="flex min-h-[44px] items-center gap-1 rounded-lg bg-[var(--color-primary-solid)] px-3 py-2 text-xs font-bold text-white transition-colors hover:bg-[var(--color-primary-strong)] disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {invitingId === user.id ? <Spinner size="sm" /> : <span>+</span>}
                        {t('invite')}
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {/* 検索結果なし */}
              {searchQuery.length >= 3 && !isSearching && searchResults.length === 0 && (
                <div className="text-center py-4 text-gray-400 text-sm">
                  <span className="text-3xl block mb-2">🔍</span>
                  {t('noResultsFound')}
                </div>
              )}

              {/* 招待エラー */}
              {inviteError && (
                <div className="flex items-center gap-2 p-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm animate-in fade-in duration-200">
                  <span>⚠️</span> {inviteError}
                </div>
              )}

              {/* 招待済みメンバーリスト */}
              {invitedMembers.length > 0 && (
                <div>
                  <p className="text-xs font-bold text-gray-500 mb-2 flex items-center gap-1.5">
                    <span>✅</span> {t('invitedCount', { count: invitedMembers.length })}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {invitedMembers.map(user => (
                      <div
                        key={user.id}
                        className="flex items-center gap-2 bg-green-50 border border-green-200 rounded-full pl-1 pr-2 py-1 animate-in fade-in zoom-in duration-200"
                      >
                        {user.image ? (
                          <img src={user.image} alt="" className="w-6 h-6 rounded-full object-cover" />
                        ) : (
                          <div className="w-6 h-6 rounded-full bg-green-200 flex items-center justify-center text-xs font-bold text-green-700">
                            {(user.name || user.username || '?').charAt(0).toUpperCase()}
                          </div>
                        )}
                        <span className="text-xs font-medium text-green-800">{user.name || user.username}</span>
                        <button
                          onClick={() => handleRemoveInvited(user.id)}
                          disabled={removingInvitedId === user.id}
                          className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-full text-xs text-green-700 transition-colors hover:bg-red-50 hover:text-red-700 disabled:cursor-not-allowed disabled:opacity-50"
                          title={t('removeInvite')}
                          aria-label={t('removeInvite')}
                        >
                          {removingInvitedId === user.id ? <Spinner size="sm" /> : '✕'}
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* アクションボタン */}
            <div className="flex flex-col sm:flex-row gap-3">
              <button
                type="button"
                onClick={handleFinish}
                className="flex-1 inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-[var(--theme-primary)] to-[var(--theme-gradient-to)] px-5 py-3.5 text-sm font-bold text-white shadow-md hover:shadow-lg hover:scale-[1.02] active:scale-[0.98] transition-all cursor-pointer"
              >
                {t('goToGroup')}
                <span className="text-base">🚀</span>
              </button>
              <button
                type="button"
                onClick={handleFinish}
                className="inline-flex items-center justify-center gap-2 rounded-xl px-5 py-3.5 text-sm font-bold text-gray-500 bg-gray-50 hover:bg-gray-100 border border-gray-200 transition-colors cursor-pointer"
              >
                {t('skipInvite')}
              </button>
            </div>

            {/* 招待リンクヒント */}
            <div className="flex items-start gap-3 p-4 rounded-xl bg-purple-50/50 border border-purple-100 text-xs text-purple-700">
              <span className="text-lg mt-[-2px]">🔗</span>
              <div>
                <p className="font-bold mb-0.5">{t('shareTip')}</p>
                <p className="text-purple-600/70">{t('shareTipBody')}</p>
              </div>
            </div>
          </div>
        )}

      </div>
    </main>
  );
}
