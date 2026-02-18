import { supabaseAdmin } from './supabase';
import { INVESTOR_RANKS, type InvestorRank } from './coin-service';
import { reportError } from './errors';

export const dynamic = 'force-dynamic';

// ============================================
// UCショップ サービス
// プロフィールカスタマイズアイテムの購入・装備管理
// ============================================

// --- 型定義 ---

export type ShopCategory = 'ICON_FRAME' | 'TITLE' | 'THEME_COLOR' | 'CONSUMABLE';

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
    CONSUMABLE: null;
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
        .select('id, category, item_code, name_en, name_ja, description_en, description_ja, price, rank_required, preview_value, is_active, sort_order, created_at')
        .or('category.neq.TITLE,is_active.eq.true')
        .order('is_active', { ascending: false })
        .order('price', { ascending: true })
        .order('sort_order', { ascending: true });

    if (category) {
        query = query.eq('category', category);
    }

    const { data, error } = await query;
    if (error) {
        reportError('getShopItems', error);
        return [];
    }
    return data as ShopItem[];
}

/** 特定アイテムを取得 */
export async function getShopItem(itemId: string): Promise<ShopItem | null> {
    if (!itemId) return null;

    const { data, error } = await supabaseAdmin
        .from('shop_items')
        .select('id, category, item_code, name_en, name_ja, description_en, description_ja, price, rank_required, preview_value, is_active, sort_order, created_at')
        .eq('id', itemId)
        .single();

    if (error) {
        reportError('getShopItem', error, { itemId });
        return null;
    }
    return data as ShopItem;
}

// ============================================
// ユーザー所持アイテム
// ============================================

/** ユーザーの全所持アイテムを取得 */
export async function getUserItems(userId: string): Promise<UserItem[]> {
    if (!userId) return [];
    const { data, error } = await supabaseAdmin
        .from('user_items')
        .select('*, shop_items(*)')
        .eq('user_id', userId)
        .order('purchased_at', { ascending: false });

    if (error) {
        reportError('getUserItems', error, { userId });
        return [];
    }
    return data as UserItem[];
}

/** ユーザーが特定アイテムを所持しているかチェック */
export async function userOwnsItem(userId: string, itemId: string): Promise<boolean> {
    if (!userId || !itemId) return false;
    const { data, error } = await supabaseAdmin
        .from('user_items')
        .select('id')
        .eq('user_id', userId)
        .eq('item_id', itemId)
        .maybeSingle();

    if (error) {
        reportError('userOwnsItem', error, { userId, itemId });
        return false;
    }
    return data !== null;
}

/** ユーザーの装備中アイテムを取得 */
export async function getEquippedItems(userId: string): Promise<EquippedItems> {
    if (!userId) return { ICON_FRAME: null, TITLE: null, THEME_COLOR: null, CONSUMABLE: null };
    const { data, error } = await supabaseAdmin
        .from('user_items')
        .select('*, shop_items(*)')
        .eq('user_id', userId)
        .eq('is_equipped', true);

    if (error) {
        reportError('getEquippedItems', error, { userId });
        return { ICON_FRAME: null, TITLE: null, THEME_COLOR: null, CONSUMABLE: null };
    }

    const equipped: EquippedItems = { ICON_FRAME: null, TITLE: null, THEME_COLOR: null, CONSUMABLE: null };
    for (const item of (data as UserItem[])) {
        const category = item.shop_items?.category as ShopCategory;
        if (category && category !== 'CONSUMABLE' && category in equipped) {
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
        reportError('getEquippedItemsForUsers', error, { userCount: userIds.length });
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

    // Supabase の型推論は shop_items を配列として返すが、多対一リレーションでは単一オブジェクト
    for (const item of (data as unknown as { user_id: string; shop_items: { category: string; preview_value: string; name_en: string; name_ja: string } | null }[])) {
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
    if (!userId || !itemId) {
        return { success: false, error: 'item_not_found' };
    }

    // アイテム情報を取得してカテゴリを判定
    const item = await getShopItem(itemId);
    if (!item) {
        return { success: false, error: 'item_not_found' };
    }
    if (!item.is_active) {
        return { success: false, error: 'item_inactive' };
    }

    // --- 消耗品（CONSUMABLE）は別フロー: 複数回購入可能 ---
    if (item.category === 'CONSUMABLE') {
        return purchaseConsumable(userId, item);
    }

    const idempotencyKey = `purchase_${userId}_${itemId}`;

    const { data, error } = await supabaseAdmin.rpc('purchase_item', {
        p_user_id: userId,
        p_item_id: itemId,
        p_idempotency_key: idempotencyKey,
    });

    if (error) {
        reportError('purchaseItem', error, { userId, itemId });
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
// 消耗品購入（ストリークシールド等）
// ============================================

/** 消耗品を購入する（複数回購入可能、user_streak_shields を upsert） */
async function purchaseConsumable(userId: string, item: ShopItem): Promise<PurchaseResult> {
    const idempotencyKey = `consumable_${userId}_${item.id}_${Date.now()}`;

    // deductBalance で残高を減算
    const { deductBalance } = await import('./coin-service');
    const deductResult = await deductBalance(
        userId,
        item.price,
        'PURCHASE',
        `Purchase: ${item.name_en}`,
        idempotencyKey,
    );

    if (!deductResult.success) {
        if (deductResult.error === 'insufficient_balance') {
            return { success: false, error: 'insufficient_balance' };
        }
        return { success: false, error: 'unknown' };
    }

    // ストリークシールドの場合: user_streak_shields をインクリメント
    if (item.item_code === 'streak_shield') {
        // 既存レコードを確認
        const { data: existing } = await supabaseAdmin
            .from('user_streak_shields')
            .select('remaining_uses')
            .eq('user_id', userId)
            .single();

        if (existing) {
            // 既存レコード: remaining_uses をインクリメント
            const { error: updateError } = await supabaseAdmin
                .from('user_streak_shields')
                .update({
                    remaining_uses: existing.remaining_uses + 1,
                    updated_at: new Date().toISOString(),
                })
                .eq('user_id', userId);

            if (updateError) {
                reportError('purchaseConsumable:increment', updateError, { userId });
            }
        } else {
            // 新規レコード: remaining_uses=1 で作成
            const { error: insertError } = await supabaseAdmin
                .from('user_streak_shields')
                .insert({
                    user_id: userId,
                    remaining_uses: 1,
                });

            if (insertError) {
                reportError('purchaseConsumable:insert', insertError, { userId });
            }
        }
    }

    return {
        success: true,
        newBalance: deductResult.new_balance,
    };
}

// ============================================
// 装備 / 装備解除
// ============================================

/** アイテムを装備する（同カテゴリの既存装備は自動解除） */
export async function equipItem(userId: string, userItemId: string): Promise<{ success: boolean; error?: string }> {
    if (!userId || !userItemId) {
        return { success: false, error: 'item_not_found' };
    }
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

    // 2. 同カテゴリのアイテムIDを取得し、装備を全て解除
    const { data: categoryItems } = await supabaseAdmin
        .from('shop_items')
        .select('id')
        .eq('category', category);

    const categoryItemIds = categoryItems?.map(i => i.id) || [];

    if (categoryItemIds.length > 0) {
        const { error: unequipError } = await supabaseAdmin
            .from('user_items')
            .update({ is_equipped: false })
            .eq('user_id', userId)
            .eq('is_equipped', true)
            .in('item_id', categoryItemIds);

        if (unequipError) {
            reportError('equipItem:unequip', unequipError, { userId, userItemId });
            return { success: false, error: 'unequip_failed' };
        }
    }

    // 3. 対象アイテムを装備
    const { error: equipError } = await supabaseAdmin
        .from('user_items')
        .update({ is_equipped: true })
        .eq('id', userItemId)
        .eq('user_id', userId);

    if (equipError) {
        reportError('equipItem:equip', equipError, { userId, userItemId });
        return { success: false, error: 'equip_failed' };
    }

    return { success: true };
}

/** アイテムの装備を解除する */
export async function unequipItem(userId: string, userItemId: string): Promise<{ success: boolean; error?: string }> {
    if (!userId || !userItemId) {
        return { success: false, error: 'unequip_failed' };
    }

    const { error } = await supabaseAdmin
        .from('user_items')
        .update({ is_equipped: false })
        .eq('id', userItemId)
        .eq('user_id', userId);

    if (error) {
        reportError('unequipItem', error, { userId, userItemId });
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
        case 'CONSUMABLE':
            return { icon: '🛡️', labelEn: 'Consumables', labelJa: '消耗品' };
    }
}

/** ランクに対応するラベルを返す */
export function getRankLabel(rank: string, locale: string = 'en'): string {
    const found = INVESTOR_RANKS.find(r => r.rank === rank);
    if (!found) return rank;
    return locale === 'ja' ? found.labelJa : found.label;
}
