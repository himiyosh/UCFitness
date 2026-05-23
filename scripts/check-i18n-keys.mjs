import { readFileSync } from 'node:fs';

function flattenKeys(value, prefix = '') {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return [prefix.slice(0, -1)];
  }

  return Object.entries(value).flatMap(([key, child]) => flattenKeys(child, `${prefix}${key}.`));
}

function readMessages(locale) {
  return JSON.parse(readFileSync(`messages/${locale}.json`, 'utf8'));
}

const ja = readMessages('ja');
const en = readMessages('en');
const jaKeys = new Set(flattenKeys(ja));
const enKeys = new Set(flattenKeys(en));
const missingInEn = [...jaKeys].filter((key) => !enKeys.has(key));
const missingInJa = [...enKeys].filter((key) => !jaKeys.has(key));

if (missingInEn.length > 0 || missingInJa.length > 0) {
  console.error('ERR: i18n key mismatch detected');
  if (missingInEn.length > 0) {
    console.error(`Missing in en: ${missingInEn.join(', ')}`);
  }
  if (missingInJa.length > 0) {
    console.error(`Missing in ja: ${missingInJa.join(', ')}`);
  }
  process.exit(1);
}

console.log(`OK: i18n keys match (${jaKeys.size} keys)`);
