export const runtime = 'edge';

import { auth } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { NextRequest, NextResponse } from 'next/server';

// ============================================
// グループメンバーの愛用ギア API
// メンバーの recommended_items を ASIN 別に集計して返却
// ============================================

export async function GET(request: NextRequest) {
    // 🛡️ セキュリティ: 認証チェック（グループメンバー情報を含むため）
    const session = await auth();
    if (!session?.user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const groupId = request.nextUrl.searchParams.get('groupId');
    if (!groupId) {
        return NextResponse.json({ error: 'groupId is required' }, { status: 400 });
    }

    // グループメンバーの user_id 一覧を取得
    const { data: members } = await supabaseAdmin
        .from('group_members')
        .select('user_id')
        .eq('group_id', groupId);

    if (!members || members.length === 0) {
        return NextResponse.json({ items: [] });
    }

    const memberIds = members.map(m => m.user_id);

    // メンバーの recommended_items を取得（ユーザー情報付き）
    const { data: rawItems } = await supabaseAdmin
        .from('recommended_items')
        .select('asin, title, image_url, affiliate_link, user_id, users (username, image)')
        .in('user_id', memberIds)
        .order('updated_at', { ascending: false })
        .limit(100);

    if (!rawItems || rawItems.length === 0) {
        return NextResponse.json({ items: [] });
    }

    // ASIN 別に集計
    const partnerTag = process.env.AMAZON_PARTNER_TAG || 'studio344-22';
    const asinMap = new Map<string, {
        asin: string;
        title: string;
        image_url: string;
        affiliate_link: string;
        count: number;
        users: { username: string; image: string | null }[];
    }>();

    for (const item of rawItems) {
        const existing = asinMap.get(item.asin);
        const user = item.users as unknown as { username: string; image: string | null } | null;
        const userInfo = user ? { username: user.username || 'User', image: user.image } : null;

        if (existing) {
            existing.count++;
            if (userInfo && existing.users.length < 3) {
                existing.users.push(userInfo);
            }
        } else {
            // パートナータグ置換
            let link = item.affiliate_link;
            link = link.replace(/tag=[^&]+/, `tag=${partnerTag}`);

            asinMap.set(item.asin, {
                asin: item.asin,
                title: item.title,
                image_url: item.image_url,
                affiliate_link: link,
                count: 1,
                users: userInfo ? [userInfo] : [],
            });
        }
    }

    // 登録数順でソート、上位8件
    const items = Array.from(asinMap.values())
        .sort((a, b) => b.count - a.count)
        .slice(0, 8);

    return NextResponse.json(
        { items },
        {
            headers: {
                'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600',
            },
        }
    );
}
