export const runtime = 'edge';

export const dynamic = 'force-dynamic';

// Image metadata — ブラウザタブ用アイコン
export const size = {
    width: 192,
    height: 192,
};
export const contentType = 'image/png';

// 静的PNGを正本にして、Edge Workerへresvg WASMを同梱しない。
export default function Icon(): Response {
    return new Response(null, {
        status: 307,
        headers: {
            location: '/icon-192.png',
        },
    });
}
