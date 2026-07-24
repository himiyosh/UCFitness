export const runtime = 'edge';

export const dynamic = 'force-dynamic';

// Apple Touch Icon — 180×180 PNG（iOS PWAインストール用）
export const size = {
    width: 180,
    height: 180,
};
export const contentType = 'image/png';

// 静的PNGを正本にして、Edge Workerへresvg WASMを同梱しない。
export default function AppleIcon(): Response {
    return new Response(null, {
        status: 307,
        headers: {
            location: '/apple-touch-icon.png',
        },
    });
}
