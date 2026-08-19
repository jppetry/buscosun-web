/**
 * Modellseite („Modell-Bibliothek · DACH") — Vollflächen-Overlay der Kartenseite
 * im Command-Deck-Stil. Vorlagen: references/desktop-modelle.png,
 * tablet-modelle.png, mobile-modelle.png.
 *
 * Katalog-getrieben (fusion/modelCatalog) + an den Per-Land-Zustand
 * (fusion/modelSource) gebunden: Aktivierung PRO LAND (DE/AT/CH getrennt),
 * grafische DACH-Abdeckungskarte je Modell, Radar-Toggle (orthogonal zur
 * Modellwahl) bleibt erhalten. Per X schließbar.
 */

import { useEffect, useMemo, useState } from 'react';
import type { Country } from '../types';
import {
  MODEL_CATALOG, RADAR_SOURCE, coverageIn, gutFuerSatz, modelEntry,
  qualityNote, type Coverage, type ModelEntry, type ModelId,
} from '../fusion/modelCatalog';
import { activeModelId, type ModelSourceState } from '../fusion/modelSource';
import { nativeComposition } from './ModelSwitcher';
import { IcoCheck, IcoClose } from './deckIcons';

const COUNTRIES: Country[] = ['DE', 'AT', 'CH'];

/** Laienfreundliche Kurzbeschreibungen (UI-Text der Modellseite, Vorlagen-Ton). */
const MODEL_DESC: Record<ModelId, string> = {
  native: 'Je Region automatisch das beste Modell — ICON-D2, Radar & Stationen fusioniert.',
  fusion: 'Hauseigene Fusion aller Quellen zu einem geglätteten Gesamtbild — mit ehrlicher Unsicherheit.',
  'icon-d2': 'Hochaufgelöstes Kurzfristmodell für Mitteleuropa, ideal für die nächsten zwei Tage.',
  'icon-d2-eps': 'Ensemble-Variante des ICON-D2 — Kurzfrist mit Unsicherheitsspanne.',
  inca: 'Analyse-Nowcast auf 1 km — die aktuelle Lage und die nächsten Stunden für Österreich.',
  'arome-at': 'Feines Alpenmodell mit guter Geländeauflösung für AT, CH und angrenzende Regionen.',
  'icon-ch1-eps': 'Konvektions-Ensemble für die Schweiz auf 1 km — Unsicherheit im Bergland.',
  'icon-ch2-eps': 'Schweizer Ensemble auf 2,1 km — bis fünf Tage, mit Unsicherheitsspanne.',
  'arome-fr': 'Sehr feines Modell von Météo-France — deckt DE und CH voll ab, West-AT teilweise.',
  'icon-eu': 'Europaweites Modell — gröber als D2, dafür bis fünf Tage in die Zukunft.',
  mosmix: 'Statistisch veredelte Punktvorhersage an Stationen — bis zehn Tage, kein Raster.',
  obs: 'Live-Messwerte der Stationsnetze DWD, TAWES und SMN — die aktuelle Lage.',
  ukmo: 'Globalmodell des UK Met Office — Langfrist-Trends in grober Auflösung.',
  arpege: 'Französisches Globalmodell — Trends bis gut vier Tage, grobes Gitter.',
  'icon-global': 'Weltweites ICON des DWD — grob, aber bis sieben Tage in die Zukunft.',
  aicon: 'KI-Variante des ICON — schnelle globale Vorhersage aus gelernter Physik.',
  gem: 'Kanadisches Globalmodell — Langfrist-Trends bis zehn Tage.',
  ifs: 'Der ECMWF-Klassiker — verlässliche Mittelfrist bis zehn Tage, grobes Gitter.',
  gfs: 'US-Globalmodell der NOAA — bis 16 Tage, bewährter Langfrist-Blick.',
  aifs: 'KI-Modell des ECMWF — globale Mittelfrist aus gelernter Physik.',
  'aifs-ens': 'KI-Ensemble des ECMWF — Mittelfrist mit Unsicherheitsspanne.',
  aigfs: 'KI-Variante des GFS — globale Vorhersage aus gelernter Physik.',
  aigefs: 'KI-Ensemble der NOAA — Langfrist mit Unsicherheitsspanne.',
  graphcast: 'GraphCast auf GFS-Basis — KI-Vorhersage bis zehn Tage.',
};

/** Typischer Lauf-/Aktualisierungstakt (UI-Angabe „Update"). */
const MODEL_UPDATE: Record<ModelId, string> = {
  native: 'alle 3 h', fusion: 'alle 3 h',
  'icon-d2': 'alle 3 h', 'icon-d2-eps': 'alle 3 h', inca: 'stündlich',
  'arome-at': 'alle 3 h', 'icon-ch1-eps': 'alle 3 h', 'icon-ch2-eps': 'alle 6 h',
  'arome-fr': 'alle 3 h', 'icon-eu': 'alle 3 h', mosmix: 'alle 6 h', obs: 'alle 10 min',
  ukmo: 'alle 6 h', arpege: 'alle 6 h', 'icon-global': 'alle 6 h', aicon: 'alle 6 h',
  gem: 'alle 12 h', ifs: 'alle 6 h', gfs: 'alle 6 h', aifs: 'alle 6 h',
  'aifs-ens': 'alle 6 h', aigfs: 'alle 6 h', aigefs: 'alle 6 h', graphcast: 'alle 6 h',
};

/** Herkunfts-/Typ-Zeile („Komposit", „KI-Modell", „Ensemble" …). */
function kindLabel(e: ModelEntry): string {
  if (e.special === 'native') return 'Komposit';
  if (e.special === 'fusion') return 'Kombiniert · hauseigen';
  if (e.nowcast) return 'Nowcast';
  if (e.kind === 'point') return 'Punkt / Stationen';
  if (e.kind === 'analysis') return 'Analyse / Messung';
  if (e.ai && e.ensemble) return 'KI-Ensemble';
  if (e.ai) return 'KI-Modell';
  if (e.ensemble) return 'Ensemble';
  return 'Wettermodell';
}

/** Gruppen-Badge der Karten (LOKAL / REGIONAL / GLOBAL / KI). */
function groupBadge(e: ModelEntry): { label: string; cls: string } {
  if (e.ai) return { label: 'KI', cls: 'is-ki' };
  if (e.group === 'local') return { label: 'Lokal', cls: 'is-local' };
  if (e.group === 'regional') return { label: 'Regional', cls: 'is-regional' };
  return { label: 'Global', cls: 'is-global' };
}

/** „Wirkt in: …"-Zeile aus der Per-Land-Abdeckung. */
function coverageLine(e: ModelEntry): string {
  const by = (c: Coverage) => COUNTRIES.filter((k) => e.coverage[k] === c);
  const full = by('full'), part = by('partial'), coarse = by('coarse');
  if (full.length === 3) return 'DE · AT · CH voll';
  if (coarse.length === 3) return 'DE · AT · CH grob';
  if (full.length === 1 && !part.length && !coarse.length) return `nur ${full[0]}`;
  const parts: string[] = [];
  if (full.length) parts.push(`${full.join(' · ')} voll`);
  if (part.length) parts.push(`${part.join(' · ')} teilw.`);
  if (coarse.length) parts.push(`${coarse.join(' · ')} grob`);
  return parts.length ? parts.join(', ') : '—';
}

/* ---- Grafische DACH-Abdeckungskarte -------------------------------------- */

const COV_STYLE: Record<Coverage, { fill: string; stroke: string; dash?: string; width: number }> = {
  full: { fill: '#EBCBAA', stroke: '#B96A3C', width: 2.2 },
  partial: { fill: 'rgba(235, 203, 170, 0.45)', stroke: '#B96A3C', dash: '5 4', width: 1.8 },
  coarse: { fill: 'rgba(158, 195, 230, 0.28)', stroke: '#3A6FA8', dash: '3 4', width: 1.6 },
  none: { fill: 'none', stroke: '#C9BE9E', width: 1.4 },
};

const DE_PATH = 'M116 38 C138 24 174 26 188 44 C206 40 220 54 214 72 C228 82 224 104 206 108 C202 124 180 132 164 124 C150 138 124 134 116 118 C96 122 84 106 92 90 C78 80 84 58 100 56 C102 44 108 42 116 38 Z';
const AT_PATH = 'M168 156 C182 144 226 140 248 148 C264 144 274 154 268 164 C258 174 228 178 206 174 C188 178 168 170 168 156 Z';
const CH_PATH = 'M94 154 C106 144 130 146 138 156 C142 168 128 178 110 178 C94 178 84 164 94 154 Z';

export function CoverageMap({ id, mini = false }: { id: ModelId; mini?: boolean }) {
  const cov = (c: Country) => COV_STYLE[coverageIn(id, c)];
  const shape = (path: string, c: Country, label: [number, number]) => {
    const s = cov(c);
    return (
      <g key={c}>
        <path d={path} fill={s.fill} stroke={s.stroke} strokeWidth={s.width} strokeDasharray={s.dash} strokeLinejoin="round" />
        <text
          x={label[0]} y={label[1]} textAnchor="middle"
          fontSize={mini ? 15 : 13} fontWeight={700}
          fill={coverageIn(id, c) === 'none' ? '#C9BE9E' : '#8B7355'}
          style={{ letterSpacing: '0.04em' }}
        >{c}</text>
      </g>
    );
  };
  return (
    <svg
      className={`mlo-covmap${mini ? ' is-mini' : ''}`}
      viewBox="0 0 320 210"
      role="img"
      aria-label={`Wirkungsbereich von ${modelEntry(id)?.name ?? id} in DE, AT und CH`}
    >
      <g stroke="#E0D6BE" strokeWidth="1">
        <line x1="112" y1="0" x2="112" y2="210" />
        <line x1="212" y1="0" x2="212" y2="210" />
        <line x1="0" y1="88" x2="320" y2="88" />
        <line x1="0" y1="146" x2="320" y2="146" />
      </g>
      {shape(DE_PATH, 'DE', [152, 86])}
      {shape(AT_PATH, 'AT', [218, 164])}
      {shape(CH_PATH, 'CH', [113, 168])}
    </svg>
  );
}

/* ---- Overlay --------------------------------------------------------------- */

type Filter = 'alle' | 'local' | 'regional' | 'global' | 'ki';
const FILTERS: Array<{ key: Filter; label: string }> = [
  { key: 'alle', label: 'Alle' },
  { key: 'local', label: 'Lokal & fein' },
  { key: 'regional', label: 'Regional' },
  { key: 'global', label: 'Global' },
  { key: 'ki', label: 'KI' },
];

export interface ModelLibraryOverlayProps {
  state: ModelSourceState;
  onClose: () => void;
  onSelectModel: (c: Country, id: ModelId) => void;
  onClearCountryModel: (c: Country) => void;
  onToggleRadar: () => void;
}

export default function ModelLibraryOverlay({
  state, onClose, onSelectModel, onClearCountryModel, onToggleRadar,
}: ModelLibraryOverlayProps) {
  const [selectedId, setSelectedId] = useState<ModelId>(() => activeModelId(state));
  const [filter, setFilter] = useState<Filter>('alle');
  const sel = modelEntry(selectedId) ?? modelEntry('native')!;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const list = useMemo(() => {
    const order = (e: ModelEntry) =>
      e.special === 'native' ? 0 : e.special === 'fusion' ? 1
      : e.group === 'local' ? 2 : e.group === 'regional' ? 3 : 4;
    return MODEL_CATALOG
      .filter((e) => {
        if (filter === 'alle') return true;
        if (filter === 'ki') return !!e.ai;
        return e.group === filter && !e.ai;
      })
      .slice()
      .sort((a, b) => order(a) - order(b) || (a.resolutionKm ?? 999) - (b.resolutionKm ?? 999));
  }, [filter]);

  const activeIn = (id: ModelId, c: Country) => activeModelId(state, c) === id;
  const activeCountries = (id: ModelId) => COUNTRIES.filter((c) => activeIn(id, c));
  const selActiveIn = activeCountries(sel.id);
  const isRecommendedSel = sel.special === 'native';
  const selNote = qualityNote(sel.id);
  const proLandAktiv = COUNTRIES
    .map((c) => `${c} ${modelEntry(activeModelId(state, c))?.name ?? 'Native'}`)
    .join(' · ');

  const activatable = (e: ModelEntry, c: Country): { ok: boolean; why?: string } => {
    if (!e.ingested) return { ok: false, why: e.pipelineNote ?? 'bald verfügbar' };
    if (coverageIn(e.id, c) === 'none') return { ok: false, why: `deckt ${c} nicht ab` };
    return { ok: true };
  };

  return (
    <div className="mlo" role="dialog" aria-modal="true" aria-label="Modellseite — Wettermodelle & ihre Wirkungsbereiche">
      <div className="mlo-head">
        <div className="mlo-head-tx">
          <span className="mlo-eyebrow">Modell-Bibliothek · DACH</span>
          <h1 className="mlo-title">Wettermodelle <span className="mlo-title-long">&amp; ihre Wirkungsbereiche</span></h1>
          <p className="mlo-sub">
            Jede Karte zeigt, wo das Modell in Deutschland, Österreich und der Schweiz greift —
            voll, teilweise oder nur grob als Globalmodell.
          </p>
        </div>
        <button type="button" className="mlo-close" onClick={onClose} aria-label="Modellseite schließen">
          <IcoClose />
        </button>
      </div>

      <div className="mlo-body">
        <div className="mlo-filters" role="tablist" aria-label="Modellgruppe">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              type="button"
              role="tab"
              aria-selected={filter === f.key}
              className={`mlo-chip${filter === f.key ? ' is-active' : ''}${f.key === 'ki' ? ' is-ki' : ''}`}
              onClick={() => setFilter(f.key)}
            >
              {f.label}
            </button>
          ))}
          {/* Radar-Toggle — orthogonal zur Modellwahl (Funktionserhalt) */}
          <button
            type="button"
            className={`mlo-radar${state.radar ? ' is-on' : ''}`}
            role="switch"
            aria-checked={state.radar}
            onClick={onToggleRadar}
            title="Regenradar ist unabhängig von der Modellwahl"
          >
            <span className="mlo-radar-knobtrack" aria-hidden="true"><span className="mlo-radar-knob" /></span>
            Regenradar {state.radar ? 'an' : 'aus'} · {RADAR_SOURCE[state.country].name}
          </button>
        </div>

        {/* Detail des gewählten Modells */}
        <div className="mlo-detail">
          <div className="mlo-detail-map">
            <span className="mlo-map-eyebrow">Wirkungsbereich · DACH</span>
            <CoverageMap id={sel.id} />
            <div className="mlo-map-legend" aria-hidden="true">
              <span><i className="mlo-lg mlo-lg-full" /> voll</span>
              <span><i className="mlo-lg mlo-lg-part" /> teilweise</span>
              <span><i className="mlo-lg mlo-lg-coarse" /> grob (global)</span>
              <span><i className="mlo-lg mlo-lg-none" /> keine</span>
            </div>
          </div>

          <div className="mlo-detail-tx">
            <div className="mlo-detail-tags">
              {selActiveIn.length > 0 && (
                <span className="mlo-tag-active">● aktiv{isRecommendedSel ? ' · empfohlen' : ''}</span>
              )}
              {selActiveIn.length === 0 && isRecommendedSel && <span className="mlo-tag-active">empfohlen</span>}
              <span className="mlo-tag-kind">{kindLabel(sel)}</span>
            </div>
            <div className="mlo-detail-name">
              <h2>{sel.name}</h2>
              <span className="mlo-detail-op">{sel.operator}</span>
            </div>
            <p className="mlo-detail-desc">
              {sel.special === 'native' ? `${MODEL_DESC.native} ${nativeComposition(state.country)}.` : MODEL_DESC[sel.id]}
            </p>

            <div className="mlo-stats">
              <div className="mlo-stat">
                <span className="mlo-stat-label">Auflösung</span>
                <span className="mlo-stat-val">
                  {sel.resolutionKm != null ? `${String(sel.resolutionKm).replace('.', ',')} km` : sel.kind === 'point' ? 'Stationen' : '—'}
                </span>
              </div>
              <div className="mlo-stat">
                <span className="mlo-stat-label">Horizont</span>
                <span className="mlo-stat-val">{sel.horizonH > 0 ? `+${sel.horizonH} h` : 'Ist-Analyse'}</span>
              </div>
              <div className="mlo-stat">
                <span className="mlo-stat-label">Update</span>
                <span className="mlo-stat-val">{MODEL_UPDATE[sel.id]}</span>
              </div>
              <div className="mlo-stat">
                <span className="mlo-stat-label">Status</span>
                <span className={`mlo-stat-val ${sel.ingested ? 'is-live' : 'is-soon'}`}>{sel.ingested ? 'Live' : 'bald'}</span>
              </div>
            </div>

            <p className="mlo-gutfuer"><span>Gut für:</span> {gutFuerSatz(sel.id).replace(/^Gut für:\s*/, '')}</p>
            {selNote && <p className="mlo-note">⚠ {selNote}</p>}
            {sel.pipelineNote && <p className="mlo-pipe">{sel.pipelineNote}</p>}

            <div className="mlo-activate">
              <span className="mlo-activate-label">Dieses Modell aktivieren in:</span>
              <div className="mlo-activate-btns">
                {COUNTRIES.map((c) => {
                  const on = activeIn(sel.id, c);
                  const can = activatable(sel, c);
                  return (
                    <button
                      key={c}
                      type="button"
                      className={`mlo-cbtn${on ? ' is-on' : ''}`}
                      disabled={!can.ok}
                      aria-pressed={on}
                      title={can.ok
                        ? (on ? `${sel.name} in ${c} deaktivieren (zurück zum Standard)` : `${sel.name} in ${c} aktivieren`)
                        : `${sel.name}: ${can.why}`}
                      onClick={() => (on ? onClearCountryModel(c) : onSelectModel(c, sel.id))}
                    >
                      {on && <IcoCheck size={13} />} {c}
                    </button>
                  );
                })}
              </div>
              <span className="mlo-proland">Pro Land aktiv: <b>{proLandAktiv}</b></span>
            </div>
          </div>
        </div>

        <div className="mlo-all-label">Alle Modelle · Tippen zum Ansehen</div>
        <div className="mlo-grid">
          {list.map((e) => {
            const act = activeCountries(e.id);
            const gb = groupBadge(e);
            const isSel = e.id === sel.id;
            return (
              <button
                key={e.id}
                type="button"
                className={`mlo-card${isSel ? ' is-selected' : ''}${act.length ? ' is-active' : ''}${e.ingested ? '' : ' is-soon'}`}
                onClick={() => setSelectedId(e.id)}
                aria-pressed={isSel}
              >
                <span className="mlo-card-map"><CoverageMap id={e.id} mini /></span>
                <span className="mlo-card-tx">
                  <span className="mlo-card-head">
                    <span className="mlo-card-name">{e.name}</span>
                    {act.length > 0 && <span className="mlo-card-activechip">aktiv · {act.join('-')}</span>}
                  </span>
                  <span className="mlo-card-op">{e.operator}</span>
                  <span className={`mlo-card-badge ${gb.cls}`}>{gb.label}</span>
                  <span className="mlo-card-desc">{MODEL_DESC[e.id]}</span>
                  <span className="mlo-card-stats">
                    <b>{e.resolutionKm != null ? `${String(e.resolutionKm).replace('.', ',')} km` : 'Stationen'}</b>
                    {e.horizonH > 0 && <b>+{e.horizonH} h</b>}
                    <span className="mlo-card-cov">{e.ingested ? coverageLine(e) : 'bald verfügbar'}</span>
                  </span>
                </span>
              </button>
            );
          })}
        </div>

        <div className="mlo-foot">
          {modelEntry(activeModelId(state))?.attribution}
          {state.radar ? ` · ${RADAR_SOURCE[state.country].attribution}` : ''}
          {/* V-104: von der Einzel-Nennung zum vollständigen Verzeichnis. */}
          {' · '}<a href="/lizenzen/" className="mlo-foot-link">Alle Quellen &amp; Lizenzen</a>
        </div>
      </div>
    </div>
  );
}
