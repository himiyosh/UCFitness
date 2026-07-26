import { build } from 'esbuild';
import { chromium } from 'playwright';
import { expect, it } from 'vitest';
it('片側取得失敗時_警告と取得済みおすすめと開示を維持する', async () => {
    const bundle = await build({
        stdin: {
            contents: `
                import React from 'react'; import {createRoot} from 'react-dom/client';
                import ShopRecommendations from './components/ShopRecommendations';
                globalThis.fetch = async (input) => String(input).includes('personalized')
                    ? {ok: false, json: async () => ({})}
                    : {ok: true, json: async () => ({items: [{asin: 'B000', title: 'Shoes',
                        image_url: 'data:image/gif;base64,R0lGODlhAQABAAAAACw=', affiliate_link: 'https://www.amazon.co.jp/dp/B000',
                        count: 1, users: []}]})};
                createRoot(document.getElementById('root')).render(React.createElement(ShopRecommendations));
            `,
            resolveDir: process.cwd(), loader: 'jsx',
        },
        bundle: true, write: false, format: 'iife',
        define: { 'process.env.NEXT_PUBLIC_AMAZON_ASSOCIATE_TAG': '"ucfitness-22"' },
        plugins: [{
            name: 'shop-recommendations-mocks',
            setup(context) {
                context.onResolve({ filter: /^next-intl$/ }, () => ({ path: 'next-intl', namespace: 'mock' }));
                context.onResolve({ filter: /Affiliate(?:Disclosure|Link)$/ }, ({ path }) => ({ path, namespace: 'mock' }));
                context.onLoad({ filter: /.*/, namespace: 'mock' }, ({ path }) => ({
                    loader: 'jsx', resolveDir: process.cwd(),
                    contents: path === 'next-intl' ? 'export const useTranslations = () => (key) => key;'
                        : path.endsWith('AffiliateDisclosure')
                            ? 'import React from "react"; export default function Disclosure(){return <p>disclosure</p>}'
                            : 'import React from "react"; export default function Link({children}){return <a href="#">{children}</a>}',
                }));
            },
        }],
    });
    const browser = await chromium.launch({ channel: 'chrome' });
    try {
        for (const width of [375, 1280]) {
            const page = await browser.newPage({ viewport: { width, height: 800 } });
            const pageErrors: string[] = []; page.on('pageerror', (error) => pageErrors.push(error.message));
            await page.setContent('<div id="root"></div>'); await page.addScriptTag({ content: bundle.outputFiles[0].text });
            await page.waitForTimeout(100); expect(pageErrors).toEqual([]);
            await page.getByRole('alert').waitFor();
            expect(await page.getByRole('alert').textContent()).toBe('recommendationsUnavailable');
            expect(await page.getByText('disclosure').textContent()).toBe('disclosure');
            expect(await page.getByRole('heading', { name: 'title' }).textContent()).toBe('title');
            await page.close();
        }
    } finally {
        await browser.close();
    }
}, 30_000);
