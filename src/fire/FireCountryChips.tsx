/**
 * The country filter of the „Brände“ list — ONE row for all four look-back windows (24 h, 7 d, month, season), so the
 * filter neither changes its form nor loses its choice when the window changes (Jan 2026-11-16).
 * „Alle Länder“ · a chip for DE/AT/CH and for every chosen country · every other country in the select.
 */

const COUNTRY_LABEL: Record<string, string> = { DE: 'Deutschland', AT: 'Österreich', CH: 'Schweiz', XK: 'Kosovo', outside: 'außerhalb DE/AT/CH' };
let _regionNames: Intl.DisplayNames | null | undefined;
/** Landesname zum ISO-Code (Europa-Box); `null` = kein Land bestimmt — das wird gesagt, nicht geraten. */
export function historyCountryLabel(code: string | null): string {
  if (code == null) return 'ohne Landangabe';
  const fixed = COUNTRY_LABEL[code];
  if (fixed) return fixed;
  if (_regionNames === undefined) { try { _regionNames = new Intl.DisplayNames(['de'], { type: 'region' }); } catch { _regionNames = null; } }
  try { return _regionNames?.of(code) ?? code; } catch { return code; }
}

/** Countries that always get a chip when they occur or are chosen (the product's region); every other country sits in the select. */
const CHIP_COUNTRIES = ['DE', 'AT', 'CH'] as const;

export interface CountryChipsProps {
  /** Codes of the chosen countries; empty = all. */
  countries: readonly string[];
  /** [code, entries] of every country on offer, most entries first. */
  options: ReadonlyArray<readonly [string, number]>;
  onChange: (codes: readonly string[]) => void;
  /** The word „Land:“ in front (not in the mobile sheet). */
  showLabel: boolean;
  title?: string;
}

export function CountryChips({ countries, options, onChange, showLabel, title }: CountryChipsProps) {
  const toggle = (code: string) => onChange(countries.includes(code) ? countries.filter((c) => c !== code) : [...countries, code]);
  const chips = [
    ...CHIP_COUNTRIES.filter((c) => countries.includes(c) || options.some(([code]) => code === c)),
    ...countries.filter((c) => !(CHIP_COUNTRIES as readonly string[]).includes(c)),
  ];
  const rest = options
    .filter(([code]) => !chips.includes(code))
    .map(([code, n]) => ({ code, n, label: historyCountryLabel(code) }))
    .sort((a, b) => a.label.localeCompare(b.label, 'de'));
  return (
    <div className="br-chiprow" role="group" aria-label="Länder" title={title}>
      {showLabel && <span className="br-chiprow-lbl">Land:</span>}
      <button type="button" className={`br-chip is-ink${countries.length === 0 ? ' is-active' : ''}`} aria-pressed={countries.length === 0} onClick={() => onChange([])}>Alle Länder</button>
      {chips.map((code) => (
        <button key={code} type="button" className={`br-chip is-ink${countries.includes(code) ? ' is-active' : ''}`} aria-pressed={countries.includes(code)} onClick={() => toggle(code)}>{historyCountryLabel(code)}</button>
      ))}
      {rest.length > 0 && (
        <select className="br-chip br-chip-select" value="" aria-label="Weiteres Land hinzufügen" onChange={(e) => { if (e.target.value) toggle(e.target.value); }}>
          <option value="">Weitere …</option>
          {rest.map((c) => <option key={c.code} value={c.code}>{c.label} ({c.n.toLocaleString('de-DE')})</option>)}
        </select>
      )}
    </div>
  );
}
