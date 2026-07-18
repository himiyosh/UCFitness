import { isOfficialAmazonUrl } from '@/lib/amazon-url';
export const AFFILIATE_EXPERIMENT_ID = 'f008_c3_v1';
const ASSIGNMENT_KEY = 'ucfitness:affiliate-experiment:f008-c3-v1';
export type AffiliateVariant = 'A' | 'B';
export type AffiliateSurface = 'profile' | 'dashboard' | 'shop';
export type AffiliateTargetType = 'product' | 'search';
export type AffiliateEventName = 'impression' | 'click';
export interface AffiliateAssignment { schema: 1; positionVariant: AffiliateVariant; copyVariant: AffiliateVariant; measurementEnabled: boolean; }
export interface AffiliateEvent {
  schema: 1; event: AffiliateEventName; experiment: typeof AFFILIATE_EXPERIMENT_ID; positionVariant: AffiliateVariant;
  copyVariant: AffiliateVariant; surface: AffiliateSurface; targetType: AffiliateTargetType; targetId: string;
}
interface StorageLike { getItem(key: string): string | null; setItem(key: string, value: string): void; }
let memoryAssignment: AffiliateAssignment | null = null;
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
function isVariant(value: unknown): value is AffiliateVariant { return value === 'A' || value === 'B'; }
export function createAffiliateAssignment(bytes?: Uint8Array): AffiliateAssignment {
  const randomBytes = bytes ?? (() => {
    if (!globalThis.crypto?.getRandomValues) return null;
    return globalThis.crypto.getRandomValues(new Uint8Array(2));
  })();
  return { schema: 1, positionVariant: randomBytes && randomBytes[0] >= 128 ? 'B' : 'A',
    copyVariant: randomBytes && randomBytes[1] >= 128 ? 'B' : 'A', measurementEnabled: randomBytes !== null };
}
export function parseAffiliateAssignment(value: string | null): AffiliateAssignment | null {
  if (!value) return null;
  try {
    const parsed: unknown = JSON.parse(value);
    if (!isRecord(parsed) || parsed.schema !== 1
      || !isVariant(parsed.positionVariant) || !isVariant(parsed.copyVariant)) return null;
    return { schema: 1, positionVariant: parsed.positionVariant, copyVariant: parsed.copyVariant, measurementEnabled: true };
  } catch { return null; }
}
export function getAffiliateAssignment(storage?: StorageLike): AffiliateAssignment {
  if (memoryAssignment) return memoryAssignment;
  try {
    const saved = parseAffiliateAssignment(storage?.getItem(ASSIGNMENT_KEY) ?? null);
    if (saved) return (memoryAssignment = saved);
  } catch { /* Storage is optional; keep the in-memory assignment for this page. */ }
  memoryAssignment = createAffiliateAssignment();
  try {
    if (!storage) throw new Error('Session storage unavailable');
    if (memoryAssignment.measurementEnabled) storage.setItem(ASSIGNMENT_KEY, JSON.stringify(memoryAssignment));
  } catch {
    memoryAssignment = { ...memoryAssignment, measurementEnabled: false };
  }
  return memoryAssignment;
}
export function isJapaneseAmazonUrl(href: string): boolean {
  try {
    const url = new URL(href);
    return isOfficialAmazonUrl(url) && !url.username && !url.password && !url.port
      && (url.hostname === 'amazon.co.jp' || url.hostname.endsWith('.amazon.co.jp'));
  } catch { return false; }
}
export function parseAffiliateEvent(value: unknown): AffiliateEvent | null {
  if (!isRecord(value)) return null;
  const keys = ['schema', 'event', 'experiment', 'positionVariant', 'copyVariant', 'surface', 'targetType', 'targetId'];
  if (Object.keys(value).some(key => !keys.includes(key))) return null;
  const { event, positionVariant, copyVariant, surface, targetType, targetId } = value;
  if (value.schema !== 1 || value.experiment !== AFFILIATE_EXPERIMENT_ID
    || (event !== 'impression' && event !== 'click')
    || !isVariant(positionVariant) || !isVariant(copyVariant)
    || (surface !== 'profile' && surface !== 'dashboard' && surface !== 'shop')
    || (targetType !== 'product' && targetType !== 'search')
    || typeof targetId !== 'string' || !/^[A-Za-z0-9_-]{1,64}$/.test(targetId)) return null;
  return { schema: 1, event, experiment: AFFILIATE_EXPERIMENT_ID, positionVariant, copyVariant, surface, targetType, targetId };
}
