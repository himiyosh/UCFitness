import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { reportError } from '@/lib/errors';
import { supabaseAdmin } from '@/lib/supabase';
import { fetchProductTitle } from '@/lib/amazon-creators-api';

export const runtime = 'edge';
export const dynamic = 'force-dynamic';

// ============================================
// おすすめアイテム CRUD API
// POST   : アイテム追加
// PATCH  : コメント更新
// DELETE : アイテム削除
// ============================================

/** おすすめアイテムの最大登録数 */
const MAX_RECOMMENDED_ITEMS = 6;

/** コメントの最大文字数 */
const MAX_COMMENT_LENGTH = 100;

// --- POST: アイテム追加 ---
interface AddItemRequest {
    asin: string;
    title: string;
    imageUrl: string;
    affiliateLink: string;
    comment?: string;
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
        // コメントの長さチェック
        const comment = body.comment?.trim() || null;
        if (comment && comment.length > MAX_COMMENT_LENGTH) {
            return NextResponse.json(
                { error: `コメントは${MAX_COMMENT_LENGTH}文字以内です` },
                { status: 400 }
            );
        }

        // タイトルが空の場合、Amazon から取得を試みる
        let title = body.title || '';
        if (!title.trim()) {
            try {
                title = await fetchProductTitle(body.asin.toUpperCase());
            } catch {
                // タイトル取得失敗してもアイテム追加は続行
            }
        }

        // 画像URLがウィジェットURLの場合、高品質な直接URLへの取得を試みる
        let imageUrl = body.imageUrl || '';
        // ウィジェットURL は ws-fe.amazon-adsystem.com 経由でリダイレクトされるため、
        // そのまま保存しても表示は可能だが、直接URLの方が安定する

        const { data, error } = await supabaseAdmin
            .from('recommended_items')
            .upsert({
                user_id: userId,
                asin: body.asin.toUpperCase(),
                title,
                image_url: imageUrl,
                affiliate_link: body.affiliateLink,
                display_order: nextOrder,
                comment,
                updated_at: new Date().toISOString(),
            }, {
                onConflict: 'user_id,asin',
            })
            .select('id, user_id, asin, title, image_url, affiliate_link, display_order, comment, updated_at')
            .single();

        if (error) {
            reportError('[API] おすすめアイテム追加エラー', error);
            return NextResponse.json({ error: '保存に失敗しました' }, { status: 500 });
        }

        return NextResponse.json({ item: data, message: 'おすすめアイテムに追加しました' });
    } catch (error: unknown) {
        reportError('[API] おすすめアイテム追加エラー', error);
        return NextResponse.json({ error: '保存に失敗しました' }, { status: 500 });
    }
}

// --- PATCH: コメント更新 ---
export async function PATCH(request: Request) {
    const session = await auth();
    if (!session?.user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const userId = (session.user as { id: string }).id;

    try {
        const body: { id: string; comment: string | null } = await request.json();

        if (!body.id) {
            return NextResponse.json({ error: 'id が必要です' }, { status: 400 });
        }

        // コメントの長さチェック
        const comment = body.comment?.trim() || null;
        if (comment && comment.length > MAX_COMMENT_LENGTH) {
            return NextResponse.json(
                { error: `コメントは${MAX_COMMENT_LENGTH}文字以内です` },
                { status: 400 }
            );
        }

        const { data, error } = await supabaseAdmin
            .from('recommended_items')
            .update({
                comment,
                updated_at: new Date().toISOString(),
            })
            .eq('id', body.id)
            .eq('user_id', userId) // 本人のみ更新可能
            .select('id, user_id, asin, title, image_url, affiliate_link, display_order, comment, updated_at')
            .single();

        if (error) {
            reportError('[API] コメント更新エラー', error);
            return NextResponse.json({ error: '更新に失敗しました' }, { status: 500 });
        }

        return NextResponse.json({ item: data, message: 'コメントを更新しました' });
    } catch (error: unknown) {
        reportError('[API] コメント更新エラー', error);
        return NextResponse.json({ error: '更新に失敗しました' }, { status: 500 });
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
            reportError('[API] おすすめアイテム削除エラー', error);
            return NextResponse.json({ error: '削除に失敗しました' }, { status: 500 });
        }

        return NextResponse.json({ message: '削除しました' });
    } catch (error: unknown) {
        reportError('[API] おすすめアイテム削除エラー', error);
        return NextResponse.json({ error: '削除に失敗しました' }, { status: 500 });
    }
}
