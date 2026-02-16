'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useRouter } from 'next/navigation';
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

    // オブジェクトURLのメモリリーク防止
    useEffect(() => {
        return () => {
            if (iconUrlRef.current) URL.revokeObjectURL(iconUrlRef.current);
            if (headerUrlRef.current) URL.revokeObjectURL(headerUrlRef.current);
        };
    }, []);

    // Escキーでモーダルを閉じる
    useEffect(() => {
        if (!isOpen) return;
        const handleEscape = (e: KeyboardEvent) => {
            if (e.key === 'Escape' && !isSubmitting) onClose();
        };
        document.addEventListener('keydown', handleEscape);
        return () => document.removeEventListener('keydown', handleEscape);
    }, [isOpen, isSubmitting, onClose]);

    // モーダルオープン時にフォーカス
    useEffect(() => {
        if (isOpen && modalRef.current) modalRef.current.focus();
    }, [isOpen]);

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
            return 'Invalid file type. Please use JPEG, PNG, GIF, or WebP.';
        }
        if (file.size > MAX_FILE_SIZE) {
            return 'File is too large. Maximum size is 5MB.';
        }
        return null;
    }, []);

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
            setError('Group name cannot be empty.');
            return;
        }
        if (trimmedName.length > MAX_NAME_LENGTH) {
            setError(`Group name must be ${MAX_NAME_LENGTH} characters or fewer.`);
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
            setError('Failed to update group settings. Please try again.');
        } finally {
            setIsSubmitting(false);
        }
    }, [name, currentIcon, currentHeader, iconFile, headerFile, groupId, groupKeyword, isPublic, router, onClose]);

    const [mounted, setMounted] = useState(false);

    useEffect(() => {
        setMounted(true);
    }, []);

    if (!mounted || !isOpen) return null;

    return createPortal(
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 sm:p-6 isolate" role="dialog" aria-modal="true" aria-label="Edit Group Details">
            <div className="fixed inset-0 bg-black/60 backdrop-blur-sm transition-opacity" onClick={!isSubmitting ? onClose : undefined} aria-hidden="true" />

            <div ref={modalRef} tabIndex={-1} className="relative bg-white rounded-2xl shadow-xl w-full max-w-lg overflow-hidden animate-fade-in z-50 max-h-[90vh] overflow-y-auto outline-none">
                <form onSubmit={handleSubmit}>
                    <div className="p-6">
                        <h2 className="text-xl font-bold text-gray-900 mb-6">Edit Group Details</h2>

                        {/* エラー表示 */}
                        {error && (
                            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg flex items-start gap-2 animate-fade-in" role="alert">
                                <svg className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                                <p className="text-sm text-red-700">{error}</p>
                            </div>
                        )}

                        {/* Name Input */}
                        <div className="mb-6">
                            <label htmlFor="group-name" className="block text-sm font-medium text-gray-700 mb-2">Group Name</label>
                            <input
                                id="group-name"
                                type="text"
                                value={name}
                                onChange={(e) => setName(e.target.value)}
                                maxLength={MAX_NAME_LENGTH}
                                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-[var(--theme-primary)] focus:border-[var(--theme-primary)] outline-none text-gray-900"
                                required
                                aria-describedby="name-char-count"
                            />
                            <p id="name-char-count" className="mt-1 text-xs text-[var(--foreground-muted)]">{name.length}/{MAX_NAME_LENGTH}</p>
                        </div>

                        {/* Header Image Input */}
                        <div className="mb-6">
                            <label className="block text-sm font-medium text-gray-700 mb-2">Header Image</label>
                            <div className="relative h-32 w-full rounded-xl bg-gray-100 overflow-hidden border border-dashed border-gray-300 group cursor-pointer hover:border-[var(--theme-primary)] transition-colors">
                                {headerPreview ? (
                                    <img src={headerPreview} alt="Header Preview" className="h-full w-full object-cover" />
                                ) : (
                                    <div className="flex items-center justify-center h-full text-gray-400">
                                        <span className="text-xs">Click to upload header</span>
                                    </div>
                                )}
                                <input
                                    type="file"
                                    accept="image/*"
                                    onChange={handleHeaderChange}
                                    className="absolute inset-0 opacity-0 cursor-pointer"
                                    aria-label="Upload header image"
                                />
                                <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors flex items-center justify-center pointer-events-none">
                                    <svg className="w-8 h-8 text-white opacity-0 group-hover:opacity-100 transition-opacity" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" /></svg>
                                </div>
                            </div>
                        </div>

                        {/* Visibility Toggle */}
                        <div className="mb-6 flex items-center justify-between">
                            <div className="flex flex-col">
                                <span className="text-sm font-medium text-gray-700">Show in Rankings</span>
                                <span className="text-xs text-gray-500">If disabled, the group will be hidden from public leaderboards.</span>
                            </div>
                            <button
                                type="button"
                                onClick={() => setIsPublic(!isPublic)}
                                className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-[var(--theme-primary)] focus:ring-offset-2 ${isPublic ? 'bg-[var(--theme-primary)]' : 'bg-gray-200'}`}
                                role="switch"
                                aria-checked={isPublic}
                                aria-label="Show in Rankings"
                            >
                                <span
                                    aria-hidden="true"
                                    className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${isPublic ? 'translate-x-5' : 'translate-x-0'}`}
                                />
                            </button>
                        </div>

                        {/* Icon Input */}
                        <div className="mb-6">
                            <label className="block text-sm font-medium text-gray-700 mb-2">Group Icon</label>
                            <div className="flex items-center gap-4">
                                <div className="relative h-20 w-20 rounded-xl bg-[var(--theme-primary-light)] overflow-hidden border border-dashed border-gray-300 group cursor-pointer hover:border-[var(--theme-primary)] transition-colors flex-shrink-0">
                                    {iconPreview ? (
                                        <img src={iconPreview} alt="Icon Preview" className="h-full w-full object-cover" />
                                    ) : (
                                        <div className="flex items-center justify-center h-full text-indigo-300 font-bold text-2xl">
                                            {currentName.substring(0, 1).toUpperCase()}
                                        </div>
                                    )}
                                    <input
                                        type="file"
                                        accept="image/*"
                                        onChange={handleIconChange}
                                        className="absolute inset-0 opacity-0 cursor-pointer"
                                        aria-label="Upload group icon"
                                    />
                                    <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors flex items-center justify-center pointer-events-none">
                                        <svg className="w-6 h-6 text-white opacity-0 group-hover:opacity-100 transition-opacity" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" /></svg>
                                    </div>
                                </div>
                                <div className="text-xs text-gray-500">
                                    <p>Recommended: Square image</p>
                                    <p>Click image to change.</p>
                                </div>
                            </div>
                        </div>

                    </div>

                    <div className="bg-gray-50 px-6 py-4 flex justify-end gap-3 rounded-b-2xl">
                        <button
                            type="button"
                            onClick={onClose}
                            className="px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
                            disabled={isSubmitting}
                        >
                            Cancel
                        </button>
                        <button
                            type="submit"
                            disabled={isSubmitting}
                            className="px-4 py-2 text-sm font-medium text-white bg-[var(--theme-primary)] hover:bg-[var(--theme-primary)]/90 rounded-lg shadow-sm transition-colors flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            {isSubmitting ? (
                                <>
                                    <svg className="animate-spin h-4 w-4 text-white" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                                    Saving...
                                </>
                            ) : (
                                'Save Changes'
                            )}
                        </button>
                    </div>
                </form>

                <div className="h-12 bg-transparent"></div>

                {showDangerZone ? (
                    <div className="px-6 pb-6 bg-red-50/30 animate-in slide-in-from-top-2 fade-in duration-200">
                        <DeleteGroupButton groupKeyword={groupKeyword} groupName={currentName} />
                        <button
                            onClick={() => setShowDangerZone(false)}
                            className="w-full mt-2 text-center text-xs text-gray-400 hover:text-gray-600 hover:underline"
                        >
                            Cancel and Hide
                        </button>
                    </div>
                ) : (
                    <div className="px-6 py-4 flex justify-center opacity-75 hover:opacity-100 transition-opacity">
                        <button
                            onClick={() => setShowDangerZone(true)}
                            className="text-xs font-bold text-gray-400 hover:text-red-600 px-4 py-2 rounded-lg transition-colors flex items-center gap-2"
                        >
                            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                            Delete Group
                        </button>
                    </div>
                )}
            </div>
        </div>,
        document.body
    );
}

