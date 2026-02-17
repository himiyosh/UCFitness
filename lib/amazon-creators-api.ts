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

// --- Creators API レスポンス型定義 ---

interface OAuthTokenResponse {
    access_token?: string;
    expires_in?: number;
    token_type?: string;
}

interface CreatorsItemInfo {
    title?: { displayValue?: string };
    byLineInfo?: { brand?: { displayValue?: string } };
}

interface CreatorsImage {
    url?: string;
}

interface CreatorsItem {
    asin: string;
    detailPageURL?: string;
    itemInfo?: CreatorsItemInfo;
    images?: {
        primary?: {
            large?: CreatorsImage;
            medium?: CreatorsImage;
        };
    };
    offersV2?: {
        listings?: Array<{
            price?: {
                money?: { displayAmount?: string };
            };
        }>;
    };
    customerReviews?: {
        starRating?: { value?: number | string };
        count?: number;
    };
    browseNodeInfo?: {
        browseNodes?: Array<{ displayName?: string }>;
    };
}

interface CreatorsSearchResponse {
    searchResult?: {
        items?: CreatorsItem[];
        totalResultCount?: number;
        searchURL?: string;
    };
}

interface CreatorsGetItemsResponse {
    itemsResult?: {
        items?: CreatorsItem[];
    };
}

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

    const response = await fetch(tokenUrl, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: requestBody,
    });

    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`OAuth2 トークン取得失敗: ${response.status} - ${extractErrorMessage(errorText)}`);
    }

    const data: OAuthTokenResponse = await response.json();
    const accessToken = data.access_token;
    const expiresIn = data.expires_in;

    if (!accessToken || !expiresIn) {
        throw new Error('OAuth2 レスポンスにアクセストークンが含まれていません');
    }

    // 有効期限 30秒前にキャッシュ無効化
    cachedToken = {
        token: accessToken,
        expiresAt: Date.now() + Math.max(expiresIn - 30, 0) * 1000,
    };

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
                    await new Promise(resolve => setTimeout(resolve, delay));
                    continue;
                }

                throw new Error(`Creators API エラー: ${status} - ${extractErrorMessage(errorBody)}`);
            }

            return await response.json() as T;
        } catch (error) {
            if (attempt < maxRetries && !(error instanceof Error && error.message.startsWith('Creators API エラー'))) {
                const delay = baseDelayMs * Math.pow(2, attempt);
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
    const trimmed = keywords.trim();
    if (!trimmed) {
        return { products: [], totalResults: 0, searchUrl: '' };
    }

    const partnerTag = env.AMAZON_PARTNER_TAG;
    const safeItemCount = Math.max(1, Math.min(itemCount, 50));

    // Creators API のリソース名は小文字 camelCase
    const body = {
        keywords: trimmed,
        searchIndex: category,
        partnerTag,
        itemCount: safeItemCount,
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

    const data = await apiRequest<CreatorsSearchResponse>('/catalog/v1/searchItems', body);

    const products: AmazonProduct[] = (data.searchResult?.items ?? []).map(
        (item) => parseItem(item, partnerTag)
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
    if (asins.length === 0) return [];

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

    const data = await apiRequest<CreatorsGetItemsResponse>('/catalog/v1/getItems', body);

    return (data.itemsResult?.items ?? []).map(
        (item) => parseItem(item, partnerTag)
    );
}

// ============================================
// ユーティリティ
// ============================================

/**
 * Creators API のレスポンスアイテムを AmazonProduct に変換
 * PA-API v5 との違い: PascalCase → camelCase、Offers → offersV2
 */
function parseItem(item: CreatorsItem, partnerTag: string): AmazonProduct {
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
        rating: rating != null && !Number.isNaN(Number(rating)) ? Number(rating) : null,
        totalReviews: totalReviews ?? null,
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

// --- Amazon検索インデックス URL パラメータ ---
const SEARCH_INDEX_URL_MAP: Record<string, string> = {
    SportingGoods: 'sporting',
    HealthPersonalCare: 'hpc',
    Shoes: 'shoes',
    Apparel: 'fashion',
    Electronics: 'electronics',
    Books: 'stripbooks',
};

/** リンクの種類 */
export type AffiliateLinkType = 'product' | 'search' | 'tagged-url';

/** 検索で見つかった商品候補 */
export interface SearchCandidate {
    asin: string;
    title: string;
    imageUrl: string;
    affiliateLink: string;
}

export interface GenerateResult {
    affiliateLink: string;
    type: AffiliateLinkType;
    imageUrl?: string;    // ASIN特定時の商品画像 URL
    asin?: string;
    keyword?: string;
    category?: string;
    candidates?: SearchCandidate[];  // キーワード検索時の商品候補リスト
}

/**
 * ASIN から Amazon 商品画像 URL を生成
 * Amazon Associates 公式のアソシエイト画像ウィジェットを使用
 */
function getProductImageUrl(asin: string, partnerTag: string): string {
    return `https://ws-fe.amazon-adsystem.com/widgets/q?_encoding=UTF8&ASIN=${asin}&Format=_SL250_&ID=AsinImage&MarketPlace=JP&ServiceVersion=20070822&WS=1&tag=${partnerTag}`;
}

/**
 * 入力テキストのリンクタイプを判定
 */
export function detectInputType(input: string): AffiliateLinkType {
    if (/^[A-Z0-9]{10}$/i.test(input)) return 'product';
    if (/(?:dp|product|ASIN)\/([A-Z0-9]{10})/i.test(input)) return 'product';
    try {
        const url = new URL(input);
        if (url.hostname.includes('amazon')) return 'tagged-url';
    } catch { /* not a URL */ }
    return 'search';
}

/**
 * アフィリエイトリンク生成（API不要）
 * Amazon商品URLまたはASINから、タグ付きリンクを生成
 */
export function generateAffiliateLink(input: string, category?: string): GenerateResult {
    const partnerTag = env.AMAZON_PARTNER_TAG;

    // ASIN 形式（10文字の英数字）チェック
    const asinMatch = input.match(/^[A-Z0-9]{10}$/i);
    if (asinMatch) {
        const asin = input.toUpperCase();
        return {
            affiliateLink: `https://www.amazon.co.jp/dp/${asin}?tag=${partnerTag}`,
            type: 'product',
            asin,
            imageUrl: getProductImageUrl(asin, partnerTag),
        };
    }

    // Amazon URL からASIN抽出
    const urlAsinMatch = input.match(/(?:dp|product|ASIN)\/([A-Z0-9]{10})/i);
    if (urlAsinMatch) {
        const asin = urlAsinMatch[1].toUpperCase();
        return {
            affiliateLink: `https://www.amazon.co.jp/dp/${asin}?tag=${partnerTag}`,
            type: 'product',
            asin,
            imageUrl: getProductImageUrl(asin, partnerTag),
        };
    }

    // URL にタグを付加
    try {
        const url = new URL(input);
        if (url.hostname.includes('amazon')) {
            url.searchParams.set('tag', partnerTag);
            return {
                affiliateLink: url.toString(),
                type: 'tagged-url',
            };
        }
    } catch {
        // URLでない場合は検索リンクにする
    }

    // キーワード → 検索リンク（カテゴリ対応）
    const categoryParam = category && category !== 'All' && SEARCH_INDEX_URL_MAP[category]
        ? `&i=${SEARCH_INDEX_URL_MAP[category]}`
        : '';
    return {
        affiliateLink: `https://www.amazon.co.jp/s?k=${encodeURIComponent(input)}&tag=${partnerTag}${categoryParam}`,
        type: 'search',
        keyword: input,
        category: category || 'All',
    };
}

// ============================================
// キーワード検索 → 商品候補抽出（API不要）
// ============================================

/**
 * Amazon 検索ページから商品候補（ASIN + タイトル + 画像）を取得
 * Creators API 不要 — 検索結果HTMLから商品情報を抽出
 */
export async function searchProductCandidates(
    keyword: string,
    category?: string,
): Promise<SearchCandidate[]> {
    const trimmedKeyword = keyword.trim();
    if (!trimmedKeyword) return [];

    const partnerTag = env.AMAZON_PARTNER_TAG;

    // 検索 URL 構築
    const params = new URLSearchParams({ k: trimmedKeyword });
    if (category && category !== 'All' && SEARCH_INDEX_URL_MAP[category]) {
        params.set('i', SEARCH_INDEX_URL_MAP[category]);
    }
    const searchUrl = `https://www.amazon.co.jp/s?${params.toString()}`;

    const response = await fetch(searchUrl, {
        headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept-Language': 'ja-JP,ja;q=0.9,en;q=0.8',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        },
    });

    if (!response.ok) {
        return [];
    }

    const html = await response.text();

    // data-asin 属性の位置を全て収集
    const candidates: SearchCandidate[] = [];
    const seen = new Set<string>();
    const asinPositions: { asin: string; index: number }[] = [];
    const asinPosRegex = /data-asin="([A-Z0-9]{10})"/g;
    let posMatch;
    while ((posMatch = asinPosRegex.exec(html)) !== null) {
        asinPositions.push({ asin: posMatch[1], index: posMatch.index });
    }

    // 各 ASIN のチャンク内で商品画像・タイトルを抽出
    for (let i = 0; i < asinPositions.length && candidates.length < 10; i++) {
        const asin = asinPositions[i].asin;
        if (seen.has(asin)) continue;
        seen.add(asin);

        // チャンク範囲: 現在の ASIN ～ 次の ASIN（最大5000文字）
        const start = asinPositions[i].index;
        const end = i + 1 < asinPositions.length
            ? asinPositions[i + 1].index
            : start + 5000;
        const chunk = html.substring(start, Math.min(end, start + 5000));

        // チャンク内で商品画像 (<img src="https://m.media-amazon.com/images/I/...">)
        const imgMatch = chunk.match(
            /<img[^>]*\ssrc="(https:\/\/m\.media-amazon\.com\/images\/I\/[^"]+)"[^>]*/
        );
        if (!imgMatch) continue; // 画像がないカード（ヘッダー等）はスキップ

        // alt 属性からタイトル取得
        const altMatch = imgMatch[0].match(/alt="([^"]*)"/);
        let title = altMatch ? decodeHtmlEntities(altMatch[1]) : '';
        // 「スポンサー広告 - 」プレフィックスを除去
        title = title.replace(/^スポンサー広告\s*-\s*/, '');

        candidates.push({
            asin,
            title,
            imageUrl: imgMatch[1],
            affiliateLink: `https://www.amazon.co.jp/dp/${asin}?tag=${partnerTag}`,
        });
    }

    return candidates;
}

/** HTML エンティティのデコード */
function decodeHtmlEntities(text: string): string {
    return text
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/&#x([0-9A-Fa-f]+);/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
        .replace(/&#(\d+);/g, (_, dec) => String.fromCharCode(parseInt(dec)));
}

/**
 * ASIN から商品タイトルを取得（商品ページをスクレイピング）
 * タイトルが取得できない場合は空文字を返す
 */
export async function fetchProductTitle(asin: string): Promise<string> {
    if (!asin || !/^[A-Z0-9]{10}$/i.test(asin)) return '';

    try {
        const url = `https://www.amazon.co.jp/dp/${asin.toUpperCase()}`;
        const response = await fetch(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept-Language': 'ja-JP,ja;q=0.9,en;q=0.8',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            },
        });

        if (!response.ok) return '';

        const html = await response.text();

        // <title> タグからタイトルを取得（最も信頼性が高い）
        const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
        if (titleMatch) {
            let title = decodeHtmlEntities(titleMatch[1].trim());
            // Amazon のページタイトルは「商品名 | Amazon」形式なのでサフィックスを除去
            title = title.replace(/\s*[|]\s*Amazon.*$/i, '').trim();
            if (title && title !== 'Amazon' && title !== 'Amazon.co.jp') {
                return title;
            }
        }

        // id="productTitle" からフォールバック取得
        const prodTitleMatch = html.match(/id="productTitle"[^>]*>([^<]+)</);
        if (prodTitleMatch) {
            return decodeHtmlEntities(prodTitleMatch[1].trim());
        }

        return '';
    } catch {
        return '';
    }
}
