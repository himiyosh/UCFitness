import { env } from './env';

// ============================================
// Amazon Creators API クライアント
// PA-API v5 の後継。OAuth2 Client Credentials 認証を使用
// ============================================

// --- Token Endpoints (バージョン＝リージョン) ---
const TOKEN_ENDPOINTS: Record<string, string> = {
    '2.1': 'https://creatorsapi.auth.us-east-1.amazoncognito.com/oauth2/token', // NA
    '2.2': 'https://creatorsapi.auth.eu-south-2.amazoncognito.com/oauth2/token', // EU
    '2.3': 'https://creatorsapi.auth.us-west-2.amazoncognito.com/oauth2/token', // FE (日本)
};

const API_BASE_URL = 'https://creatorsapi.amazon';

// --- 型定義 ---

export interface AmazonProduct {
    asin: string;
    title: string;
    url: string;           // アフィリエイトリンク付きURL
    imageUrl: string | null;
    price: string | null;   // 表示用価格（例: "¥1,980"）
    rating: number | null;
    totalReviews: number | null;
    brand: string | null;
    category: string | null;
}

export interface SearchResult {
    products: AmazonProduct[];
    totalResults: number;
    searchUrl: string;      // Amazon検索結果ページへのアフィリエイトリンク
}

/** 検索カテゴリ（SearchIndex） */
export type SearchCategory =
    | 'All'
    | 'SportingGoods'
    | 'HealthPersonalCare'
    | 'Shoes'
    | 'Apparel'
    | 'Electronics'
    | 'Books';

// ============================================
// OAuth2 Token 管理
// ============================================

let cachedToken: { token: string; expiresAt: number } | null = null;

/**
 * OAuth2 Client Credentials フローでアクセストークンを取得
 * トークンは有効期限 30秒前までキャッシュ
 */
async function getAccessToken(): Promise<string> {
    // キャッシュチェック
    if (cachedToken && Date.now() < cachedToken.expiresAt) {
        return cachedToken.token;
    }

    const version = env.AMAZON_CREDENTIAL_VERSION;
    const tokenUrl = TOKEN_ENDPOINTS[version];
    if (!tokenUrl) {
        throw new Error(`未対応の Credential Version: ${version}（対応: 2.1, 2.2, 2.3）`);
    }

    const requestBody = new URLSearchParams({
        grant_type: 'client_credentials',
        client_id: env.AMAZON_CREDENTIAL_ID,
        client_secret: env.AMAZON_CREDENTIAL_SECRET,
        scope: 'creatorsapi/default',
    }).toString();

    console.log('[Creators API] トークン取得中...', tokenUrl);

    const response = await fetch(tokenUrl, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: requestBody,
    });

    if (!response.ok) {
        const errorText = await response.text();
        console.error('[Creators API] トークン取得エラー:', response.status, errorText);
        throw new Error(`OAuth2 トークン取得失敗: ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    const accessToken = data.access_token as string | undefined;
    const expiresIn = data.expires_in as number | undefined;

    if (!accessToken || !expiresIn) {
        throw new Error('OAuth2 レスポンスにアクセストークンが含まれていません');
    }

    // 有効期限 30秒前にキャッシュ無効化
    cachedToken = {
        token: accessToken,
        expiresAt: Date.now() + Math.max(expiresIn - 30, 0) * 1000,
    };

    console.log('[Creators API] トークン取得成功（有効期限:', expiresIn, '秒）');
    return accessToken;
}

// ============================================
// API リクエスト（リトライ付き）
// ============================================

async function apiRequest<T>(endpoint: string, body: Record<string, unknown>): Promise<T> {
    const token = await getAccessToken();
    const version = env.AMAZON_CREDENTIAL_VERSION;
    const marketplace = env.AMAZON_MARKETPLACE;

    const url = `${API_BASE_URL}${endpoint}`;

    const headers = {
        'Authorization': `Bearer ${token}, Version ${version}`,
        'x-marketplace': marketplace,
        'Content-Type': 'application/json; charset=utf-8',
        'User-Agent': 'UCFitness/1.0',
    };

    const maxRetries = 2;
    const baseDelayMs = 500;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
            const response = await fetch(url, {
                method: 'POST',
                headers,
                body: JSON.stringify(body),
            });

            if (!response.ok) {
                const errorBody = await response.text();
                const status = response.status;

                // リトライ可能なエラー
                if ((status === 429 || status >= 500) && attempt < maxRetries) {
                    const delay = baseDelayMs * Math.pow(2, attempt) + Math.random() * 100;
                    console.warn(`[Creators API] リトライ ${attempt + 1}/${maxRetries} (${status}) ${delay}ms後`);
                    await new Promise(resolve => setTimeout(resolve, delay));
                    continue;
                }

                console.error('[Creators API] エラー:', status, errorBody);
                throw new Error(`Creators API エラー: ${status} - ${extractErrorMessage(errorBody)}`);
            }

            return await response.json() as T;
        } catch (error) {
            if (attempt < maxRetries && !(error instanceof Error && error.message.startsWith('Creators API エラー'))) {
                const delay = baseDelayMs * Math.pow(2, attempt);
                console.warn(`[Creators API] ネットワークエラー、リトライ ${attempt + 1}/${maxRetries}`);
                await new Promise(resolve => setTimeout(resolve, delay));
                continue;
            }
            throw error;
        }
    }

    throw new Error('Creators API: 最大リトライ回数を超えました');
}

// ============================================
// 商品検索
// ============================================

/**
 * キーワードで商品を検索してアフィリエイトリンク付きの結果を返す
 */
export async function searchProducts(
    keywords: string,
    category: SearchCategory = 'All',
    itemCount: number = 10
): Promise<SearchResult> {
    const partnerTag = env.AMAZON_PARTNER_TAG;

    // Creators API のリソース名は小文字 camelCase
    const body = {
        keywords,
        searchIndex: category,
        partnerTag,
        itemCount: Math.min(itemCount, 50), // Creators API は最大50件
        resources: [
            'itemInfo.title',
            'itemInfo.byLineInfo',
            'images.primary.large',
            'offersV2.listings.price',
            'customerReviews.count',
            'customerReviews.starRating',
            'browseNodeInfo.browseNodes',
        ],
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data = await apiRequest<any>('/catalog/v1/searchItems', body);

    const products: AmazonProduct[] = (data.searchResult?.items || []).map(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (item: any) => parseItem(item, partnerTag)
    );

    return {
        products,
        totalResults: data.searchResult?.totalResultCount || 0,
        searchUrl: data.searchResult?.searchURL
            || `https://www.amazon.co.jp/s?k=${encodeURIComponent(keywords)}&tag=${partnerTag}`,
    };
}

/**
 * ASIN で商品を直接取得してアフィリエイトリンク付きで返す
 */
export async function getProductsByAsin(asins: string[]): Promise<AmazonProduct[]> {
    const partnerTag = env.AMAZON_PARTNER_TAG;

    const body = {
        itemIds: asins.slice(0, 10),
        partnerTag,
        resources: [
            'itemInfo.title',
            'itemInfo.byLineInfo',
            'images.primary.large',
            'offersV2.listings.price',
            'customerReviews.count',
            'customerReviews.starRating',
        ],
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data = await apiRequest<any>('/catalog/v1/getItems', body);

    return (data.itemsResult?.items || []).map(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (item: any) => parseItem(item, partnerTag)
    );
}

// ============================================
// ユーティリティ
// ============================================

/**
 * Creators API のレスポンスアイテムを AmazonProduct に変換
 * PA-API v5 との違い: PascalCase → camelCase、Offers → offersV2
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function parseItem(item: any, partnerTag: string): AmazonProduct {
    // offersV2.listings[].price.money.displayAmount
    const priceListing = item.offersV2?.listings?.[0];
    const priceDisplay = priceListing?.price?.money?.displayAmount;

    const rating = item.customerReviews?.starRating?.value;
    const totalReviews = item.customerReviews?.count;

    // browseNodeInfo から最初のカテゴリ名を取得
    const browseNode = item.browseNodeInfo?.browseNodes?.[0];
    const categoryName = browseNode?.displayName || null;

    return {
        asin: item.asin,
        title: item.itemInfo?.title?.displayValue || '',
        url: item.detailPageURL || `https://www.amazon.co.jp/dp/${item.asin}?tag=${partnerTag}`,
        imageUrl: item.images?.primary?.large?.url || item.images?.primary?.medium?.url || null,
        price: priceDisplay || null,
        rating: rating != null ? parseFloat(String(rating)) : null,
        totalReviews: totalReviews || null,
        brand: item.itemInfo?.byLineInfo?.brand?.displayValue || null,
        category: categoryName,
    };
}

function extractErrorMessage(body: string): string {
    try {
        const parsed = JSON.parse(body);
        return parsed.message           // Creators API 標準エラー形式
            || parsed.errors?.[0]?.message
            || parsed.Errors?.[0]?.Message
            || parsed.reason
            || parsed.__type
            || parsed.error
            || 'Unknown error';
    } catch {
        return body.substring(0, 200);
    }
}

/**
 * 簡易アフィリエイトリンク生成（API不要）
 * Amazon商品URLまたはASINから、タグ付きリンクを生成
 */
export function generateAffiliateLink(input: string): string {
    const partnerTag = env.AMAZON_PARTNER_TAG;

    // ASIN 形式（10文字の英数字）チェック
    const asinMatch = input.match(/^[A-Z0-9]{10}$/);
    if (asinMatch) {
        return `https://www.amazon.co.jp/dp/${input}?tag=${partnerTag}`;
    }

    // Amazon URL からASIN抽出
    const urlAsinMatch = input.match(/(?:dp|product|ASIN)\/([A-Z0-9]{10})/i);
    if (urlAsinMatch) {
        return `https://www.amazon.co.jp/dp/${urlAsinMatch[1]}?tag=${partnerTag}`;
    }

    // URL にタグを付加
    try {
        const url = new URL(input);
        if (url.hostname.includes('amazon')) {
            url.searchParams.set('tag', partnerTag);
            return url.toString();
        }
    } catch {
        // URLでない場合は検索リンクにする
    }

    // キーワード → 検索リンク
    return `https://www.amazon.co.jp/s?k=${encodeURIComponent(input)}&tag=${partnerTag}`;
}
