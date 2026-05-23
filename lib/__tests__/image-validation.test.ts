import { describe, expect, it } from 'vitest';

import { hasValidImageSignature } from '@/lib/image-validation';

describe('hasValidImageSignature', () => {
    it('accepts matching image signatures', () => {
        expect(hasValidImageSignature(new Uint8Array([0xff, 0xd8, 0xff, 0x00]), 'image/jpeg')).toBe(true);
        expect(hasValidImageSignature(new Uint8Array([0x89, 0x50, 0x4e, 0x47]), 'image/png')).toBe(true);
        expect(hasValidImageSignature(new Uint8Array([0x47, 0x49, 0x46, 0x38, 0x39, 0x61]), 'image/gif')).toBe(true);
        expect(hasValidImageSignature(new Uint8Array([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50]), 'image/webp')).toBe(true);
    });

    it('rejects mismatched signatures', () => {
        expect(hasValidImageSignature(new Uint8Array([0x3c, 0x73, 0x76, 0x67]), 'image/png')).toBe(false);
    });
});
