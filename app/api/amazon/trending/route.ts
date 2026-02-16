import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { reportError } from '@/lib/errors';

export const runtime = 'edge';
export const dynamic = 'force-dynamic';

// ============================================
// コミュニティ人気アイテム API
// 全ユーザーのおすすめアイテムから重複排除し、
// 登録人数の多い順に返す（最大12件）
// ============================================

export async function GET() {
    try {
        // 全ユーザーのおすすめアイテムを取得
        const { data, error } = await supabaseAdmin
            .from('recommended_items')
            .select('asin, title, image_url, affiliate_link, comment, user_id, users!inner(username, image)')
            .order('updated_at', { ascending: false })
            .limit(200);

        if (error) {
            reportError('[API] トレンドアイテム取得エラー', error);
            return NextResponse.json({ items: [] });
        }

        if (!data || data.length === 0) {
            return NextResponse.json({ items: [] });
        }

        // ASIN ごとに集計（登録人数カウント + 最新のタイトル/画像を使用）
        const asinMap = new Map<string, {
            asin: string;
            title: string;
            image_url: string;
            affiliate_link: string;
            count: number;
            users: { username: string; image: string | null; comment?: string | null }[];
        }>();

        const currentTag = process.env.AMAZON_PARTNER_TAG || 'studio344-22';

        for (const item of data) {
            const existing = asinMap.get(item.asin);
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const user = item.users as any;
            if (existing) {
                existing.count += 1;
                if (user?.username && existing.users.length < 3) {
                    existing.users.push({ username: user.username, image: user.image, comment: item.comment || null });
                }
            } else {
                asinMap.set(item.asin, {
                    asin: item.asin,
                    title: item.title,
                    image_url: item.image_url.replace(/tag=[^&]+/, `tag=${currentTag}`),
                    affiliate_link: item.affiliate_link.replace(/tag=[^&]+/, `tag=${currentTag}`),
                    count: 1,
                    users: user?.username ? [{ username: user.username, image: user.image, comment: item.comment || null }] : [],
                });
            }
        }

        // 登録人数の多い順にソートし、最大12件返す
        const trending = Array.from(asinMap.values())
            .sort((a, b) => b.count - a.count)
            .slice(0, 12);

        return NextResponse.json({
            items: trending,
        }, {
            headers: {
                // 5分間キャッシュ
                'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600',
            },
        });
    } catch (error: unknown) {
        reportError('[API] トレンドアイテム取得エラー', error);
        return NextResponse.json({ items: [] });
    }
}
