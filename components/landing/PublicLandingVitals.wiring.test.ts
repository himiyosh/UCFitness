import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

const root = process.cwd();
const landingPage = readFileSync(join(root, 'components/LandingPage.tsx'), 'utf8');
const localizedPage = readFileSync(join(root, 'app/[locale]/page.tsx'), 'utf8');
const localizedLayout = readFileSync(join(root, 'app/[locale]/layout.tsx'), 'utf8');
const vitalsIsland = readFileSync(
  join(root, 'components/landing/PublicLandingVitals.tsx'),
  'utf8',
);

function listProductionSources(directory: string): string[] {
  return readdirSync(directory).flatMap((entry) => {
    const path = join(directory, entry);
    if (statSync(path).isDirectory()) return listProductionSources(path);
    if (!/\.(?:ts|tsx)$/.test(entry) || /\.test\.(?:ts|tsx)$/.test(entry)) return [];
    return [path];
  });
}

describe('PublicLandingVitals wiring', () => {
  it('未認証LandingPageだけがclient islandを描画する', () => {
    expect(landingPage).toContain(
      "import PublicLandingVitals from '@/components/landing/PublicLandingVitals';",
    );
    expect(landingPage.match(/<PublicLandingVitals \/>/g)).toHaveLength(1);
    expect(localizedPage).toMatch(
      /if \(!session\?\.user\) \{\s+return <LandingPage locale=\{locale\}/,
    );
  });

  it('共有layoutと認証済みpageへ計測islandを配線しない', () => {
    expect(localizedLayout).not.toContain('PublicLandingVitals');
    expect(localizedPage).not.toContain('PublicLandingVitals');
    expect(vitalsIsland).toContain('if (!activeRef.current) return;');
    expect(vitalsIsland).toMatch(
      /activeRef\.current = false;\s+deliveryRef\.current\?\.dispose\(\)/,
    );
    const references = [
      ...listProductionSources(join(root, 'app')),
      ...listProductionSources(join(root, 'components')),
    ]
      .filter((path) => (
        /(?:components\/landing\/PublicLandingVitals|function PublicLandingVitals|<PublicLandingVitals)/
          .test(readFileSync(path, 'utf8'))
      ))
      .map((path) => path.slice(root.length + 1))
      .sort();
    expect(references).toEqual([
      'components/LandingPage.tsx',
      'components/landing/PublicLandingVitals.tsx',
    ]);
  });
});
