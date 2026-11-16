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

/**
 * Phone list (Jan 2026-11-16): sorting and ONE button „Filter“ share a row; the filters themselves fold open below it,
 * so the first fire stands higher on the screen. `count` = number of set filters, shown on the button.
 */
export function FilterToggle({ open, count, onClick }: { open: boolean; count: number; onClick: () => void }) {
  return (
    <button type="button" className={`br-filterbtn${open || count > 0 ? ' is-active' : ''}`} aria-expanded={open} onClick={onClick}>
      <svg width="15" height="15" viewBox="0 0 15 15" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" aria-hidden="true">
        <path d="M2 4h11M4 7.5h7M6 11h3" />
      </svg>
      Filter{count > 0 ? <span className="br-filterbtn-n">{count}</span> : null}
    </button>
  );
}

/** The set filters in words, with the way back to „everything“ — stands under the tool row while a filter is set. */
export function FilterSummary({ parts, onReset }: { parts: readonly string[]; onReset: () => void }) {
  if (parts.length === 0) return null;
  return (
    <div className="br-filtersum" role="status">
      <span className="br-filtersum-tx">{parts.join(' · ')}</span>
      <button type="button" className="br-filtersum-x" onClick={onReset} aria-label="Alle Filter zurücksetzen" title="Alle Filter zurücksetzen">
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true"><path d="M2 2l8 8M10 2l-8 8" /></svg>
      </button>
    </div>
  );
}
