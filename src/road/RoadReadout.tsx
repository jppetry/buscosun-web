/**
 * AW-5 — Readout of Autobahnwetter: tabs Station · Strecke · Quellen (design). Measured values only: the +1/+3/+6 h
 * tiles and the 6-h area of the chart stay empty with "Prognose folgt" until AW-6 passes Gate D. Official warnings
 * are quoted verbatim from the DWD CAP feed (warn-layer rule), never summarised.
 */
import type { CapAlert } from '../warnings/capAlerts';
import type { RoadH24File, RoadPoint, RoadRuleId } from './roadContract';
import type { RoadCorridor } from './roadClient';
import { ROAD_CLASS_LABEL } from './roadClasses';
import type { RoadTab } from './roadState';
import {
  ROAD_CLASS_COLOR, ROAD_CLASS_INK, ROAD_CLASS_TINT, ageMinText, classBadge, conditionText, corridorEnds, dec, driverHint,
  etaRows, f1, hm, isCritical, isHatched, kmIn, shieldText, visText, DEFAULT_SPEED_KMH, DWD_WARNINGS_URL,
} from './roadView';

const DIR_TEXT: Record<string, string> = { N: 'Fahrtrichtung Nord', S: 'Fahrtrichtung Süd', O: 'Fahrtrichtung Ost', W: 'Fahrtrichtung West', X: 'beide Richtungen' };
const RULE_TEXT: Partial<Record<RoadRuleId, string>> = {
  placeholder: 'Platzhalter', stuck: 'hängender Sensor', limit: 'außerhalb der Grenzen', dwdSuspect: 'DWD: zweifelhaft',
  dewAboveAir: 'über der Lufttemperatur', gustBelowWind: 'unter dem Mittelwind', stateNoTemp: 'ohne Fahrbahntemperatur', iceWarm: 'Eis-Code bei Plusgraden',
};

function precipText(p: RoadPoint): string {
  if (p.x?.pt || p.x?.pr) return 'verworfen';
  if (p.pt == null && p.pr == null) return '—';
  const bit = (n: number) => p.pt != null && Math.floor(p.pt / 2 ** (30 - n)) % 2 === 1;
  const kinds = [bit(7) && 'Schnee', bit(5) && 'Regen', bit(4) && 'Sprühregen', bit(3) && 'gefrierend', bit(1) && 'unbestimmt'].filter(Boolean) as string[];
  if (!kinds.length && (p.pr ?? 0) === 0) return 'kein';
  return `${kinds.join(', ') || 'Niederschlag'}${p.pr ? ` · ${dec(p.pr)} mm/h` : ''}`;
}

const val = (p: RoadPoint, f: keyof RoadPoint, fmt: (v: number) => string) => {
  const v = p[f];
  if (p.x && (p.x as Record<string, RoadRuleId>)[f as string]) return `verworfen (${RULE_TEXT[(p.x as Record<string, RoadRuleId>)[f as string]] ?? 'Prüfung'})`;
  return typeof v === 'number' ? fmt(v) : '—';
};

interface ChartProps { ring: RoadH24File | null; id: string; slotMs: number }

/** Verlauf 24 h (+ 6 h reserved for AW-6): road, air, dew point from the ring of the station's series. */
function Chart({ ring, id, slotMs }: ChartProps) {
  const W = 368, H = 124, x0 = 30, x1 = 356, yTop = 10, yBot = 104;
  const X = (dh: number) => x0 + ((dh + 24) / 30) * (x1 - x0);
  const st = ring?.stations[id];
  const pts = (arr: Array<number | null> | undefined) => {
    if (!ring || !arr) return [] as Array<[number, number]>;
    return ring.slots.map((s, i) => {
      const t = Date.UTC(2000 + +s.slice(0, 2), +s.slice(2, 4) - 1, +s.slice(4, 6), +s.slice(6, 8), +s.slice(8, 10));
      return [(t - slotMs) / 3_600_000, arr[i]] as [number, number | null];
    }).filter((q): q is [number, number] => q[1] != null && q[0] >= -24 && q[0] <= 0);
  };
  const rs = pts(st?.rs), ta = pts(st?.ta), td = pts(st?.td);
  const all = [...rs, ...ta, ...td].map((q) => q[1]);
  const lo = Math.min(-4, ...all.map((v) => Math.floor(v - 1)));
  const hi = Math.max(10, ...all.map((v) => Math.ceil(v + 1)));
  const Y = (v: number) => yBot - ((v - lo) / (hi - lo)) * (yBot - yTop);
  const line = (q: Array<[number, number]>) => q.map(([h, v]) => `${X(h).toFixed(1)},${Y(v).toFixed(1)}`).join(' ');
  const nowX = X(0);
  return (
    <>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} role="img" className="aw-chart"
        aria-label={st ? `Verlauf der letzten 24 Stunden: Fahrbahn, Luft und Taupunkt (${ring?.slots.length ?? 0} Messungen)` : 'Kein Verlauf vorhanden'}>
        <rect x={nowX} y={yTop} width={x1 - nowX} height={yBot - yTop} className="aw-chart-fc" />
        <line x1={x0} y1={Y(0)} x2={x1} y2={Y(0)} stroke="#B5321F" strokeWidth="1" strokeDasharray="3 3" opacity="0.55" />
        <polyline points={line(td)} fill="none" stroke="#A89A7A" strokeWidth="1.5" strokeDasharray="2 2" />
        <polyline points={line(ta)} fill="none" stroke="#3A6FA8" strokeWidth="1.8" />
        <polyline points={line(rs)} fill="none" stroke="#2C2A26" strokeWidth="2.4" />
        {/* The latest value of each line gets a dot — a ring with one slot (first hour after start) is otherwise invisible. */}
        {ta.length > 0 && <circle cx={X(ta[ta.length - 1][0])} cy={Y(ta[ta.length - 1][1])} r="2.6" fill="#3A6FA8" />}
        {rs.length > 0 && <circle cx={X(rs[rs.length - 1][0])} cy={Y(rs[rs.length - 1][1])} r="3.2" fill="#2C2A26" />}
        <text x="2" y={Y(0) + 3} fontSize="9" fill="#B5321F">0°</text>
        <text x="2" y={yTop + 6} fontSize="9" fill="#A89A7A">{hi > 0 ? '+' : ''}{hi}°</text>
        <text x={x0} y="120" fontSize="9" fill="#A89A7A">−24 h</text>
        <text x={X(-12)} y="120" fontSize="9" fill="#A89A7A" textAnchor="middle">−12 h</text>
        <text x={nowX} y="120" fontSize="9" fill="#2C2A26" textAnchor="middle">jetzt</text>
        <text x={x1} y="120" fontSize="9" fill="#A89A7A" textAnchor="end">+6 h</text>
        <text x={(nowX + x1) / 2 + 4} y="20" fontSize="8.5" fill="#6B7A8F" textAnchor="middle">Prognose folgt</text>
      </svg>
      <div className="aw-chart-legend">
        <span className={rs.length ? '' : 'is-off'}><i style={{ background: '#2C2A26', height: 2.4 }} />Fahrbahn</span>
        <span className={ta.length ? '' : 'is-off'}><i style={{ background: '#3A6FA8' }} />Luft 2 m</span>
        <span className={td.length ? '' : 'is-off'}><i className="is-dash" />Taupunkt</span>
        {!st && <span className="aw-chart-none">kein Verlauf verfügbar</span>}
      </div>
    </>
  );
}

interface Props {
  tab: RoadTab;
  onTab: (t: RoadTab) => void;
  point: RoadPoint | null;
  corridor: RoadCorridor | null;
  byId: ReadonlyMap<string, RoadPoint>;
  dir: 0 | 1;
  slotMs: number | null;
  nowMs: number;
  stale: boolean;
  ring: RoadH24File | null;
  warnings: CapAlert[] | null;
  warnState: 'off' | 'loading' | 'ok' | 'error';
  /** When the warnings were fetched (shown as the age of the feed). */
  warnAt?: number | null;
  departOffsetMin: number;
  onDepart: (deltaMin: number) => void;
  onPick: (id: string) => void;
  noData: string | null;
}

export default function RoadReadout(p: Props) {
  return (
    <aside className="aw-readout" aria-label="Details">
      <div role="tablist" aria-label="Ansicht" className="aw-seg aw-tabs">
        {(['station', 'strecke', 'quellen'] as const).map((t) => (
          <button key={t} type="button" role="tab" aria-selected={p.tab === t} className={p.tab === t ? 'is-active' : ''} onClick={() => p.onTab(t)}>
            {t === 'station' ? 'Station' : t === 'strecke' ? 'Strecke' : 'Quellen'}
          </button>
        ))}
      </div>
      {p.tab === 'station' && <StationTab {...p} />}
      {p.tab === 'strecke' && <StreckeTab {...p} />}
      {p.tab === 'quellen' && <QuellenTab />}
    </aside>
  );
}

function StationTab(p: Props) {
  if (p.noData) return <div className="aw-empty"><strong>Derzeit keine Messdaten.</strong> {p.noData}</div>;
  const s = p.point;
  if (!s) return <div className="aw-empty">Eine Messstelle auf der Karte oder im Streckenband wählen.</div>;
  const cs = p.corridor?.stations.find((x) => x.id === s.id);
  const km = cs && p.corridor ? kmIn(p.corridor, cs.km, p.dir) : null;
  const hatched = isHatched(s.cls);
  const tint = ROAD_CLASS_TINT[s.cls];
  const sub = [s.road ? shieldText(s.road) : null, km != null ? `Korridor-km ${dec(km, 0)}` : s.km != null ? `km ${dec(s.km)}` : null, s.dir ? DIR_TEXT[s.dir] : null, s.h != null ? `${Math.round(s.h)} m ü. NN` : null].filter(Boolean).join(' · ');
  const age = p.slotMs != null ? p.nowMs - s.t : 0;
  const values: Array<[string, string]> = [
    ['Luft 2 m', val(s, 'ta', (v) => `${f1(v)} °C`)],
    ['Taupunkt', val(s, 'td', (v) => `${f1(v)} °C`)],
    ['Rel. Feuchte', val(s, 'rh', (v) => `${Math.round(v)} %`)],
    ['Sichtweite', val(s, 'vis', visText)],
    ['Wind / Böen', s.ws == null && s.wg == null ? '—' : `${s.ws != null ? Math.round(s.ws * 3.6) : '—'} / ${s.x?.wg ? 'verworfen' : s.wg != null ? Math.round(s.wg * 3.6) : '—'} km/h`],
    ['Niederschlag', precipText(s)],
    ['Wasserfilm', val(s, 'wf', (v) => `${dec(v)} mm`)],
    ['Zustand', s.x?.cond ? `verworfen (${RULE_TEXT[s.x.cond] ?? 'Prüfung'})` : conditionText(s.cond) ?? 'nicht gemeldet'],
  ];
  const warns = (p.warnings ?? []);
  return (
    <>
      <div className="aw-card aw-station">
        {/* "keine gültige Messung" only when nothing valid arrived — a measured station without condition is `unknown` (hatched too, but measured). */}
        <div className={`aw-eyebrow${s.cls === 'nodata' ? ' is-muted' : ' is-accent'}`}>{s.cls === 'nodata' ? 'Glättemeldeanlage · keine gültige Messung' : 'Glättemeldeanlage · DWD'}</div>
        <h2 className="aw-station-name">{s.n}</h2>
        <div className="aw-station-sub">{sub}</div>
        <div className={`aw-chip${p.stale ? ' is-stale' : ''}`}><i />{p.stale ? `veraltet · gemessen ${hm(s.t)}` : `gemessen ${hm(s.t)} · ${ageMinText(age)}`}</div>
        <div className="aw-hero">
          <div>
            <div className="aw-eyebrow">Fahrbahn</div>
            <div className="aw-hero-val">{s.rs != null ? `${f1(s.rs)} °C` : '—'}</div>
            <div className="aw-hero-sub">{s.rs != null ? (s.ns > 1 ? `kältester von ${s.ns} Sensoren · ${f1(s.rs)} … ${f1(s.rsHi ?? s.rs)} °C` : '1 Sensor') : s.x?.rs ? `Fahrbahnwert verworfen (${RULE_TEXT[s.x.rs] ?? 'Prüfung'})` : 'keine Fahrbahntemperatur gemeldet'}</div>
          </div>
          <div className={`aw-badge${hatched ? ' is-hatched' : ''}`} style={!hatched ? { background: ROAD_CLASS_COLOR[s.cls], color: ROAD_CLASS_INK[s.cls] } : undefined}>{classBadge(s)}</div>
        </div>
        <div className="aw-eyebrow aw-grid-title">Messwerte {hm(s.t)}</div>
        <div className="aw-grid">
          {values.map(([k, v]) => <div key={k} className="aw-cell"><span>{k}</span><strong>{v}</strong></div>)}
        </div>
        <div className="aw-hint" style={{ background: tint.bg, borderColor: tint.border, color: tint.ink }}>
          <strong>Hinweis für Fahrer</strong>{driverHint(s)}
          {s.f?.includes('spread') && <span className="aw-hint-flag"> Die Fahrbahnsensoren dieser Anlage sind sich uneinig ({f1(s.rs ?? 0)} … {f1(s.rsHi ?? 0)} °C); gezeigt ist der kälteste.</span>}
        </div>
      </div>

      <div className="aw-card">
        <div className="aw-card-head"><span className="aw-eyebrow">Verlauf 24 h</span><span className="aw-unit">°C</span></div>
        <Chart ring={p.ring} id={s.id} slotMs={p.slotMs ?? s.t} />
        <div className="aw-prog">
          <div className="aw-prog-tile is-on">
            <span>Jetzt</span><strong>{s.rs != null ? `${f1(s.rs)}°` : '—'}</strong>
            <em><i className={hatched ? 'is-hatched' : ''} style={!hatched ? { background: ROAD_CLASS_COLOR[s.cls] } : undefined} />{ROAD_CLASS_LABEL[s.cls].short}</em>
          </div>
          {[1, 3, 6].map((h) => (
            <div key={h} className="aw-prog-tile is-off" title="Die Ableitung +1/+3/+6 h kommt erst nach bestandenem Backtest (Gate D).">
              <span>+{h} h</span><strong>—</strong><em>Prognose folgt</em>
            </div>
          ))}
        </div>
      </div>

      {p.warnState === 'ok' && warns.map((w) => (
        <div key={w.id} className="aw-card aw-warn">
          <div className="aw-eyebrow is-warn">Amtliche Warnung · DWD{w.areas[0]?.desc ? ` · ${w.areas[0].desc}` : ''}</div>
          <p className="aw-warn-text">„{w.headline}“</p>
          {w.description && <p className="aw-warn-text">„{w.description}“</p>}
          <div className="aw-warn-meta">gültig {w.onsetMs ? `ab ${hm(w.onsetMs)}` : ''}{w.expiresMs ? ` bis ${hm(w.expiresMs)}` : ' bis auf Widerruf'} · Quelle: Deutscher Wetterdienst{p.warnAt ? ` · abgerufen ${hm(p.warnAt)}` : ''}</div>
        </div>
      ))}
      {p.warnState === 'error' && (
        <p className="aw-note">Amtliche Warnungen derzeit nicht abrufbar — kein Ersatztext. Die gültigen Warnungen stehen beim{' '}
          <a href={DWD_WARNINGS_URL} target="_blank" rel="noopener noreferrer">Deutschen Wetterdienst</a>.</p>
      )}

      <div className="aw-sources">
        {s.q === 'ok' ? 'Prüfung des DWD: durchgeführt, nichts beanstandet' : 'Prüfung des DWD: nicht durchgeführt (DWD-Flag)'} · Plausibilität buscosun: bestanden
        {s.f?.includes('noCatalog') ? ' · Position aus der Meldung (nicht im DWD-Stationskatalog)' : ''}<br />
        Datenbasis: Deutscher Wetterdienst, Glättemeldeanlagen der Länder (SWIS) · GeoNutzV · verändert: geprüft, umkodiert
      </div>
    </>
  );
}

function StreckeTab(p: Props) {
  const c = p.corridor;
  if (p.noData) return <div className="aw-empty"><strong>Derzeit keine Messdaten.</strong> {p.noData}</div>;
  if (!c || p.slotMs == null) return <div className="aw-empty">Eine Autobahn im Dock wählen.</div>;
  const ends = corridorEnds(c, p.dir);
  const slot15 = Math.ceil(p.nowMs / 900_000) * 900_000;
  const departMs = slot15 + p.departOffsetMin * 60_000;
  const rows = etaRows(c, p.byId, p.dir, departMs, p.slotMs);
  const measured = rows.filter((r) => r.point?.rs != null);
  const coldest = measured.reduce<typeof rows[number] | null>((a, b) => (!a || (b.point!.rs as number) < (a.point!.rs as number) ? b : a), null);
  const crit = rows.filter((r) => r.point && isCritical(r.point.cls)).length;
  const border = c.borders.find((b) => b.km > 0 && b.km >= c.lengthKm - 0.5) ?? c.borders[0];
  return (
    <>
      <div className="aw-card">
        <div className="aw-eyebrow is-accent">Strecken-Briefing</div>
        <h2 className="aw-station-name is-small">{ends.from} → {ends.to}</h2>
        <div className="aw-station-sub">{c.shields.join(' · ')} · {dec(c.lengthKm, 0)} km · DE</div>
        <div className="aw-depart">
          <span>Abfahrt</span>
          <button type="button" aria-label="30 Minuten früher" disabled={p.departOffsetMin <= 0} onClick={() => p.onDepart(-30)}>−</button>
          <strong>{hm(departMs)}</strong>
          <button type="button" aria-label="30 Minuten später" disabled={p.departOffsetMin >= 345} onClick={() => p.onDepart(30)}>+</button>
          <span className="aw-count">Ø {DEFAULT_SPEED_KMH} km/h</span>
        </div>
        <div className="aw-brief">
          {coldest ? `Kälteste Messung: ${coldest.name} ${f1(coldest.point!.rs as number)} °C (${hm(coldest.point!.t)}). ` : 'Keine gültige Fahrbahnmessung auf diesem Abschnitt. '}
          {`${crit} von ${rows.length} Messpunkten mit Glätte oder Frostgefahr gemessen.`}
          {border ? ` Ab km ${dec(kmIn(c, border.km, p.dir), 0)} (Grenze ${border.country}) keine offene Fahrbahnmessung.` : ''}
        </div>
      </div>
      <div className="aw-card aw-table">
        <div className="aw-table-head"><span>km</span><span>Messpunkt</span><span>an</span><span>Zustand</span></div>
        {rows.map((r) => {
          const cls = r.point?.cls ?? 'nodata';
          const hatched = isHatched(cls);
          return (
            <button key={r.id} type="button" className="aw-table-row" onClick={() => p.onPick(r.id)}>
              <span className="aw-mono">{dec(r.km, 0)}</span>
              <span className="aw-table-name"><strong>{r.name}</strong><em>{r.point?.rs != null ? `Fahrbahn ${f1(r.point.rs)} °C · gemessen ${hm(r.point.t)}` : 'keine gültige Fahrbahnmessung'}</em></span>
              <span>{hm(r.etaMs)}</span>
              <span className={`aw-table-chip${hatched ? ' is-hatched' : ''}${r.measuredAtArrival ? '' : ' is-later'}`}
                style={!hatched ? (r.measuredAtArrival ? { background: ROAD_CLASS_COLOR[cls], color: ROAD_CLASS_INK[cls] } : { borderColor: ROAD_CLASS_COLOR[cls] }) : undefined}
                title={r.measuredAtArrival ? 'Messung gilt bis +30 min' : 'Ankunft später als 30 min nach der Messung — gezeigt ist die Messung, keine Ableitung'}>
                {ROAD_CLASS_LABEL[cls].short}
              </span>
            </button>
          );
        })}
      </div>
      <p className="aw-note">Zustand zur Ankunftszeit: bis +30 min die Messung; später zeigt die Tabelle weiter die Messung (umrandet), eine Ableitung aus buscosun Fusion folgt erst nach dem Backtest. Zwischen zwei Messpunkten kann die Fahrbahn anders sein.</p>
    </>
  );
}

const SOURCES: ReadonlyArray<{ cc: string; name: string; what: string; status: 'aktiv' | 'geplant' | 'blockiert' }> = [
  { cc: 'DE', name: 'DWD Straßenwetter (Glättemeldeanlagen)', what: 'Fahrbahntemperatur, -zustand, Wasserfilm, Luft, Sicht · 15 min · GeoNutzV', status: 'aktiv' },
  { cc: 'DE', name: 'DWD Warnungen (CAP)', what: 'Glätte, Glatteis, Nebel, Sturm · wörtlich zitiert', status: 'aktiv' },
  { cc: 'DE', name: 'BKG DLM250', what: 'Autobahnachsen der Korridore · © GeoBasis-DE / BKG, dl-de/by-2.0', status: 'aktiv' },
  { cc: 'DACH', name: 'GeoNames', what: 'Ortsnamen der Korridore (Anfang, Ende, Städte) · geonames.org, CC BY 4.0', status: 'aktiv' },
  { cc: 'DACH', name: 'buscosun Fusion', what: 'Ableitung +1/+3/+6 h je Messpunkt — erst nach bestandenem Backtest', status: 'geplant' },
  { cc: 'AT', name: 'GeoSphere TAWES + Warnungen', what: 'Luft, 5-cm- und Bodentemperatur als Anker der Prognosepunkte · CC BY 4.0', status: 'geplant' },
  { cc: 'CH', name: 'MeteoSchweiz SwissMetNet', what: 'Luft, 5-cm- und Bodentemperatur als Anker der Prognosepunkte · CC BY 4.0', status: 'geplant' },
  { cc: 'DE', name: 'Autobahn GmbH API', what: 'Sperrungen, Baustellen, Webcams · keine Lizenz angegeben', status: 'blockiert' },
  { cc: 'AT', name: 'ASFINAG Content Portal', what: 'Verkehrsmeldungen · Registrierung nötig, Zusatzpflichten', status: 'blockiert' },
  { cc: 'CH', name: 'ASTRA Strassenwetter / Traffic Situations', what: 'nicht offen · API-Key, Weitergabeverbot', status: 'blockiert' },
];

function QuellenTab() {
  return (
    <>
      <div className="aw-eyebrow aw-sources-title">Quellen dieser Ansicht</div>
      <div className="aw-source-list">
        {SOURCES.map((s) => (
          <div key={s.name} className={`aw-source is-${s.status}`}>
            <span className="aw-source-cc">{s.cc}</span>
            <span className="aw-source-body"><strong>{s.name}</strong><span>{s.what}</span></span>
            <span className="aw-source-status">{s.status}</span>
          </div>
        ))}
      </div>
      <div className="aw-box is-frost">
        <strong>Verkehrslage nur als Link:</strong>{' '}
        <a href="https://www.autobahn.de/" target="_blank" rel="noopener noreferrer">Autobahn GmbH</a> · <a href="https://www.asfinag.at/" target="_blank" rel="noopener noreferrer">ASFINAG</a> · <a href="https://www.astra.admin.ch/" target="_blank" rel="noopener noreferrer">ASTRA</a>. Blockierte Quellen bleiben sichtbar, werden aber nicht umgangen.
      </div>
    </>
  );
}
