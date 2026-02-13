import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { supabaseAdmin } from '@/lib/supabase';

export const runtime = 'edge';
export const dynamic = 'force-dynamic';

// ============================================
// おすすめアイテム CRUD API
// POST   : アイテム追加
// DELETE : アイテム削除
// ============================================

/** おすすめアイテムの最大登録数 */
const MAX_RECOMMENDED_ITEMS = 6;

// --- POST: アイテム追加 ---
interface AddItemRequest {
    asin: string;
    title: string;
    imageUrl: string;
    affiliateLink: string;
}

export async function POST(request: Request) {
    const session = await auth();
    if (!session?.user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const userId = (session.user as { id: string }).id;

    try {
        const body: AddItemRequest = await request.json();

        // バリデーション
        if (!body.asin || !/^[A-Z0-9]{10}$/i.test(body.asin)) {
            return NextResponse.json({ error: '無効なASINです' }, { status: 400 });
        }
        if (!body.affiliateLink) {
            return NextResponse.json({ error: 'アフィリエイトリンクが必要です' }, { status: 400 });
        }

        // 現在の登録数チェック
        const { count } = await supabaseAdmin
            .from('recommended_items')
            .select('id', { count: 'exact', head: true })
            .eq('user_id', userId);

        if (count !== null && count >= MAX_RECOMMENDED_ITEMS) {
            return NextResponse.json(
                { error: `おすすめアイテムは最大${MAX_RECOMMENDED_ITEMS}件です`, code: 'MAX_ITEMS' },
                { status: 409 }
            );
        }

        // 次の display_order を計算
        const { data: maxOrder } = await supabaseAdmin
            .from('recommended_items')
            .select('display_order')
            .eq('user_id', userId)
            .order('display_order', { ascending: false })
            .limit(1)
            .single();

        const nextOrder = (maxOrder?.display_order ?? -1) + 1;

        // 挿入（重複ASIN は conflict で上書き）
        const { data, error } = await supabaseAdmin
            .from('recommended_items')
            .upsert({
                user_id: userId,
                asin: body.asin.toUpperCase(),
                title: body.title || '',
                image_url: body.imageUrl,
                affiliate_link: body.affiliateLink,
                display_order: nextOrder,
                updated_at: new Date().toISOString(),
            }, {
                onConflict: 'user_id,asin',
            })
            .select()
            .single();

        if (error) {
            console.error('[API] おすすめアイテム追加エラー:', error);
            return NextResponse.json({ error: '保存に失敗しました' }, { status: 500 });
        }

        return NextResponse.json({ item: data, message: 'おすすめアイテムに追加しました' });
    } catch (error) {
        console.error('[API] おすすめアイテム追加エラー:', error);
        const message = error instanceof Error ? error.message : 'Unknown error';
        return NextResponse.json({ error: `保存に失敗しました: ${message}` }, { status: 500 });
    }
}

// --- DELETE: アイテム削除 ---
export async function DELETE(request: Request) {
    const session = await auth();
    if (!session?.user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const userId = (session.user as { id: string }).id;

    try {
        const { searchParams } = new URL(request.url);
        const itemId = searchParams.get('id');

        if (!itemId) {
            return NextResponse.json({ error: 'id パラメータが必要です' }, { status: 400 });
        }

        const { error } = await supabaseAdmin
            .from('recommended_items')
            .delete()
            .eq('id', itemId)
            .eq('user_id', userId); // 本人のみ削除可能

        if (error) {
            console.error('[API] おすすめアイテム削除エラー:', error);
            return NextResponse.json({ error: '削除に失敗しました' }, { status: 500 });
        }

        return NextResponse.json({ message: '削除しました' });
    } catch (error) {
        console.error('[API] おすすめアイテム削除エラー:', error);
        return NextResponse.json({ error: '削除に失敗しました' }, { status: 500 });
    }
}
