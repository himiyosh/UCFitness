const JPEG_SIGNATURE = [0xff, 0xd8, 0xff] as const;
const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47] as const;
const GIF_87A_SIGNATURE = [0x47, 0x49, 0x46, 0x38, 0x37, 0x61] as const;
const GIF_89A_SIGNATURE = [0x47, 0x49, 0x46, 0x38, 0x39, 0x61] as const;

function startsWith(bytes: Uint8Array, signature: readonly number[]): boolean {
    return signature.every((value, index) => bytes[index] === value);
}

function isWebp(bytes: Uint8Array): boolean {
    return bytes.length >= 12
        && bytes[0] === 0x52
        && bytes[1] === 0x49
        && bytes[2] === 0x46
        && bytes[3] === 0x46
        && bytes[8] === 0x57
        && bytes[9] === 0x45
        && bytes[10] === 0x42
        && bytes[11] === 0x50;
}

export function hasValidImageSignature(bytes: Uint8Array, mimeType: string): boolean {
    switch (mimeType) {
        case 'image/jpeg':
            return startsWith(bytes, JPEG_SIGNATURE);
        case 'image/png':
            return startsWith(bytes, PNG_SIGNATURE);
        case 'image/webp':
            return isWebp(bytes);
        case 'image/gif':
            return startsWith(bytes, GIF_87A_SIGNATURE) || startsWith(bytes, GIF_89A_SIGNATURE);
        default:
            return false;
    }
}
