import { describe, it, expect, vi, beforeEach } from 'vitest';
import { uploadProfileImage } from '@/app/actions';

// Mock dependencies
const mockUpload = vi.fn().mockResolvedValue({ data: { path: 'path' }, error: null });
const mockGetPublicUrl = vi.fn().mockReturnValue({ data: { publicUrl: 'https://example.com/image.png' } });
const mockUpdate = vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) });

// Mock auth
vi.mock('@/lib/auth', () => ({
    auth: vi.fn().mockResolvedValue({
        user: { id: 'user-123' }
    })
}));

// Mock supabaseAdmin
vi.mock('@/lib/supabase', () => ({
    supabaseAdmin: {
        storage: {
            from: vi.fn(() => ({
                upload: mockUpload,
                getPublicUrl: mockGetPublicUrl
            }))
        },
        from: vi.fn(() => ({
            update: mockUpdate,
            select: vi.fn(() => ({ eq: vi.fn(() => ({ single: vi.fn().mockResolvedValue({ data: {}, error: null }) })) })),
        }))
    }
}));

// Mock next/cache and next/headers
vi.mock('next/cache', () => ({
    revalidatePath: vi.fn(),
}));

vi.mock('next/headers', () => ({
    cookies: vi.fn(),
}));

// Mock lib/fitbit to avoid import issues
vi.mock('@/lib/fitbit', () => ({
    refreshFitbitToken: vi.fn(),
    getFitbitProfile: vi.fn(),
}));

describe('uploadProfileImage Security', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('should use extension from MIME type, ignoring filename extension', async () => {
        const formData = new FormData();
        // Create a File object simulating an attack: filename is .html, but MIME is image/png
        const file = new File(['<script>alert(1)</script>'], 'exploit.html', { type: 'image/png' });
        formData.append('file', file);

        await uploadProfileImage(formData);

        // Check the arguments passed to upload
        // First arg is path. It should end with .png (secure), NOT .html (insecure)
        const uploadCall = mockUpload.mock.calls[0];
        const filePath = uploadCall[0];

        console.log('Upload Path:', filePath);

        // Expectation for SECURE behavior:
        expect(filePath).toMatch(/\.png$/);
        expect(filePath).not.toMatch(/\.html$/);
    });
});
