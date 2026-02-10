import { supabaseAdmin } from './supabase';
import { INVESTOR_RANKS, type InvestorRank } from './coin-service';

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

// ============================================
// ショップアイテム取得
// ============================================

/** 全アイテムを取得（カテゴリフィルタ可、is_active=false は Coming Soon 表示用） */
export async function getShopItems(category?: ShopCategory): Promise<ShopItem[]> {
    let query = supabaseAdmin
        .from('shop_items')
        .select('*')
        .or('category.neq.TITLE,is_active.eq.true')
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

/** 複数ユーザーの装備中アイテムをバルク取得（リーダーボード用） */
export interface UserEquipSummary {
    frameColor: string | null;
    titleNameJa: string | null;
    titleNameEn: string | null;
    titleEmoji: string | null;
}

export async function getEquippedItemsForUsers(userIds: string[]): Promise<Record<string, UserEquipSummary>> {
    if (!userIds || userIds.length === 0) return {};

    const { data, error } = await supabaseAdmin
        .from('user_items')
        .select('user_id, shop_items(category, preview_value, name_en, name_ja)')
        .in('user_id', userIds)
        .eq('is_equipped', true);

    if (error) {
        console.error('getEquippedItemsForUsers error:', error);
        return {};
    }

    const result: Record<string, UserEquipSummary> = {};

    // フレームカラー変換マップ（UserAvatar.getFrameColor と同期）
    const frameColorMap: Record<string, string> = {
        // 既存
        'ring-green-400': '#4ade80',
        'ring-blue-400': '#60a5fa',
        'ring-yellow-400': '#facc15',
        'ring-cyan-300': '#67e8f9',
        'ring-purple-500': '#a855f7',
        // 新規
        'ring-rose-400': '#fb7185',
        'ring-orange-400': '#fb923c',
        'ring-teal-400': '#2dd4bf',
        'ring-red-500': '#ef4444',
        'ring-indigo-500': '#6366f1',
        'ring-emerald-500': '#10b981',
        'ring-amber-500': '#f59e0b',
        'ring-pink-500': '#ec4899',
        'ring-sky-400': '#38bdf8',
        'ring-rainbow': 'rainbow',
    };

    for (const item of (data as any[])) {
        const userId = item.user_id;
        const shopItem = item.shop_items;
        if (!shopItem) continue;

        if (!result[userId]) {
            result[userId] = { frameColor: null, titleNameJa: null, titleNameEn: null, titleEmoji: null };
        }

        if (shopItem.category === 'ICON_FRAME') {
            result[userId].frameColor = frameColorMap[shopItem.preview_value] || '#d1d5db';
        } else if (shopItem.category === 'TITLE') {
            result[userId].titleEmoji = shopItem.preview_value || null;
            result[userId].titleNameJa = shopItem.name_ja || null;
            result[userId].titleNameEn = shopItem.name_en || null;
        }
    }

    return result;
}

// ============================================
// 購入処理
// ============================================

/** アイテムを購入する（アトミック: DB側で残高減算+アイテム付与を1トランザクション実行） */
export async function purchaseItem(userId: string, itemId: string): Promise<PurchaseResult> {
    const idempotencyKey = `purchase_${userId}_${itemId}`;

    const { data, error } = await supabaseAdmin.rpc('purchase_item', {
        p_user_id: userId,
        p_item_id: itemId,
        p_idempotency_key: idempotencyKey,
    });

    if (error) {
        console.error('purchaseItem RPC error:', error);
        return { success: false, error: 'unknown' };
    }

    const result = data as {
        success: boolean;
        already_processed?: boolean;
        error?: string;
        transaction_id?: string;
        new_balance?: number;
        item_name?: string;
    };

    if (!result.success) {
        const errorMap: Record<string, PurchaseResult['error']> = {
            item_not_found: 'item_not_found',
            item_inactive: 'item_inactive',
            already_owned: 'already_owned',
            rank_too_low: 'rank_too_low',
            insufficient_balance: 'insufficient_balance',
            user_not_found: 'insufficient_balance',
        };
        return { success: false, error: errorMap[result.error || ''] || 'unknown' };
    }

    if (result.already_processed) {
        return { success: false, error: 'already_owned' };
    }

    // 購入成功: user_item を取得して返す（DB側で既に挿入済み）
    const { data: userItem } = await supabaseAdmin
        .from('user_items')
        .select('*, shop_items(*)')
        .eq('user_id', userId)
        .eq('item_id', itemId)
        .single();

    return {
        success: true,
        userItem: userItem as UserItem,
        newBalance: result.new_balance,
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
