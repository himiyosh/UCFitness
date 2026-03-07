'use client';

import { useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useRouter } from 'next/navigation';
import { updateProfileImage, uploadProfileImage } from '@/app/actions';
import { compressImage } from '@/lib/image-utils';

const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
const MAX_FILE_SIZE_MB = 5;
const MAX_FILE_SIZE = MAX_FILE_SIZE_MB * 1024 * 1024;

interface ProfileImageEditorProps {
    initialImage: string | null;
    isCustom: boolean;
    children?: React.ReactNode;
    onSuccess?: (newImageUrl: string | null) => void;
}

export default function ProfileImageEditor({ initialImage, isCustom, children, onSuccess }: ProfileImageEditorProps) {
    const [isOpen, setIsOpen] = useState(false);
    const [file, setFile] = useState<File | null>(null);
    const [previewUrl, setPreviewUrl] = useState<string | null>(initialImage || null);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [confirmingReset, setConfirmingReset] = useState(false);
    const router = useRouter();

    // Reset preview when reopening or props change
    useEffect(() => {
        if (isOpen) {
            setPreviewUrl(initialImage);
            setFile(null);
        }
    }, [isOpen, initialImage]);

    const handleFileChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            const selectedFile = e.target.files[0];

            // Validate file type
            if (!ALLOWED_IMAGE_TYPES.includes(selectedFile.type)) {
                setError('Please select a valid image file (JPEG, PNG, WebP, GIF).');
                e.target.value = '';
                return;
            }

            // Validate file size
            if (selectedFile.size > MAX_FILE_SIZE) {
                setError(`File size must be under ${MAX_FILE_SIZE_MB}MB.`);
                e.target.value = '';
                return;
            }

            setError(null);

            // Revoke previous object URL to prevent memory leaks
            if (previewUrl && previewUrl.startsWith('blob:')) {
                URL.revokeObjectURL(previewUrl);
            }

            setFile(selectedFile);
            setPreviewUrl(URL.createObjectURL(selectedFile));
        }
    }, [previewUrl]);

    // Cleanup object URLs on unmount
    useEffect(() => {
        return () => {
            if (previewUrl && previewUrl.startsWith('blob:')) {
                URL.revokeObjectURL(previewUrl);
            }
        };
    }, [previewUrl]);

    const handleSave = async () => {
        setIsLoading(true);
        try {
            if (file) {
                // Compress image before upload
                // Max width 500px, 0.8 JPEG quality
                const compressedFile = await compressImage(file, 500, 0.8);

                const formData = new FormData();
                formData.append('file', compressedFile);
                await uploadProfileImage(formData);
                setIsOpen(false);
                router.refresh();
                if (onSuccess) onSuccess(previewUrl);
            }
        } catch (_) {
            setError('Failed to update image. Please try again.');
        } finally {
            setIsLoading(false);
        }
    };

    const handleReset = useCallback(async () => {
        if (!confirmingReset) {
            setConfirmingReset(true);
            return;
        }
        setIsLoading(true);
        setError(null);
        try {
            await updateProfileImage(null);
            setIsOpen(false);
            setConfirmingReset(false);
            router.refresh();
            onSuccess?.(null);
        } catch (_) {
            setError('Failed to reset image. Please try again.');
        } finally {
            setIsLoading(false);
        }
    }, [confirmingReset, router, onSuccess]);

    return (
        <>
            {children ? (
                <div onClick={() => setIsOpen(true)}>{children}</div>
            ) : (
                <button
                    onClick={() => setIsOpen(true)}
                    className="absolute bottom-0 right-0 bg-white rounded-full p-1.5 shadow-md border border-gray-200 text-gray-500 hover:text-[var(--theme-primary)] transition-colors"
                    title="Change Profile Image"
                >
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                        <path d="M5.433 13.917l1.262-3.155A4 4 0 017.58 9.42l6.92-6.918a2.121 2.121 0 013 3l-6.92 6.918c-.383.383-.84.685-1.343.886l-3.154 1.262a.5.5 0 01-.65-.65z" />
                        <path d="M3.5 5.75c0-.69.56-1.25 1.25-1.25H10A.75.75 0 0010 3H4.75A2.75 2.75 0 002 5.75v9.5A2.75 2.75 0 004.75 18h9.5A2.75 2.75 0 0017 15.25V10a.75.75 0 00-1.5 0v5.25c0 .69-.56 1.25-1.25 1.25h-9.5c-.69 0-1.25-.56-1.25-1.25v-9.5z" />
                    </svg>
                </button>
            )}

            {isOpen && typeof document !== 'undefined' && createPortal(
                <div className="fixed inset-0 z-[99999] flex items-center justify-center bg-black/50 p-4">
                    <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6 relative" role="dialog" aria-modal="true" aria-label="Edit Profile Image">
                        <button
                            onClick={() => { setIsOpen(false); setError(null); setConfirmingReset(false); }}
                            className="absolute top-4 right-4 text-gray-400 hover:text-gray-600"
                            aria-label="Close"
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                            </svg>
                        </button>

                        <h3 className="text-xl font-bold text-gray-900 mb-4">Edit Profile Image</h3>

                        <div className="space-y-4">
                            <div>
                                <label htmlFor="profile-file-input" className="block text-sm font-medium text-gray-700 mb-1">Upload New Image</label>
                                <input
                                    id="profile-file-input"
                                    type="file"
                                    accept="image/*"
                                    onChange={handleFileChange}
                                    className="block w-full text-sm text-gray-500
                                        file:mr-4 file:py-2 file:px-4
                                        file:rounded-md file:border-0
                                        file:text-sm file:font-semibold
                                        file:bg-[var(--theme-primary-light)] file:text-[var(--theme-primary)]
                                        hover:file:bg-[var(--theme-primary-light)]"
                                />
                                <p className="text-xs text-gray-400 mt-1">Max {MAX_FILE_SIZE_MB}MB. JPEG, PNG, WebP, GIF.</p>
                                {error && (
                                    <p className="text-xs text-red-500 mt-1 font-medium" role="alert">{error}</p>
                                )}
                            </div>

                            {previewUrl && (
                                <div className="flex justify-center py-4 bg-gray-50 rounded-lg">
                                    <img src={previewUrl} alt="Preview" className="h-20 w-20 rounded-full object-cover border-2 border-white shadow-sm" onError={(e) => { e.currentTarget.style.display = 'none'; }} />
                                </div>
                            )}

                            <div className="flex gap-3 pt-4">
                                <button
                                    onClick={handleReset}
                                    disabled={isLoading || !isCustom}
                                    className={`flex-1 px-4 py-2 text-sm font-medium rounded-md disabled:opacity-50 disabled:cursor-not-allowed transition-colors ${confirmingReset ? 'text-white bg-red-600 hover:bg-red-700' : 'text-red-600 bg-red-50 hover:bg-red-100'}`}
                                >
                                    {confirmingReset ? 'Confirm Reset?' : 'Reset to Fitbit'}
                                </button>
                                <button
                                    onClick={handleSave}
                                    disabled={isLoading || !file}
                                    className="flex-1 px-4 py-2 text-sm font-medium text-white bg-[var(--theme-primary)] hover:bg-[var(--theme-primary)]/90 rounded-md disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    {isLoading ? 'Saving...' : 'Save & Close'}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>,
                document.body
            )}
        </>
    );
}
