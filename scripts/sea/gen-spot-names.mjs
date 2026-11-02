/**
 * Seewetter · Namenstabelle der Spots für Link-Vorschauen (`src/sea/seaSpotNames.ts`).
 *
 * Die Vorschau eines geteilten Spot-Links entsteht ohne Katalog (Crawler, Edge Function): Kennung → Name und Revier stehen
 * deshalb als kleine GENERIERTE Tabelle im Share-Pfad. Quelle ist dieselbe Handliste, aus der der Daten-Producer den Katalog
 * baut (`scripts/sea/spots-src.json`, `build-spots.mjs`) — keine zweite Pflegestelle. Neue Spots ⇒ dieses Skript neu laufen
 * lassen; `verify-share.mjs` prüft, dass die Tabelle zur Handliste passt.
 *
 *   node scripts/sea/gen-spot-names.mjs
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const src = JSON.parse(readFileSync(join(ROOT, 'scripts/sea/spots-src.json'), 'utf8'));
const rows = src.spots.map((s) => [s.id, s.name, s.region]);
const body = rows.map(([id, name, region]) => `  ${JSON.stringify(id)}: [${JSON.stringify(name)}, ${JSON.stringify(region)}],`).join('\n');
const out = `/**
 * GENERIERT von \`scripts/sea/gen-spot-names.mjs\` aus \`scripts/sea/spots-src.json\` — nicht von Hand ändern.
 * Kennung (\`/seewetter/<id>\`) → [Name, Revier]; nur für Link-Vorschauen ohne Katalog (Teilen-Sheet, Edge Function).
 */
export const SEA_SPOT_NAMES: Readonly<Record<string, readonly [name: string, region: 'nordsee' | 'ostsee']>> = {
${body}
};
`;
writeFileSync(join(ROOT, 'src/sea/seaSpotNames.ts'), out);
console.log(`geschrieben: src/sea/seaSpotNames.ts (${rows.length} Spots)`);
