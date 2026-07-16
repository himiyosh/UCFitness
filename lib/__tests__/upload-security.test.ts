import { describe, it, expect, vi, beforeEach } from 'vitest';
import { uploadBannerImage, uploadProfileImage } from '@/app/actions';
import { POST } from '@/app/api/upload/group/route';

const {
  mockSupabase,
  mockFrom,
  mockSelect,
  mockEq,
  mockSingle,
  mockStorage,
  mockStorageFrom,
  mockUpload,
  mockGetPublicUrl
} = vi.hoisted(() => {
    const mockSelect = vi.fn();
    const mockEq = vi.fn();
    const mockSingle = vi.fn();
    const mockFrom = vi.fn();

    // Storage mocks
    const mockUpload = vi.fn();
    const mockGetPublicUrl = vi.fn();
    const mockStorageFrom = vi.fn();
    const mockStorage = {
        from: mockStorageFrom
    };

    const mockSupabase = {
        from: mockFrom,
        storage: mockStorage
    };

    return {
        mockSupabase,
        mockFrom,
        mockSelect,
        mockEq,
        mockSingle,
        mockStorage,
        mockStorageFrom,
        mockUpload,
        mockGetPublicUrl
    };
});

vi.mock('@/lib/supabase', () => ({
    supabaseAdmin: mockSupabase
}));

vi.mock('@/lib/auth', () => ({
    auth: vi.fn().mockResolvedValue({ user: { id: 'user-id' } })
}));

vi.mock('@/lib/api/fitbit', () => ({
    getFitbitProfile: vi.fn(),
    refreshFitbitToken: vi.fn(),
}));

vi.mock('next/cache', () => ({
    revalidatePath: vi.fn(),
}));

vi.mock('next/server', () => ({
    NextResponse: {
        json: vi.fn(<T extends object>(data: T, options?: { status?: number }) => ({
            status: options?.status || 200,
            json: async () => data,
            ...data
        }))
    }
}));

describe('POST /api/upload/group', () => {
    beforeEach(() => {
        vi.clearAllMocks();

        // DB Mocks for ownership check
        // .from('group_members').select('role').eq('group_id', groupId).eq('user_id', userId).single()
        mockFrom.mockReturnValue({ select: mockSelect });
        mockSelect.mockReturnValue({ eq: mockEq });
        mockEq.mockReturnValue({ eq: mockEq, single: mockSingle }); // Handle chaining

        // Ensure the chain works correctly
        // first eq returns obj with eq
        // second eq returns obj with single

        // More robust mocking for chained calls
        const chain = {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            single: mockSingle
        };
        mockFrom.mockReturnValue(chain);

        mockSingle.mockResolvedValue({ data: { role: 'OWNER' }, error: null });

        // Storage Mocks
        mockStorageFrom.mockReturnValue({ upload: mockUpload, getPublicUrl: mockGetPublicUrl });
        mockUpload.mockResolvedValue({ data: { path: 'path' }, error: null });
        mockGetPublicUrl.mockReturnValue({ data: { publicUrl: 'http://example.com/image.png' } });
    });

    it('should use extension from MIME type instead of filename (SECURITY FIX VERIFIED)', async () => {
        const formData = new FormData();
        // Create a file that claims to be an image but has a .php extension
        const file = new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47])], 'malicious.php', { type: 'image/png' });

        formData.append('file', file);
        formData.append('groupId', '12345678-1234-1234-1234-123456789012');
        formData.append('type', 'icon');

        const req = new Request('http://localhost:3000/api/upload/group', {
            method: 'POST',
            body: formData,
        });

        await POST(req);

        // Expect upload to be called with a path ending in .png because we now ignore the user provided extension
        expect(mockUpload).toHaveBeenCalledWith(
            expect.stringMatching(/\.png$/), // Expecting .png extension (from MIME type)
            expect.any(Uint8Array),
            expect.objectContaining({
                contentType: 'image/png'
            })
        );
    });
});

describe('プロフィール画像Server Action', () => {
    beforeEach(() => {
        vi.clearAllMocks();

        mockFrom.mockImplementation((table: string) => {
            if (table === 'users') {
                return {
                    update: vi.fn(() => ({
                        eq: vi.fn().mockResolvedValue({ error: null }),
                    })),
                };
            }
            return {};
        });
        mockStorageFrom.mockReturnValue({
            upload: mockUpload,
            getPublicUrl: mockGetPublicUrl,
        });
        mockUpload.mockResolvedValue({ data: { path: 'path' }, error: null });
        mockGetPublicUrl.mockReturnValue({
            data: { publicUrl: 'https://example.com/image' },
        });
    });

    it.each([
        ['image/jpeg', 'avatar.png', /\.jpg$/],
        ['image/png', 'avatar.jpg', /\.png$/],
        ['image/webp', 'avatar.gif', /\.webp$/],
        ['image/gif', 'avatar.webp', /\.gif$/],
    ])('uploadProfileImage_%sの場合_MIME由来の拡張子とcontentTypeを使用する', async (
        mimeType,
        originalName,
        expectedExtension,
    ) => {
        const formData = new FormData();
        formData.append('file', new File(['image'], originalName, { type: mimeType }));

        await uploadProfileImage(formData);

        expect(mockUpload).toHaveBeenCalledWith(
            expect.stringMatching(expectedExtension),
            expect.any(File),
            expect.objectContaining({
                contentType: mimeType,
            }),
        );
    });

    it('uploadBannerImage_WebPをJPEG名で受けた場合_MIME由来の拡張子とcontentTypeを使用する', async () => {
        const formData = new FormData();
        formData.append('file', new File(['image'], 'banner.jpg', { type: 'image/webp' }));

        await uploadBannerImage(formData);

        expect(mockUpload).toHaveBeenCalledWith(
            expect.stringMatching(/\.webp$/),
            expect.any(File),
            expect.objectContaining({
                contentType: 'image/webp',
            }),
        );
    });
});
