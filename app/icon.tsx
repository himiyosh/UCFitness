import { ImageResponse } from 'next/og';

// Image metadata
export const size = {
    width: 512,
    height: 512,
};
export const contentType = 'image/png';

// ファビコン生成 — フィットネスアプリらしいランナー+炎のデザイン
export default function Icon() {
    return new ImageResponse(
        (
            <div
                style={{
                    width: '100%',
                    height: '100%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    background: 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 50%, #a855f7 100%)',
                    borderRadius: '22%',
                    position: 'relative',
                }}
            >
                {/* 背景のアクセント円 */}
                <div
                    style={{
                        position: 'absolute',
                        width: '380px',
                        height: '380px',
                        borderRadius: '50%',
                        background: 'rgba(255,255,255,0.08)',
                        display: 'flex',
                    }}
                />
                {/* UCF テキスト */}
                <div
                    style={{
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '0px',
                    }}
                >
                    <span
                        style={{
                            fontSize: '200px',
                            fontWeight: 900,
                            color: 'white',
                            letterSpacing: '-8px',
                            lineHeight: '1',
                            textShadow: '0 4px 20px rgba(0,0,0,0.2)',
                        }}
                    >
                        UC
                    </span>
                    <span
                        style={{
                            fontSize: '80px',
                            fontWeight: 800,
                            color: 'rgba(255,255,255,0.85)',
                            letterSpacing: '16px',
                            lineHeight: '1',
                            marginTop: '-10px',
                        }}
                    >
                        FIT
                    </span>
                </div>
            </div>
        ),
        {
            ...size,
        }
    );
}
