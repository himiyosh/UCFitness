export async function compressImage(file: File, maxWidth: number = 800, quality: number = 0.8): Promise<File> {
    // 入力バリデーション
    if (maxWidth <= 0) {
        throw new Error(`maxWidth must be positive, got ${maxWidth}`);
    }
    const clampedQuality = Math.max(0, Math.min(1, quality));

    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = (event) => {
            const img = new Image();
            img.src = event.target?.result as string;
            img.onload = () => {
                const canvas = document.createElement('canvas');
                let width = img.width;
                let height = img.height;

                if (width > maxWidth) {
                    height = (height * maxWidth) / width;
                    width = maxWidth;
                }

                // 最小1pxを保証
                width = Math.max(1, Math.round(width));
                height = Math.max(1, Math.round(height));

                canvas.width = width;
                canvas.height = height;
                const ctx = canvas.getContext('2d');
                if (!ctx) {
                    reject(new Error('Failed to get canvas context'));
                    return;
                }

                ctx.drawImage(img, 0, 0, width, height);

                canvas.toBlob((blob) => {
                    if (!blob) {
                        reject(new Error('Failed to compress image'));
                        return;
                    }
                    const compressedFile = new File([blob], file.name, {
                        type: 'image/jpeg', // Force JPEG for better compression/consistent type
                        lastModified: Date.now(),
                    });
                    resolve(compressedFile);
                }, 'image/jpeg', clampedQuality);
            };
            img.onerror = () => reject(new Error('Failed to load image for compression'));
        };
        reader.onerror = () => reject(new Error('Failed to read file'));
    });
}
