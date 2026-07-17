'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useRouter } from 'next/navigation';

import { useTranslations } from 'next-intl';

import { useDialogFocus } from '@/hooks/useDialogFocus';

import DeleteGroupButton from './DeleteGroupButton';

const MAX_NAME_LENGTH = 50;
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB
const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];

interface EditGroupModalProps {
    groupId: string;
    groupKeyword: string; // Used for API targeting
    currentName: string;
    currentIcon?: string;
    currentHeader?: string;
    isVisible: boolean;
    isOpen: boolean;
    onClose: () => void;
}

export default function EditGroupModal({ groupId, groupKeyword, currentName, currentIcon, currentHeader, isVisible, isOpen, onClose }: EditGroupModalProps) {
    const router = useRouter();
    const t = useTranslations('EditGroup');
    const [name, setName] = useState(currentName);
    const [isPublic, setIsPublic] = useState(isVisible);
    const [iconFile, setIconFile] = useState<File | null>(null);
    const [headerFile, setHeaderFile] = useState<File | null>(null);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [showDangerZone, setShowDangerZone] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Previews
    const [iconPreview, setIconPreview] = useState(currentIcon);
    const [headerPreview, setHeaderPreview] = useState(currentHeader);
    const iconUrlRef = useRef<string | null>(null);
    const headerUrlRef = useRef<string | null>(null);
    const modalRef = useRef<HTMLDivElement>(null);

    useDialogFocus({ isOpen, onClose, dialogRef: modalRef });

    // オブジェクトURLのメモリリーク防止
    useEffect(() => {
        return () => {
            if (iconUrlRef.current) URL.revokeObjectURL(iconUrlRef.current);
            if (headerUrlRef.current) URL.revokeObjectURL(headerUrlRef.current);
        };
    }, []);

    // プロパティ変更時に状態を同期（モーダルが開くたびに最新値を反映）
    useEffect(() => {
        if (isOpen) {
            setName(currentName);
            setIsPublic(isVisible);
            setIconPreview(currentIcon);
            setHeaderPreview(currentHeader);
            setIconFile(null);
            setHeaderFile(null);
            setError(null);
            setShowDangerZone(false);
        }
    }, [isOpen, currentName, currentIcon, currentHeader, isVisible]);

    const validateFile = useCallback((file: File): string | null => {
        if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
            return t('invalidFileType');
        }
        if (file.size > MAX_FILE_SIZE) {
            return t('fileTooLarge');
        }
        return null;
    }, [t]);

    const handleIconChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            const file = e.target.files[0];
            const validationError = validateFile(file);
            if (validationError) { setError(validationError); return; }
            setError(null);
            if (iconUrlRef.current) URL.revokeObjectURL(iconUrlRef.current);
            const url = URL.createObjectURL(file);
            iconUrlRef.current = url;
            setIconFile(file);
            setIconPreview(url);
        }
    }, [validateFile]);

    const handleHeaderChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            const file = e.target.files[0];
            const validationError = validateFile(file);
            if (validationError) { setError(validationError); return; }
            setError(null);
            if (headerUrlRef.current) URL.revokeObjectURL(headerUrlRef.current);
            const url = URL.createObjectURL(file);
            headerUrlRef.current = url;
            setHeaderFile(file);
            setHeaderPreview(url);
        }
    }, [validateFile]);

    const handleSubmit = useCallback(async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);

        // 名前のバリデーション
        const trimmedName = name.trim();
        if (!trimmedName) {
            setError(t('nameRequired'));
            return;
        }
        if (trimmedName.length > MAX_NAME_LENGTH) {
            setError(t('nameTooLong', { count: MAX_NAME_LENGTH }));
            return;
        }

        setIsSubmitting(true);

        try {
            let uploadedIconUrl = currentIcon;
            let uploadedHeaderUrl = currentHeader;

            // 1 & 2. Upload Icon and Header in parallel if changed
            const uploadPromises: Promise<void>[] = [];

            if (iconFile) {
                const formData = new FormData();
                formData.append('file', iconFile);
                formData.append('groupId', groupId);
                formData.append('type', 'icon');
                uploadPromises.push(
                    fetch('/api/upload/group', { method: 'POST', body: formData })
                        .then(async (res) => {
                            const data = await res.json();
                            if (!res.ok) throw new Error(data.error || 'Icon upload failed');
                            uploadedIconUrl = data.publicUrl;
                        })
                );
            }

            if (headerFile) {
                const formData = new FormData();
                formData.append('file', headerFile);
                formData.append('groupId', groupId);
                formData.append('type', 'header');
                uploadPromises.push(
                    fetch('/api/upload/group', { method: 'POST', body: formData })
                        .then(async (res) => {
                            const data = await res.json();
                            if (!res.ok) throw new Error(data.error || 'Header upload failed');
                            uploadedHeaderUrl = data.publicUrl;
                        })
                );
            }

            await Promise.all(uploadPromises);

            // 3. Update Group Metadata
            const res = await fetch('/api/user/group', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    action: 'update_metadata',
                    keyword: groupKeyword,
                    name: trimmedName,
                    image_url: uploadedIconUrl,
                    header_image_url: uploadedHeaderUrl,
                    is_public: isPublic,
                }),
            });

            if (!res.ok) throw new Error('Failed to update group');

            router.refresh();
            onClose();
        } catch {
            setError(t('updateFailed'));
        } finally {
            setIsSubmitting(false);
        }
    }, [name, currentIcon, currentHeader, iconFile, headerFile, groupId, groupKeyword, isPublic, router, onClose, t]);

    const [mounted, setMounted] = useState(false);

    useEffect(() => {
        setMounted(true);
    }, []);

    if (!mounted || !isOpen) return null;

    return createPortal(
        <div className="fixed inset-0 z-[100] isolate flex items-center justify-center p-4 sm:p-6" role="dialog" aria-modal="true" aria-labelledby="edit-group-dialog-title">
            <div className="fixed inset-0 bg-black/60 backdrop-blur-sm transition-opacity" onClick={onClose} aria-hidden="true" />

            <div ref={modalRef} tabIndex={-1} className="relative z-50 max-h-[90dvh] w-full max-w-lg overflow-y-auto rounded-xl bg-white shadow-xl outline-none animate-fade-in">
                <form onSubmit={handleSubmit}>
                    <div className="p-4 sm:p-6">
                        <h2 id="edit-group-dialog-title" className="mb-4 text-xl font-bold text-gray-900">{t('title')}</h2>

                        {/* エラー表示 */}
                        {error && (
                            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg flex items-start gap-2 animate-fade-in" role="alert">
                                <svg className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                                <p className="text-sm text-red-700">{error}</p>
                            </div>
                        )}

                        {/* Name Input */}
                        <div className="mb-6">
                            <label htmlFor="group-name" className="block text-sm font-medium text-gray-700 mb-2">{t('groupName')}</label>
                            <input
                                id="group-name"
                                type="text"
                                value={name}
                                onChange={(e) => setName(e.target.value)}
                                maxLength={MAX_NAME_LENGTH}
                                className="min-h-[44px] w-full rounded-lg border border-gray-300 px-4 py-2 text-gray-900 outline-none focus:border-[var(--theme-primary)] focus:ring-2 focus:ring-[var(--theme-primary)]"
                                required
                                aria-describedby="name-char-count"
                            />
                            <p id="name-char-count" className="mt-1 text-xs text-[var(--foreground-muted)]">{name.length}/{MAX_NAME_LENGTH}</p>
                        </div>

                        {/* Header Image Input */}
                        <div className="mb-6">
                            <label className="block text-sm font-medium text-gray-700 mb-2">{t('headerImage')}</label>
                            <div className="relative h-32 w-full rounded-xl bg-gray-100 overflow-hidden border border-dashed border-gray-300 group cursor-pointer hover:border-[var(--theme-primary)] transition-colors">
                                {headerPreview ? (
                                    <img src={headerPreview} alt={t('headerPreviewAlt')} className="h-full w-full object-cover" />
                                ) : (
                                    <div className="flex items-center justify-center h-full text-gray-400">
                                        <span className="text-xs">{t('uploadHeaderHint')}</span>
                                    </div>
                                )}
                                <input
                                    type="file"
                                    accept="image/*"
                                    onChange={handleHeaderChange}
                                    className="absolute inset-0 opacity-0 cursor-pointer"
                                    aria-label={t('uploadHeader')}
                                />
                                <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors flex items-center justify-center pointer-events-none">
                                    <svg className="w-8 h-8 text-white opacity-0 group-hover:opacity-100 transition-opacity" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" /></svg>
                                </div>
                            </div>
                        </div>

                        {/* Visibility Toggle */}
                        <div className="mb-6 flex items-center justify-between">
                            <div className="flex flex-col">
                                <span className="text-sm font-medium text-gray-700">{t('showInRankings')}</span>
                                <span className="text-xs text-gray-500">{t('showInRankingsDescription')}</span>
                            </div>
                            <button
                                type="button"
                                onClick={() => setIsPublic(!isPublic)}
                                role="switch"
                                aria-checked={isPublic}
                                aria-label={t('showInRankings')}
                                className="inline-flex min-h-[44px] min-w-[56px] flex-shrink-0 items-center justify-center rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--theme-primary)] focus-visible:ring-offset-2"
                            >
                                <span
                                    aria-hidden="true"
                                    className={`relative inline-flex h-6 w-11 rounded-full transition-colors ${isPublic ? 'bg-[var(--theme-primary)]' : 'bg-gray-300'}`}
                                >
                                    <span className={`pointer-events-none inline-block h-5 w-5 translate-y-0.5 rounded-full bg-white shadow transition-transform ${isPublic ? 'translate-x-5' : 'translate-x-0.5'}`} />
                                </span>
                            </button>
                        </div>

                        {/* Icon Input */}
                        <div className="mb-6">
                            <label className="block text-sm font-medium text-gray-700 mb-2">{t('groupIcon')}</label>
                            <div className="flex items-center gap-4">
                                <div className="relative h-20 w-20 rounded-xl bg-[var(--theme-primary-light)] overflow-hidden border border-dashed border-gray-300 group cursor-pointer hover:border-[var(--theme-primary)] transition-colors flex-shrink-0">
                                    {iconPreview ? (
                                        <img src={iconPreview} alt={t('iconPreviewAlt')} className="h-full w-full object-cover" />
                                    ) : (
                                        <div className="flex h-full items-center justify-center text-2xl font-bold text-[var(--color-primary-strong)]">
                                            {currentName.substring(0, 1).toUpperCase()}
                                        </div>
                                    )}
                                    <input
                                        type="file"
                                        accept="image/*"
                                        onChange={handleIconChange}
                                        className="absolute inset-0 opacity-0 cursor-pointer"
                                        aria-label={t('uploadIcon')}
                                    />
                                    <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors flex items-center justify-center pointer-events-none">
                                        <svg className="w-6 h-6 text-white opacity-0 group-hover:opacity-100 transition-opacity" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" /></svg>
                                    </div>
                                </div>
                                <div className="text-xs text-gray-500">
                                    <p>{t('squareImageHint')}</p>
                                    <p>{t('changeImageHint')}</p>
                                </div>
                            </div>
                        </div>

                    </div>

                    <div className="flex justify-end gap-3 rounded-b-xl bg-gray-50 px-4 py-3 sm:px-6 sm:py-4">
                        <button
                            type="button"
                            onClick={onClose}
                            className="min-h-[44px] rounded-lg px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-100"
                        >
                            {t('cancel')}
                        </button>
                        <button
                            type="submit"
                            disabled={isSubmitting}
                            className="flex min-h-[44px] items-center gap-2 rounded-lg bg-[var(--theme-primary)] px-4 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-[var(--theme-primary)]/90 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                            {isSubmitting ? (
                                <>
                                    <svg className="animate-spin h-4 w-4 text-white" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                                    {t('saving')}
                                </>
                            ) : (
                                t('save')
                            )}
                        </button>
                    </div>
                </form>

                {showDangerZone ? (
                    <div className="px-6 pb-6 bg-red-50/30 animate-in slide-in-from-top-2 fade-in duration-200">
                        <DeleteGroupButton groupKeyword={groupKeyword} groupName={currentName} />
                        <button
                            onClick={() => setShowDangerZone(false)}
                            className="mt-2 min-h-[44px] w-full text-center text-xs text-gray-600 hover:text-gray-800 hover:underline"
                        >
                            {t('cancelDangerZone')}
                        </button>
                    </div>
                ) : (
                    <div className="px-6 py-4 flex justify-center opacity-75 hover:opacity-100 transition-opacity">
                        <button
                            onClick={() => setShowDangerZone(true)}
                            className="flex min-h-[44px] items-center gap-2 rounded-lg px-4 py-2 text-xs font-bold text-gray-600 transition-colors hover:text-red-700"
                        >
                            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                            {t('deleteGroup')}
                        </button>
                    </div>
                )}
            </div>
        </div>,
        document.body
    );
}
