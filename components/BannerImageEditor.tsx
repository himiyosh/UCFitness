'use client';

import { useState } from 'react';
import { createPortal } from 'react-dom';
import { useRouter } from 'next/navigation';

import { compressImage } from '@/lib/image-utils';

interface BannerImageEditorProps {
    currentBanner: string | null;
    children?: React.ReactNode;
}

export default function BannerImageEditor({ currentBanner, children }: BannerImageEditorProps) {
    const [isOpen, setIsOpen] = useState(false);
    const [file, setFile] = useState<File | null>(null);
    const [previewUrl, setPreviewUrl] = useState<string | null>(currentBanner || null);
    const [isLoading, setIsLoading] = useState(false);
    const router = useRouter();

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            const selectedFile = e.target.files[0];
            setFile(selectedFile);
            setPreviewUrl(URL.createObjectURL(selectedFile));
        }
    };

    const handleSave = async () => {
        setIsLoading(true);
        try {
            if (file) {
                // Compress image before upload
                // Max width 1200px (larger for banner), 0.8 JPEG quality
                const compressedFile = await compressImage(file, 1200, 0.8);

                const formData = new FormData();
                formData.append('file', compressedFile);

                const res = await fetch('/api/user/banner', {
                    method: 'POST',
                    body: formData,
                });

                if (!res.ok) {
                    throw new Error('Failed to upload banner');
                }

                setIsOpen(false);
                router.refresh();
            }
        } catch (error) {
            console.error(error);
            alert("Failed to update banner");
        } finally {
            setIsLoading(false);
        }
    };

    // Note: No reset functionality for now as we don't have a specific "default banner" source other than null/gradients
    // If we want to allow removing the banner, we could add a "Remove" button that sets banner_url to null.

    return (
        <>
            {children ? (
                <div onClick={() => setIsOpen(true)}>{children}</div>
            ) : (
                <button
                    onClick={() => setIsOpen(true)}
                    className="text-indigo-600 font-medium text-sm hover:underline"
                >
                    Change Banner
                </button>
            )}

            {isOpen && typeof document !== 'undefined' && createPortal(
                <div className="fixed inset-0 z-[99999] flex items-center justify-center bg-black/50 p-4">
                    <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6 relative">
                        <button
                            onClick={() => setIsOpen(false)}
                            className="absolute top-4 right-4 text-gray-400 hover:text-gray-600"
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-6 h-6">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                            </svg>
                        </button>

                        <h3 className="text-xl font-bold text-gray-900 mb-4">Edit Profile Banner</h3>

                        <div className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Upload New Banner</label>
                                <input
                                    type="file"
                                    accept="image/*"
                                    onChange={handleFileChange}
                                    className="block w-full text-sm text-gray-500
                                        file:mr-4 file:py-2 file:px-4
                                        file:rounded-md file:border-0
                                        file:text-sm file:font-semibold
                                        file:bg-indigo-50 file:text-indigo-700
                                        hover:file:bg-indigo-100"
                                />
                                <p className="text-xs text-gray-400 mt-1">Recommended size: 1200x300px (approx 4:1 ratio)</p>
                            </div>

                            <div className="flex justify-center py-4 bg-gray-50 rounded-lg overflow-hidden">
                                {previewUrl ? (
                                    <div className="w-full h-32 relative bg-gray-200">
                                        <img
                                            src={previewUrl}
                                            alt="Preview"
                                            className="absolute inset-0 w-full h-full object-cover"
                                            onError={(e) => (e.currentTarget.src = 'https://via.placeholder.com/600x150?text=Banner')}
                                        />
                                    </div>
                                ) : (
                                    <div className="w-full h-32 flex items-center justify-center text-gray-400">
                                        No Image Selected
                                    </div>
                                )}
                            </div>

                            <div className="flex gap-3 pt-4 justify-end">
                                <button
                                    onClick={() => setIsOpen(false)}
                                    className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={handleSave}
                                    disabled={isLoading || !file}
                                    className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 rounded-md disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    {isLoading ? 'Saving...' : 'Save Banner'}
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
