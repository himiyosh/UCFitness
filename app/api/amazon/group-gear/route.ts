export const runtime = 'edge';

import { auth } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';
import { NextRequest, NextResponse } from 'next/server';

import type { RecommendedItemRow } from '@/types/database';

/** `.select('..., users (username, image)')` の埋め込み結果の行 (to-one 関係) */
type GroupGearItemRow = Pick<
    RecommendedItemRow,
    'id' | 'asin' | 'title' | 'image_url' | 'affiliate_link' | 'user_id' | 'comment' | 'updated_at'
> & {
    users: { username: string | null; image: string | null } | null;
};

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

    const userId = session.user.id;
    const groupId = request.nextUrl.searchParams.get('groupId');
    if (!groupId) {
        return NextResponse.json({ error: 'groupId is required' }, { status: 400 });
    }

    // 🛡️ セキュリティ: リクエスト元がグループメンバーであることを確認（IDOR防止）
    const { data: membership } = await supabaseAdmin
        .from('group_members')
        .select('user_id')
        .eq('group_id', groupId)
        .eq('user_id', userId)
        .single();

    if (!membership) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
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
        .select('id, asin, title, image_url, affiliate_link, user_id, comment, updated_at, users (username, image)')
        .in('user_id', memberIds)
        .order('updated_at', { ascending: false })
        .limit(100)
        .returns<GroupGearItemRow[]>();

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
        users: { username: string; image: string | null; comment?: string | null }[];
    }>();

    for (const item of rawItems) {
        const existing = asinMap.get(item.asin);
        const user = item.users;
        const userInfo = user ? { username: user.username || 'User', image: user.image, comment: item.comment || null } : null;

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
