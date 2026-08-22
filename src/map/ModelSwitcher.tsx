/**
 * Per-Land-Modell-Switcher für die 2D-Karte (Phase 3, s. `docs/model-switcher-
 * gate0.md`). Rein präsentational + katalog-getrieben — der gesamte Inhalt
 * (Karten, Badges, „Gut für"-Sätze, Abdeckung, Lizenz, Ausgrauung) kommt aus
 * `../fusion/modelCatalog`, kein doppelt gepflegter Datensatz.
 *
 * Zustand + Reducer liegen in `../fusion/modelSource`; dieses Modul liest nur
 * und meldet Auswahl über Callbacks zurück. Zwei Varianten (`rail`=Desktop,
 * `sheet`=Mobile) über eine CSS-Klasse; kein eigenes Farbsystem (Design-Tokens).
 *
 * Regeln (bestätigt): Native ist die einzige „Empfohlen"-Quelle; engine-
 * gerasterte Quellen tragen einen laienverständlichen Qualitätshinweis und sind
 * nie „Empfohlen". Nicht ingestierte Modelle sind ausgegraut („bald verfügbar").
 * Der Radar-Toggle ist orthogonal zur Modellwahl.
 */

import { useState } from 'react';
import type { Country } from '../types';
import { activeModelId, type ModelSourceState } from '../fusion/modelSource';
import {
  MODEL_CATALOG, RADAR_SOURCE, modelEntry, modelsByGroup, badges, gutFuerSatz,
  qualityNote, coverageIn, canRasterIn, type ModelEntry, type ModelId, type ModelGroup,
} from '../fusion/modelCatalog';

const FLAG: Record<Country, string> = { DE: '🇩🇪', AT: '🇦🇹', CH: '🇨🇭' };
const COUNTRY_NAME: Record<Country, string> = { DE: 'Deutschland', AT: 'Österreich', CH: 'Schweiz' };
const POINT_LABEL: Record<Country, string> = { DE: 'MOSMIX + Stationen', AT: 'AROME + TAWES', CH: 'AROME + SMN' };
const GROUP_TITLE: Record<ModelGroup, string> = {
  local: 'Lokal & fein', regional: 'Regional', global: 'Global & langfristig',
};
const GROUP_HINT: Record<ModelGroup, string> = {
  local: 'höchste Detailschärfe, kurze Reichweite',
  regional: 'gröber, dafür weiter in die Zukunft',
  global: 'grob, aber Langfrist-Trends',
};

/** Ausgeschriebene native Zusammensetzung je Land (Gate 0 §1c, katalog-genährt). */
export function nativeComposition(country: Country): string {
  return `ICON-D2 (Karte 2,2 km) · ${RADAR_SOURCE[country].name} (Radar) · ${POINT_LABEL[country]} (Punkt)`;
}

/** Kurzname der aktiven Quelle für die Statuszeile (Native ausgeschrieben). */
function activeSourceLabel(state: ModelSourceState): string {
  const id = activeModelId(state);
  const e = modelEntry(id);
  if (!e) return 'Native';
  if (e.special === 'native') return `Native — ${nativeComposition(state.country)}`;
  return e.name;
}

/** Attributionszeilen der aktuell aktiven Quellen (Lizenzpflicht). */
function activeAttributions(state: ModelSourceState): string[] {
  const out: string[] = [];
  const e = modelEntry(activeModelId(state));
  if (e) out.push(e.attribution);
  if (state.radar) {
    const r = RADAR_SOURCE[state.country].attribution;
    if (!out.includes(r)) out.push(r);
  }
  return out;
}

export interface ModelSwitcherProps {
  state: ModelSourceState;
  variant: 'rail' | 'sheet';
  onSelectCountry: (c: Country) => void;
  onSelectModel: (c: Country, id: ModelId) => void;
  onToggleRadar: () => void;
  /** Nicht-blockierender Hinweis: gewählte Fusion/Engine-Quelle offline → nativ. */
  fusionError?: boolean;
}

function CoverageTag({ cov }: { cov: ReturnType<typeof coverageIn> }) {
  if (cov === 'partial') return <span className="mc-cov mc-cov-part" title="nur teilweise abgedeckt — außerhalb fällt der Layer auf Native zurück">teilw.</span>;
  if (cov === 'coarse') return <span className="mc-cov mc-cov-coarse" title="grobes Globalmodell als Fallback">grob</span>;
  return null;
}

function ModelCard({
  entry, state, onSelect,
}: { entry: ModelEntry; state: ModelSourceState; onSelect: (id: ModelId) => void }) {
  const country = state.country;
  const selected = activeModelId(state) === entry.id;
  const cov = coverageIn(entry.id, country);
  const disabled = !entry.ingested;
  const willFallback = entry.ingested && !canRasterIn(entry.id, country) && entry.rasterCapable && entry.kind === 'raster';
  const note = qualityNote(entry.id);
  return (
    <button
      type="button"
      className={`mc-card${selected ? ' is-selected' : ''}${disabled ? ' is-disabled' : ''}`}
      aria-pressed={selected}
      disabled={disabled}
      onClick={() => !disabled && onSelect(entry.id)}
      title={disabled ? `${entry.name} — ${entry.pipelineNote ?? 'noch nicht verfügbar'}` : gutFuerSatz(entry.id)}
    >
      <span className="mc-head">
        <span className="mc-name">{entry.name}</span>
        <CoverageTag cov={cov} />
      </span>
      <span className="mc-op">{entry.operator}</span>
      <span className="mc-badges">
        {badges(entry.id).map((b) => (
          <span key={b} className={`mc-badge${b === '[KI]' ? ' mc-badge-ai' : ''}${b === 'bald verfügbar' ? ' mc-badge-soon' : ''}`}>{b}</span>
        ))}
      </span>
      <span className="mc-good">{gutFuerSatz(entry.id)}</span>
      {note && <span className="mc-warn" title="Dieses Raster entsteht durch Verrechnung auf ein grobes Gitter.">⚠ {note}</span>}
      {entry.pipelineNote && <span className="mc-pipe">{entry.pipelineNote}</span>}
      {willFallback && <span className="mc-fallback">In {FLAG[country]} nicht als Karte — nutzt Native</span>}
    </button>
  );
}

export default function ModelSwitcher({
  state, variant, onSelectCountry, onSelectModel, onToggleRadar, fusionError,
}: ModelSwitcherProps) {
  const country = state.country;
  const chosenId = activeModelId(state);
  const native = modelEntry('native')!;
  const groups: ModelGroup[] = ['local', 'regional', 'global'];
  // Kartenliste einklappbar: auf der schmalen Desktop-Rail startet sie zu (nur
  // Status + Radar sichtbar), im Mobile-Sheet offen. Land-Tabs, Statuszeile und
  // Radar-Toggle bleiben immer sichtbar (Schnellzugriff).
  const [open, setOpen] = useState(variant === 'sheet');

  return (
    <div className={`model-switcher ms-${variant}${open ? ' is-open' : ''}`} role="group" aria-label="Modellquelle pro Land">
      {/* Land-Wahl (DE/AT/CH) */}
      <div className="ms-countries" role="tablist" aria-label="Land">
        {(['DE', 'AT', 'CH'] as Country[]).map((c) => (
          <button
            key={c}
            type="button"
            role="tab"
            aria-selected={country === c}
            className={country === c ? 'active' : ''}
            onClick={() => onSelectCountry(c)}
          >{FLAG[c]} {c}</button>
        ))}
      </div>

      {/* Immer sichtbare Statuszeile: Land · Quelle · Radar */}
      <div className="ms-status" role="status">
        <span className="ms-status-country">{FLAG[country]} {COUNTRY_NAME[country]}</span>
        <span className="ms-status-src" title={activeSourceLabel(state)}>Quelle: {modelEntry(chosenId)?.name ?? 'Native'}</span>
        <span className={`ms-status-radar${state.radar ? ' on' : ''}`}>Radar {state.radar ? 'an' : 'aus'}</span>
      </div>

      {/* Radar-Toggle (orthogonal, prominent) — immer sichtbar */}
      <button
        type="button"
        className={`ms-radar-toggle${state.radar ? ' on' : ''}`}
        role="switch"
        aria-checked={state.radar}
        onClick={onToggleRadar}
      >
        <span className="ms-radar-knob" aria-hidden="true" />
        <span className="ms-radar-text">
          <span className="ms-radar-title">Regenradar {state.radar ? 'an' : 'aus'}</span>
          <span className="ms-radar-sub">{RADAR_SOURCE[country].name}</span>
        </span>
      </button>

      {/* Disclosure: Modellkarten ein-/ausklappen */}
      <button
        type="button"
        className="ms-disclosure"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        <span>Modellquelle wählen</span>
        <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><polyline points="4,6 8,10 12,6" /></svg>
      </button>

      {open && (<>
      {/* Empfohlen: Native (mit exakter Zusammensetzung) */}
      <button
        type="button"
        className={`mc-card mc-recommended${chosenId === 'native' ? ' is-selected' : ''}`}
        aria-pressed={chosenId === 'native'}
        onClick={() => onSelectModel(country, 'native')}
      >
        <span className="mc-head">
          <span className="mc-name">{native.name}</span>
          <span className="mc-tag-reco">Empfohlen · Standard</span>
        </span>
        <span className="mc-good">{nativeComposition(country)}</span>
        <span className="mc-good mc-good-sub">{gutFuerSatz('native')}</span>
      </button>

      {fusionError && modelEntry(chosenId)?.engineGridded && (
        <div className="ms-offline" role="status">⚠ Quelle offline — Karte rendert nativ</div>
      )}

      {/* Modellgruppen */}
      {groups.map((g) => {
        const list = modelsByGroup(country, g).filter((m) => !m.special);
        if (!list.length) return null;
        return (
          <div key={g} className="ms-group">
            <div className="ms-group-head">{GROUP_TITLE[g]}<span className="ms-group-hint">{GROUP_HINT[g]}</span></div>
            <div className="ms-group-cards">
              {list.map((m) => (
                <ModelCard key={m.id} entry={m} state={state} onSelect={(id) => onSelectModel(country, id)} />
              ))}
            </div>
          </div>
        );
      })}

      {/* Attribution (Lizenzpflicht) */}
      <div className="ms-attrib">
        {activeAttributions(state).map((a) => <span key={a}>{a}</span>)}
      </div>
      </>)}
    </div>
  );
}

// Re-export für MapView-Nutzung (Anzahl abgedeckter Modelle je Land etc.).
export { MODEL_CATALOG };
