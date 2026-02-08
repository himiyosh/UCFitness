import { supabaseAdmin } from './supabase';
import { deductBalance, getInvestorRank, getCoinBalance, INVESTOR_RANKS, type InvestorRank } from './coin-service';

export const dynamic = 'force-dynamic';

// ============================================
// UCショップ サービス
// プロフィールカスタマイズアイテムの購入・装備管理
// ============================================

// --- 型定義 ---

export type ShopCategory = 'ICON_FRAME' | 'TITLE' | 'THEME_COLOR';

export interface ShopItem {
    id: string;
    category: ShopCategory;
    item_code: string;
    name_en: string;
    name_ja: string;
    description_en: string;
    description_ja: string;
    price: number;
    rank_required: InvestorRank;
    preview_value: string;
    is_active: boolean;
    sort_order: number;
    created_at: string;
}

export interface UserItem {
    id: string;
    user_id: string;
    item_id: string;
    purchased_at: string;
    is_equipped: boolean;
    shop_items: ShopItem;
}

export interface EquippedItems {
    ICON_FRAME: (UserItem & { shop_items: ShopItem }) | null;
    TITLE: (UserItem & { shop_items: ShopItem }) | null;
    THEME_COLOR: (UserItem & { shop_items: ShopItem }) | null;
}

export interface PurchaseResult {
    success: boolean;
    error?: 'already_owned' | 'insufficient_balance' | 'rank_too_low' | 'item_not_found' | 'item_inactive' | 'unknown';
    userItem?: UserItem;
    newBalance?: number;
}

// --- ランク比較ユーティリティ ---

const RANK_ORDER: Record<string, number> = {
    BEGINNER: 0,
    BUSINESS: 1,
    FUND_MANAGER: 2,
    DIAMOND: 3,
    TYCOON: 4,
};

/** ユーザーのランクがアイテム要求ランク以上かチェック */
function meetsRankRequirement(userRank: string, requiredRank: string): boolean {
    return (RANK_ORDER[userRank] ?? 0) >= (RANK_ORDER[requiredRank] ?? 0);
}

// ============================================
// ショップアイテム取得
// ============================================

/** 全アイテムを取得（カテゴリフィルタ可、is_active=false は Coming Soon 表示用） */
export async function getShopItems(category?: ShopCategory): Promise<ShopItem[]> {
    let query = supabaseAdmin
        .from('shop_items')
        .select('*')
        .order('is_active', { ascending: false })
        .order('price', { ascending: true })
        .order('sort_order', { ascending: true });

    if (category) {
        query = query.eq('category', category);
    }

    const { data, error } = await query;
    if (error) {
        console.error('getShopItems error:', error);
        return [];
    }
    return data as ShopItem[];
}

/** 特定アイテムを取得 */
export async function getShopItem(itemId: string): Promise<ShopItem | null> {
    const { data, error } = await supabaseAdmin
        .from('shop_items')
        .select('*')
        .eq('id', itemId)
        .single();

    if (error) {
        console.error('getShopItem error:', error);
        return null;
    }
    return data as ShopItem;
}

// ============================================
// ユーザー所持アイテム
// ============================================

/** ユーザーの全所持アイテムを取得 */
export async function getUserItems(userId: string): Promise<UserItem[]> {
    const { data, error } = await supabaseAdmin
        .from('user_items')
        .select('*, shop_items(*)')
        .eq('user_id', userId)
        .order('purchased_at', { ascending: false });

    if (error) {
        console.error('getUserItems error:', error);
        return [];
    }
    return data as UserItem[];
}

/** ユーザーが特定アイテムを所持しているかチェック */
export async function userOwnsItem(userId: string, itemId: string): Promise<boolean> {
    const { data, error } = await supabaseAdmin
        .from('user_items')
        .select('id')
        .eq('user_id', userId)
        .eq('item_id', itemId)
        .maybeSingle();

    if (error) {
        console.error('userOwnsItem error:', error);
        return false;
    }
    return data !== null;
}

/** ユーザーの装備中アイテムを取得 */
export async function getEquippedItems(userId: string): Promise<EquippedItems> {
    const { data, error } = await supabaseAdmin
        .from('user_items')
        .select('*, shop_items(*)')
        .eq('user_id', userId)
        .eq('is_equipped', true);

    if (error) {
        console.error('getEquippedItems error:', error);
        return { ICON_FRAME: null, TITLE: null, THEME_COLOR: null };
    }

    const equipped: EquippedItems = { ICON_FRAME: null, TITLE: null, THEME_COLOR: null };
    for (const item of (data as UserItem[])) {
        const category = item.shop_items?.category as ShopCategory;
        if (category && category in equipped) {
            equipped[category] = item as UserItem & { shop_items: ShopItem };
        }
    }
    return equipped;
}

// ============================================
// 購入処理
// ============================================

/** アイテムを購入する */
export async function purchaseItem(userId: string, itemId: string): Promise<PurchaseResult> {
    // 1. アイテム存在チェック
    const item = await getShopItem(itemId);
    if (!item) {
        return { success: false, error: 'item_not_found' };
    }
    if (!item.is_active) {
        return { success: false, error: 'item_inactive' };
    }

    // 2. 重複購入チェック
    const alreadyOwned = await userOwnsItem(userId, itemId);
    if (alreadyOwned) {
        return { success: false, error: 'already_owned' };
    }

    // 3. ランクチェック
    const balance = await getCoinBalance(userId);
    if (!balance) {
        return { success: false, error: 'insufficient_balance' };
    }
    const userRank = getInvestorRank(balance.total_balance);
    if (!meetsRankRequirement(userRank.rank, item.rank_required)) {
        return { success: false, error: 'rank_too_low' };
    }

    // 4. UC 引き落とし（べき等キー: purchase_{userId}_{itemId}）
    const idempotencyKey = `purchase_${userId}_${itemId}`;
    const deductResult = await deductBalance(
        userId,
        item.price,
        'PURCHASE',
        `Shop: ${item.name_en} / ${item.name_ja}`,
        idempotencyKey,
    );

    if (!deductResult.success) {
        if (deductResult.already_processed) {
            // べき等: 既に処理済み → 所有チェックを再実行
            const owns = await userOwnsItem(userId, itemId);
            if (owns) {
                return { success: false, error: 'already_owned' };
            }
        }
        return { success: false, error: 'insufficient_balance' };
    }

    // 5. user_items に追加
    const { data: userItem, error: insertError } = await supabaseAdmin
        .from('user_items')
        .insert({
            user_id: userId,
            item_id: itemId,
            is_equipped: false,
        })
        .select('*, shop_items(*)')
        .single();

    if (insertError) {
        console.error('purchaseItem insert error:', insertError);
        // 引き落とし済みだが挿入失敗 → ログに残す（手動対応が必要）
        console.error(`CRITICAL: UC deducted but user_item insert failed. userId=${userId}, itemId=${itemId}, amount=${item.price}`);
        return { success: false, error: 'unknown' };
    }

    return {
        success: true,
        userItem: userItem as UserItem,
        newBalance: deductResult.new_balance,
    };
}

// ============================================
// 装備 / 装備解除
// ============================================

/** アイテムを装備する（同カテゴリの既存装備は自動解除） */
export async function equipItem(userId: string, userItemId: string): Promise<{ success: boolean; error?: string }> {
    // 1. user_item を取得して所有確認
    const { data: userItem, error: fetchError } = await supabaseAdmin
        .from('user_items')
        .select('*, shop_items(*)')
        .eq('id', userItemId)
        .eq('user_id', userId)
        .single();

    if (fetchError || !userItem) {
        return { success: false, error: 'item_not_found' };
    }

    const category = (userItem as UserItem).shop_items?.category;
    if (!category) {
        return { success: false, error: 'invalid_item' };
    }

    // 2. 同カテゴリの装備を全て解除
    const { error: unequipError } = await supabaseAdmin
        .from('user_items')
        .update({ is_equipped: false })
        .eq('user_id', userId)
        .eq('is_equipped', true)
        .in('item_id',
            // 同カテゴリのアイテムIDリストを取得するサブクエリ的アプローチ
            (await supabaseAdmin
                .from('shop_items')
                .select('id')
                .eq('category', category)
            ).data?.map(i => i.id) || []
        );

    if (unequipError) {
        console.error('equipItem unequip error:', unequipError);
        return { success: false, error: 'unequip_failed' };
    }

    // 3. 対象アイテムを装備
    const { error: equipError } = await supabaseAdmin
        .from('user_items')
        .update({ is_equipped: true })
        .eq('id', userItemId)
        .eq('user_id', userId);

    if (equipError) {
        console.error('equipItem equip error:', equipError);
        return { success: false, error: 'equip_failed' };
    }

    return { success: true };
}

/** アイテムの装備を解除する */
export async function unequipItem(userId: string, userItemId: string): Promise<{ success: boolean; error?: string }> {
    const { error } = await supabaseAdmin
        .from('user_items')
        .update({ is_equipped: false })
        .eq('id', userItemId)
        .eq('user_id', userId);

    if (error) {
        console.error('unequipItem error:', error);
        return { success: false, error: 'unequip_failed' };
    }

    return { success: true };
}

// ============================================
// ショップ表示用ヘルパー
// ============================================

/** カテゴリに対応するアイコンとラベルを返す */
export function getCategoryMeta(category: ShopCategory): { icon: string; labelEn: string; labelJa: string } {
    switch (category) {
        case 'ICON_FRAME':
            return { icon: '🖼️', labelEn: 'Icon Frames', labelJa: 'アイコンフレーム' };
        case 'TITLE':
            return { icon: '🏷️', labelEn: 'Titles', labelJa: '称号' };
        case 'THEME_COLOR':
            return { icon: '🎨', labelEn: 'Theme Colors', labelJa: 'テーマカラー' };
    }
}

/** ランクに対応するラベルを返す */
export function getRankLabel(rank: string, locale: string = 'en'): string {
    const found = INVESTOR_RANKS.find(r => r.rank === rank);
    if (!found) return rank;
    return locale === 'ja' ? found.labelJa : found.label;
}
