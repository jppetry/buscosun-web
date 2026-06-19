/**
 * Prompt-Builder für den Meteorologen-Assistenten.
 *
 * Erzwingt das Grounding bereits im Prompt: Das Modell darf NUR die gelieferten
 * Werte umformulieren, nichts erfinden, fehlende weglassen. Zusätzlich pro
 * Phänomen ein knapper Physik-Anker gegen die kontraintuitiven Fälle (Föhn =
 * Erwärmung/Trocknung, KEIN Niederschlag im Föhngebiet; Inversion = Temperatur
 * steigt mit der Höhe).
 */

import type { ChatCompletionMessageParam } from '@mlc-ai/web-llm';
import type { GroundingBlock, Phenomenon } from './grounding';

export const SYSTEM_PROMPT = [
  'Du bist ein nüchterner, präziser deutschsprachiger Meteorologe.',
  'Du erklärst ein Wetterphänomen in 2–3 kurzen, natürlichen Sätzen.',
  '',
  'STRENGE REGELN:',
  '- Verwende AUSSCHLIESSLICH die unter „MESSWERTE" gelieferten Zahlen und Fakten.',
  '- Erfinde NIEMALS Zahlen, Orte, Zeiten, Richtungen oder Trends. Nichts dazudichten.',
  '- Fehlt ein Wert, lass ihn weg — niemals schätzen oder runden hinzufügen.',
  '- Nenne Werte mit ihrer Einheit genau wie geliefert.',
  '- Füge KEINE eigenen qualitativen Bewertungen hinzu, die nicht in den Messwerten stehen:',
  '  bezeichne Werte NICHT eigenmächtig als „trocken", „feucht", „kräftig", „stark", „schwach",',
  '  „hoch" oder „günstig". 70 % Luftfeuchte ist nicht „trocken", 6 km/h nicht „kräftig".',
  '- Liefern die Messwerte eine fertige Bewertung (z. B. Föhn-Lage „nein", Bedingungen „grenzwertig"),',
  '  übernimm GENAU diese — niemals abschwächen oder verstärken (kein „günstig", wenn „grenzwertig" dasteht).',
  '- Antworte auf Deutsch, in Fließtext (keine Aufzählung, keine Überschrift, keine Emojis).',
  '- Keine Handlungsempfehlungen, keine Floskeln, kein „vielleicht/könnte" über die Daten hinaus.',
  '- Übernimm gelieferte Ehrlichkeits-Hinweise (z. B. „heuristisch", „Näherung") sinngemäß.',
].join('\n');

/** Physik-Anker je Phänomen — verhindert die klassischen Fehlinterpretationen. */
const PHYSICS_ANCHOR: Record<Phenomenon, string> = {
  foehn:
    'Physik: Föhn ist warmer, trockener Fallwind im Lee (Windschatten) eines Gebirges. Im Föhngebiet selbst fällt KEIN Niederschlag und die Luftfeuchte ist niedrig; es wird wärmer, nicht kälter.',
  inversion:
    'Physik: Bei einer Temperaturinversion steigt die Temperatur mit der Höhe (oben wärmer als im Tal). Im Tal sammelt sich kalte Luft (Kaltluftsee), oft mit stabiler, ruhiger Schichtung.',
  cloudbase:
    'Physik: Die Wolkenuntergrenze liegt am Hebungskondensationsniveau — je trockener die Luft, desto höher. Angabe über Grund und über NN.',
  windprofile:
    'Physik: Der Wind nimmt mit der Höhe über Grund zu und dreht oft leicht. Die Werte sind aus dem Bodenwind mit einem Standard-Höhenprofil hochgerechnet.',
  modelspread:
    'Physik: Mehrere unabhängige Wettermodelle werden verglichen. Große Temperatur-Streuung = unsichere Lage; kleine Streuung = die Modelle sind sich einig.',
  leewaves:
    'Physik: Lee-Wellen (Leewellen) entstehen, wenn stabil geschichtete Luft quer über einen Gebirgskamm strömt. Günstig sind kräftiger Querwind, ausgeprägtes Relief und eine stabile Schicht. Mache KEINE Angaben zu Wellenlänge oder Amplitude.',
};

/** Serialisiert einen GroundingBlock in den User-Prompt (Messwerte + Auftrag). */
export function buildUserPrompt(block: GroundingBlock): string {
  const lines: string[] = [];
  lines.push(`PHÄNOMEN: ${block.title}`);
  lines.push(`ORT: ${block.locationLabel}`);
  if (block.timeLabel) lines.push(`ZEIT: ${block.timeLabel}`);
  lines.push('');
  lines.push(PHYSICS_ANCHOR[block.phenomenon]);
  lines.push('');
  lines.push('MESSWERTE:');
  for (const f of block.facts) lines.push(`- ${f.label}: ${f.value}`);
  if (block.caveats.length) {
    lines.push('');
    lines.push('HINWEISE (sinngemäß einbauen, nicht wörtlich zitieren):');
    for (const c of block.caveats) lines.push(`- ${c}`);
  }
  lines.push('');
  lines.push(`Beschreibe „${block.title}" für diesen Ort in 2–3 Sätzen, ausschließlich aus diesen Werten.`);
  return lines.join('\n');
}

/** Baut die vollständige Chat-Nachrichtenliste für die Engine. */
export function buildMessages(block: GroundingBlock): ChatCompletionMessageParam[] {
  return [
    { role: 'system', content: SYSTEM_PROMPT },
    { role: 'user', content: buildUserPrompt(block) },
  ];
}
