'use client';

import { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useRouter } from 'next/navigation';

interface Props {
    groupId: string;
    groupKeyword: string; // Used for API targeting
    currentName: string;
    currentIcon?: string;
    currentHeader?: string;
    isVisible: boolean;
    isOpen: boolean;
    onClose: () => void;
}

export default function EditGroupModal({ groupId, groupKeyword, currentName, currentIcon, currentHeader, isVisible, isOpen, onClose }: Props) {
    const router = useRouter();
    const [name, setName] = useState(currentName);
    const [isPublic, setIsPublic] = useState(isVisible);
    const [iconFile, setIconFile] = useState<File | null>(null);
    const [headerFile, setHeaderFile] = useState<File | null>(null);
    const [isSubmitting, setIsSubmitting] = useState(false);

    // Previews
    const [iconPreview, setIconPreview] = useState(currentIcon);
    const [headerPreview, setHeaderPreview] = useState(currentHeader);

    const handleIconChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            const file = e.target.files[0];
            setIconFile(file);
            setIconPreview(URL.createObjectURL(file));
        }
    };

    const handleHeaderChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            const file = e.target.files[0];
            setHeaderFile(file);
            setHeaderPreview(URL.createObjectURL(file));
        }
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsSubmitting(true);

        try {
            let uploadedIconUrl = currentIcon;
            let uploadedHeaderUrl = currentHeader;

            // 1. Upload Icon if changed
            if (iconFile) {
                const formData = new FormData();
                formData.append('file', iconFile);
                formData.append('groupId', groupId);
                formData.append('type', 'icon');

                const res = await fetch('/api/upload/group', {
                    method: 'POST',
                    body: formData,
                });
                const data = await res.json();
                if (!res.ok) throw new Error(data.error || 'Icon upload failed');
                uploadedIconUrl = data.publicUrl;
            }

            // 2. Upload Header if changed
            if (headerFile) {
                const formData = new FormData();
                formData.append('file', headerFile);
                formData.append('groupId', groupId);
                formData.append('type', 'header');

                const res = await fetch('/api/upload/group', {
                    method: 'POST',
                    body: formData,
                });
                const data = await res.json();
                if (!res.ok) throw new Error(data.error || 'Header upload failed');
                uploadedHeaderUrl = data.publicUrl;
            }

            // 3. Update Group Metadata
            const res = await fetch('/api/user/group', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    action: 'update_metadata',
                    keyword: groupKeyword,
                    name: name,
                    image_url: uploadedIconUrl,
                    header_image_url: uploadedHeaderUrl,
                    is_public: isPublic
                }),
            });

            if (!res.ok) throw new Error('Failed to update group');

            router.refresh();
            onClose();
        } catch (error) {
            console.error(error);
            alert('Failed to update group settings. Please try again.');
        } finally {
            setIsSubmitting(false);
        }
    };

    const [mounted, setMounted] = useState(false);

    useEffect(() => {
        setMounted(true);
    }, []);

    if (!mounted || !isOpen) return null;

    return createPortal(
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 sm:p-6 isolate">
            <div className="fixed inset-0 bg-black/60 backdrop-blur-sm transition-opacity" onClick={onClose} />

            <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-lg overflow-hidden animate-fade-in z-50 max-h-[90vh] overflow-y-auto">
                <form onSubmit={handleSubmit}>
                    <div className="p-6">
                        <h2 className="text-xl font-bold text-gray-900 mb-6">Edit Group Details</h2>

                        {/* Name Input */}
                        <div className="mb-6">
                            <label className="block text-sm font-medium text-gray-700 mb-2">Group Name</label>
                            <input
                                type="text"
                                value={name}
                                onChange={(e) => setName(e.target.value)}
                                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none text-gray-900"
                                required
                            />
                        </div>

                        {/* Header Image Input */}
                        <div className="mb-6">
                            <label className="block text-sm font-medium text-gray-700 mb-2">Header Image</label>
                            <div className="relative h-32 w-full rounded-xl bg-gray-100 overflow-hidden border border-dashed border-gray-300 group cursor-pointer hover:border-indigo-500 transition-colors">
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
                                className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-indigo-600 focus:ring-offset-2 ${isPublic ? 'bg-indigo-600' : 'bg-gray-200'}`}
                                role="switch"
                                aria-checked={isPublic}
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
                                <div className="relative h-20 w-20 rounded-xl bg-indigo-100 overflow-hidden border border-dashed border-gray-300 group cursor-pointer hover:border-indigo-500 transition-colors flex-shrink-0">
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
                            className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg shadow-sm transition-colors flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
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
            </div>
        </div>,
        document.body
    );
}
