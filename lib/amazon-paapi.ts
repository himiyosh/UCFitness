import { createHmac, createHash } from 'crypto';
import { env } from './env';

// ============================================
// Amazon PA-API v5 クライアント
// AWS Signature V4 署名付きリクエストで商品を検索し、
// アフィリエイトリンクを自動生成する
// ============================================

// --- 定数 ---
const HOST = 'webservices.amazon.co.jp';
const REGION = 'us-west-2';
const SERVICE = 'ProductAdvertisingAPI';
const ENDPOINT = `https://${HOST}/paapi5/searchitems`;
const GET_ITEMS_ENDPOINT = `https://${HOST}/paapi5/getitems`;

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

/** PA-API 検索カテゴリ */
export type SearchCategory =
    | 'All'
    | 'SportingGoods'
    | 'HealthPersonalCare'
    | 'Shoes'
    | 'Apparel'
    | 'Electronics'
    | 'Books';

// ============================================
// AWS Signature V4 署名
// ============================================

function hmacSha256(key: Buffer | string, data: string): Buffer {
    return createHmac('sha256', key).update(data, 'utf8').digest();
}

function sha256Hex(data: string): string {
    return createHash('sha256').update(data, 'utf8').digest('hex');
}

function getSignatureKey(key: string, dateStamp: string, region: string, service: string): Buffer {
    const kDate = hmacSha256(Buffer.from('AWS4' + key, 'utf8'), dateStamp);
    const kRegion = hmacSha256(kDate, region);
    const kService = hmacSha256(kRegion, service);
    const kSigning = hmacSha256(kService, 'aws4_request');
    return kSigning;
}

function formatDate(date: Date): { amzDate: string; dateStamp: string } {
    const iso = date.toISOString().replace(/[:-]|\.\d{3}/g, '');
    return {
        amzDate: iso.substring(0, 15) + 'Z',   // 20260212T120000Z 形式
        dateStamp: iso.substring(0, 8),          // 20260212 形式
    };
}

interface SignedHeaders {
    'content-type': string;
    'host': string;
    'x-amz-date': string;
    'x-amz-target': string;
    'content-encoding': string;
    'Authorization': string;
}

function signRequest(
    target: string,
    payload: string,
    accessKey: string,
    secretKey: string
): SignedHeaders {
    const now = new Date();
    const { amzDate, dateStamp } = formatDate(now);

    const canonicalUri = target === 'com.amazon.paapi5.v1.ProductAdvertisingAPIv1.SearchItems'
        ? '/paapi5/searchitems'
        : '/paapi5/getitems';

    const headers = {
        'content-type': 'application/json; charset=utf-8',
        'host': HOST,
        'x-amz-date': amzDate,
        'x-amz-target': target,
        'content-encoding': 'amz-1.0',
    };

    // 正規リクエスト作成
    const signedHeaderKeys = Object.keys(headers).sort().join(';');
    const canonicalHeaders = Object.keys(headers)
        .sort()
        .map(k => `${k}:${headers[k as keyof typeof headers]}`)
        .join('\n') + '\n';

    const payloadHash = sha256Hex(payload);

    const canonicalRequest = [
        'POST',
        canonicalUri,
        '',                  // クエリ文字列なし
        canonicalHeaders,
        signedHeaderKeys,
        payloadHash,
    ].join('\n');

    // 署名対象文字列
    const credentialScope = `${dateStamp}/${REGION}/${SERVICE}/aws4_request`;
    const stringToSign = [
        'AWS4-HMAC-SHA256',
        amzDate,
        credentialScope,
        sha256Hex(canonicalRequest),
    ].join('\n');

    // 署名計算
    const signingKey = getSignatureKey(secretKey, dateStamp, REGION, SERVICE);
    const signature = hmacSha256(signingKey, stringToSign).toString('hex');

    const authorization =
        `AWS4-HMAC-SHA256 Credential=${accessKey}/${credentialScope}, ` +
        `SignedHeaders=${signedHeaderKeys}, ` +
        `Signature=${signature}`;

    return { ...headers, Authorization: authorization };
}

// ============================================
// PA-API リクエスト
// ============================================

/**
 * 商品を検索してアフィリエイトリンク付きの結果を返す
 */
export async function searchProducts(
    keywords: string,
    category: SearchCategory = 'All',
    itemCount: number = 10
): Promise<SearchResult> {
    const partnerTag = env.AMAZON_PARTNER_TAG;

    const payload = JSON.stringify({
        Keywords: keywords,
        SearchIndex: category,
        PartnerTag: partnerTag,
        PartnerType: 'Associates',
        Marketplace: 'www.amazon.co.jp',
        ItemCount: Math.min(itemCount, 10),  // PA-API は最大10件
        Resources: [
            'Images.Primary.Large',
            'ItemInfo.Title',
            'ItemInfo.ByLineInfo',
            'ItemInfo.Classifications',
            'Offers.Listings.Price',
            'CustomerReviews.Count',
            'CustomerReviews.StarRating',
            'BrowseNodeInfo.BrowseNodes.SalesRank',
        ],
    });

    const target = 'com.amazon.paapi5.v1.ProductAdvertisingAPIv1.SearchItems';
    const headers = signRequest(target, payload, env.AMAZON_ACCESS_KEY, env.AMAZON_SECRET_KEY);

    const response = await fetch(ENDPOINT, {
        method: 'POST',
        headers: headers as unknown as HeadersInit,
        body: payload,
    });

    if (!response.ok) {
        const errorBody = await response.text();
        console.error('[PA-API] SearchItems エラー:', response.status, errorBody);
        throw new Error(`PA-API エラー: ${response.status} - ${extractErrorMessage(errorBody)}`);
    }

    const data = await response.json();

    const products: AmazonProduct[] = (data.SearchResult?.Items || []).map(parseItem);

    return {
        products,
        totalResults: data.SearchResult?.TotalResultCount || 0,
        searchUrl: `https://www.amazon.co.jp/s?k=${encodeURIComponent(keywords)}&tag=${partnerTag}`,
    };
}

/**
 * ASIN で商品を直接取得してアフィリエイトリンク付きで返す
 */
export async function getProductsByAsin(asins: string[]): Promise<AmazonProduct[]> {
    const partnerTag = env.AMAZON_PARTNER_TAG;

    const payload = JSON.stringify({
        ItemIds: asins.slice(0, 10),  // 最大10件
        PartnerTag: partnerTag,
        PartnerType: 'Associates',
        Marketplace: 'www.amazon.co.jp',
        Resources: [
            'Images.Primary.Large',
            'ItemInfo.Title',
            'ItemInfo.ByLineInfo',
            'ItemInfo.Classifications',
            'Offers.Listings.Price',
            'CustomerReviews.Count',
            'CustomerReviews.StarRating',
        ],
    });

    const target = 'com.amazon.paapi5.v1.ProductAdvertisingAPIv1.GetItems';
    const headers = signRequest(target, payload, env.AMAZON_ACCESS_KEY, env.AMAZON_SECRET_KEY);

    const response = await fetch(GET_ITEMS_ENDPOINT, {
        method: 'POST',
        headers: headers as unknown as HeadersInit,
        body: payload,
    });

    if (!response.ok) {
        const errorBody = await response.text();
        console.error('[PA-API] GetItems エラー:', response.status, errorBody);
        throw new Error(`PA-API エラー: ${response.status} - ${extractErrorMessage(errorBody)}`);
    }

    const data = await response.json();
    return (data.ItemsResult?.Items || []).map(parseItem);
}

// ============================================
// ユーティリティ
// ============================================

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function parseItem(item: any): AmazonProduct {
    const price = item.Offers?.Listings?.[0]?.Price;
    const rating = item.CustomerReviews?.StarRating?.Value;
    const totalReviews = item.CustomerReviews?.Count;

    return {
        asin: item.ASIN,
        title: item.ItemInfo?.Title?.DisplayValue || '',
        url: item.DetailPageURL || `https://www.amazon.co.jp/dp/${item.ASIN}?tag=${env.AMAZON_PARTNER_TAG}`,
        imageUrl: item.Images?.Primary?.Large?.URL || null,
        price: price
            ? `${price.DisplayAmount}`
            : null,
        rating: rating ? parseFloat(rating) : null,
        totalReviews: totalReviews || null,
        brand: item.ItemInfo?.ByLineInfo?.Brand?.DisplayValue || null,
        category: item.ItemInfo?.Classifications?.Binding?.DisplayValue || null,
    };
}

function extractErrorMessage(body: string): string {
    try {
        const parsed = JSON.parse(body);
        return parsed.Errors?.[0]?.Message || parsed.__type || 'Unknown error';
    } catch {
        return body.substring(0, 200);
    }
}

/**
 * 簡易アフィリエイトリンク生成（PA-API不要）
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
