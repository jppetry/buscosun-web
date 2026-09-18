/**
 * PointForecastBands.tsx — buscosun Fusion auf dem Punkt-Cube im Punkt-Panel (Phase FI, AP11).
 *
 * Nur hinter `?pf=cube`: `PointForecastPanel` lädt diese Datei per `React.lazy` (eigener Chunk mit eigenem CSS),
 * ohne den Schalter kommt sie nie auf den Draht. Gezeigt wird `PointForecastV2` (Plan §2) so, wie es ist:
 *   • je Stunde der Median mit dem Band p10–p90 auf EINER Skala je Größe (Stunden sind vergleichbar),
 *   • σ-Art (PAP 6), Konfidenz mit ihren drei Faktoren (kein Wahrscheinlichkeitsmaß, V-PV-02),
 *   • Member mit Gewicht, Lauf und Alter, Flags je Schritt,
 *   • der Klimatologie-Schwanz jenseits der Modelle abgesetzt, interpolierte Stunden gestrichelt,
 *   • jede Setzung (`set`) sichtbar: „vorläufige Bandbreite", die Liste der Setzungen im Herkunftsblock.
 * Nichts wird geglättet oder aufgefüllt: eine fehlende Zahl ist ein „—", ein fehlender Teil steht mit Grund da.
 */
import { useMemo, useState } from 'react';
import type { PointForecast } from './types';
import type { PointForecastV2, StepV2, VarV2, VarIdV2, MemberV2 } from './fusion/output';
import './pointForecastBands.css';

type VarKey = Extract<VarIdV2, 't2m' | 'wind' | 'gust' | 'precip' | 'clct' | 'td2m'>;
const VARS: ReadonlyArray<{ id: VarKey; label: string; digits: number }> = [
  { id: 't2m', label: 'Temperatur', digits: 1 },
  { id: 'wind', label: 'Wind', digits: 1 },
  { id: 'gust', label: 'Böe', digits: 1 },
  { id: 'precip', label: 'Regen', digits: 1 },
  { id: 'clct', label: 'Wolken', digits: 0 },
  { id: 'td2m', label: 'Taupunkt', digits: 1 },
];

/** Einheit aus dem Produkt (`provenance.units`, wie im Cube-Manifest) — nur die Schreibweise wird lesbar gemacht. */
const UNIT_TEXT: Record<string, string> = { degC: '°C', pct: '%', 'm/s': 'm/s', 'mm/h': 'mm/h', hPa: 'hPa', m: 'm', deg: '°', '1': '' };

const FLAG_TEXT: Record<string, { short: string; long: string }> = {
  interpolated: { short: 'interpoliert', long: 'kein nativer Schritt: die Quantile der Nachbarschritte linear verbunden (Setzung), keine eigene Verteilung' },
  stationOnly: { short: 'nur Station', long: 'kein Cube-Schritt zu dieser Stunde — das Stationsprodukt (MOSMIX) vertritt den Punkt allein' },
  climatologyOnly: { short: 'Klimatologie', long: 'kein Modell trägt mehr — die Verteilung IST der Klimatologie-Prior' },
  seam: { short: 'Naht', long: 'Wechsel der Cube-Stufe (t1→t2 oder t2→t3) — der Sprung wird nicht geglättet (R7)' },
  nowcastFallbackModel: { short: 'Modell statt Radar', long: 'das Radar deckt den Punkt, trug diese Stunde aber nicht (Frist, Sonde, Frame) — Niederschlag aus dem Modell' },
  stale: { short: 'Radar alt', long: 'der Radar-Slot ist älter als 60 min' },
  nowcastSaturated: { short: 'Radar gesättigt', long: 'Radarwert am oberen Rand der Skala' },
  anchored: { short: 'Anker', long: 'die Stationsmessung verschiebt die ersten Stunden (Innovations-Persistenz, klingt ab)' },
  inversionBody: { short: 'Inversion', long: 'der Punkt liegt in der Inversionsschicht des Modells (PAP 4, Fall B)' },
  stdLapseFallback: { short: 'Standard-Lapse', long: 'kein Profil in dieser Stufe (t2/t3): Höhenkorrektur mit 6,5 K/km' },
  extrapolatedBelowModel: { short: 'unter Modellfläche', long: 'der Punkt liegt unter der Modelloberfläche — die Korrektur extrapoliert (PAP 4)' },
  belowGround925: { short: '925 hPa unter Grund', long: 'die 925-hPa-Fläche liegt unter der Modelloberfläche (extrapolierter Wert im Cube)' },
  noTerrain: { short: 'ohne Gelände', long: 'Gelände fehlte — keine Verteilungen, nur Zellwerte' },
  chunkBorderTruncated: { short: 'Chunk-Rand', long: 'am Rand des 16×16-Blocks fehlen Nachbarzellen (PAP 3 einseitig)' },
};

const SIGMA_TEXT: Record<string, string> = {
  ensemble: 'Ensemble', divergence: 'Modellstreuung', 'sys-only': 'nur Sockel', set: 'Setzung', derived: 'abgeleitet', none: 'ohne Verteilung',
};

const PRODUCT_TEXT: Record<string, string> = {
  'cube-t1': 'Cube t1', 'cube-t2': 'Cube t2', 'cube-t3': 'Cube t3', station: 'Station', nowcast: 'Radar', anchor: 'Anker', climatology: 'Klimatologie',
};

const pad2 = (n: number) => String(n).padStart(2, '0');
const hourText = (ms: number) => { const d = new Date(ms); return `${pad2(d.getHours())}:00`; };
const dayText = (ms: number) => new Date(ms).toLocaleDateString('de-DE', { weekday: 'short', day: '2-digit', month: '2-digit' });
const num = (v: number | null | undefined, digits: number) => (v == null || !Number.isFinite(v) ? '—' : v.toFixed(digits).replace('.', ','));
const pct = (v: number | null | undefined) => (v == null || !Number.isFinite(v) ? '—' : `${Math.round(v * 100)} %`);

interface Emission { kind: string | null; ms: number; hours: number; pending: string[] }

interface Props {
  data: PointForecast;
}

interface CubeBlock {
  v2?: PointForecastV2;
  emission?: string;
  pending?: string[];
  timing?: { readMs?: number; coreMs?: number; firstMs?: number | null; algoMs?: number; outputMs?: number; totalMs?: number; doneAt?: Record<string, number> };
  stats?: { files?: number; bytes?: number; misses?: number; fallbacks?: number; retries?: number };
  notes?: string[];
  skips?: string[];
  errors?: string[];
}

export default function PointForecastBands({ data }: Props) {
  const cube = (data.cube ?? null) as CubeBlock | null;
  const v2 = cube?.v2 ?? null;
  const [varId, setVarId] = useState<VarKey>('t2m');
  const [open, setOpen] = useState<number | null>(null);
  const meta = VARS.find((v) => v.id === varId)!;
  const unit = UNIT_TEXT[v2?.provenance.units[varId] ?? ''] ?? v2?.provenance.units[varId] ?? '';

  // EINE Skala je Größe über alle Stunden — ein Band ist nur neben einem anderen lesbar, wenn beide dieselbe Achse haben.
  const scale = useMemo(() => {
    if (!v2) return null;
    let lo = Infinity, hi = -Infinity;
    for (const s of v2.axis.steps) {
      const v = s.vars[varId];
      if (!v) continue;
      for (const x of [v.p10, v.p50, v.p90]) if (x != null && Number.isFinite(x)) { lo = Math.min(lo, x); hi = Math.max(hi, x); }
    }
    if (!Number.isFinite(lo) || !Number.isFinite(hi)) return null;
    if (hi - lo < 1e-6) { lo -= 1; hi += 1; }
    return { lo, hi };
  }, [v2, varId]);

  if (!v2) {
    return <div className="pfb-root"><p className="pfb-empty">Kein v2-Produkt in dieser Antwort — der Cube-Pfad lieferte nur die Altfelder.</p></div>;
  }

  const pending = cube?.pending ?? [];
  const tiersPending = pending.filter((p) => /^t[123]$/.test(p));
  const hasSet = v2.provenance.calib.some((c) => /:set\b/.test(c));
  const stationHeight = v2.provenance.calib.find((c) => c.startsWith('hTrue:station')) ?? null;
  const steps = v2.axis.steps;
  const firstClima = steps.findIndex((s) => s.flags.includes('climatologyOnly') || s.tier === 'clima');
  const x = (v: number | null) => (scale && v != null && Number.isFinite(v) ? ((v - scale.lo) / (scale.hi - scale.lo)) * 100 : null);

  return (
    <div className="pfb-root">
      <div className="pfb-head">
        <span className="pfb-badge">buscosun Fusion · Cube · Test</span>
        {hasSet && <span className="pfb-badge pfb-badge-set" title="Die Bandbreiten beruhen auf Setzungen, bis das Archiv sie kalibriert (AP10).">vorläufige Bandbreite</span>}
        {tiersPending.length > 0 && <span className="pfb-badge pfb-badge-wait">erste Darstellung · {tiersPending.join('/')} folgen</span>}
        {pending.includes('anchor') && <span className="pfb-badge pfb-badge-wait">Anker folgt</span>}
        {pending.includes('nowcast') && <span className="pfb-badge pfb-badge-wait">Radar folgt</span>}
        {pending.includes('z0') && <span className="pfb-badge pfb-badge-wait" title="Rauhigkeit aus WorldCover (V-FI-17) — die zweistufige Windkorrektur kommt mit ihr">Windkorrektur folgt</span>}
      </div>

      <div className="pfb-vars" role="tablist" aria-label="Größe">
        {VARS.map((v) => (
          <button key={v.id} type="button" role="tab" aria-selected={varId === v.id} className={varId === v.id ? 'is-active' : ''} onClick={() => { setVarId(v.id); setOpen(null); }}>
            {v.label}
          </button>
        ))}
      </div>

      {scale && (
        <div className="pfb-axis" aria-hidden="true">
          <span>{num(scale.lo, meta.digits)} {unit}</span>
          <span className="pfb-axis-mid">p10 ─ p50 ─ p90</span>
          <span>{num(scale.hi, meta.digits)} {unit}</span>
        </div>
      )}

      <ol className="pfb-list">
        {steps.map((s, i) => {
          const v = s.vars[varId];
          const newDay = i === 0 || new Date(s.validAtMs).getDate() !== new Date(steps[i - 1].validAtMs).getDate();
          const clima = s.flags.includes('climatologyOnly') || s.tier === 'clima';
          const expanded = open === i;
          const l = x(v?.p10 ?? null), m = x(v?.p50 ?? null), r = x(v?.p90 ?? null);
          const flags = s.flags.filter((f) => f !== 'climatologyOnly' || !clima);
          return (
            <li key={s.validAtMs} className="pfb-item">
              {newDay && <div className="pfb-day">{dayText(s.validAtMs)}</div>}
              {i === firstClima && (
                <div className="pfb-tail-rule" role="note">Ab hier trägt kein Modell mehr — nur die Klimatologie (Prior), keine Vorhersage im engeren Sinn.</div>
              )}
              <button
                type="button"
                className={`pfb-row${clima ? ' is-clima' : ''}${s.interpolated ? ' is-interp' : ''}${expanded ? ' is-open' : ''}`}
                aria-expanded={expanded}
                onClick={() => setOpen(expanded ? null : i)}
              >
                <span className="pfb-time">{hourText(s.validAtMs)}</span>
                <span className="pfb-band" aria-label={v ? `p10 ${num(v.p10, meta.digits)}, p50 ${num(v.p50, meta.digits)}, p90 ${num(v.p90, meta.digits)} ${unit}` : 'kein Wert'}>
                  {l != null && r != null && <span className="pfb-band-range" style={{ left: `${l}%`, width: `${Math.max(0.8, r - l)}%` }} />}
                  {m != null && <span className="pfb-band-mid" style={{ left: `${m}%` }} />}
                </span>
                <span className="pfb-val">{num(v?.p50, meta.digits)}</span>
                <span className="pfb-conf" title="Konfidenz-Index 0–100 (kein Wahrscheinlichkeitsmaß)">{v?.confidence ? Math.round(v.confidence.score * 100) : '—'}</span>
                {flags.length > 0 && (
                  <span className="pfb-flags">
                    {flags.map((f) => <span key={f} className={`pfb-flag pfb-flag-${f}`}>{FLAG_TEXT[f]?.short ?? f}</span>)}
                  </span>
                )}
              </button>
              {expanded && <StepDetail step={s} v={v} digits={meta.digits} unit={unit} />}
            </li>
          );
        })}
      </ol>

      <details className="pfb-prov">
        <summary>Herkunft und Setzungen</summary>
        <Provenance v2={v2} stationHeight={stationHeight} />
      </details>

      <div className="pfb-legend">
        <span className="eyebrow">Lesehilfe</span>
        <p>Balken = Band p10–p90, Strich = Median (p50), alle Stunden auf derselben Skala. Zahl rechts = Konfidenz-Index 0–100: das Produkt aus Schärfe gegen die Klimatologie, Einigkeit der Quellen und Abschlägen für die Lage — <strong>kein Wahrscheinlichkeitsmaß</strong>. Gestrichelt = interpoliert, blass = nur Klimatologie. Tippen zeigt Member, Gewichte und Faktoren.</p>
      </div>

    </div>
  );
}

function StepDetail({ step, v, digits, unit }: { step: StepV2; v: VarV2 | null; digits: number; unit: string }) {
  return (
    <div className="pfb-detail">
      {v ? (
        <dl className="pfb-kv">
          <div><dt>p10 / p50 / p90</dt><dd>{num(v.p10, digits)} / {num(v.p50, digits)} / {num(v.p90, digits)} {unit}</dd></div>
          <div><dt>Mittel · σ</dt><dd>{num(v.mean, digits)} · {num(v.sigma, digits)} {unit}</dd></div>
          <div><dt>σ-Art</dt><dd>{SIGMA_TEXT[v.sigmaKind] ?? v.sigmaKind}{v.dist ? ` · ${v.dist.kind}` : ''}</dd></div>
          <div><dt>Konfidenz</dt><dd>{v.confidence ? `${pct(v.confidence.score)} (Schärfe ${pct(v.confidence.spread)} · Einigkeit ${pct(v.confidence.agree)} · Lage ${pct(v.confidence.lage)})` : '—'}</dd></div>
          {v.calib.length > 0 && <div><dt>Setzungen hier</dt><dd>{v.calib.join(', ')}</dd></div>}
        </dl>
      ) : <p className="pfb-empty">Diese Größe trägt der Schritt nicht.</p>}
      {v && v.members.length > 0 && (
        <table className="pfb-members">
          <thead><tr><th>Member</th><th>Gewicht</th><th>Wert</th><th>Lauf · Alter</th></tr></thead>
          <tbody>
            {v.members.map((m) => {
              const d: MemberV2 | undefined = step.members.find((x) => x.tag === m.tag);
              return (
                <tr key={m.tag}>
                  <td>{PRODUCT_TEXT[d?.product ?? ''] ?? m.tag}{d?.station ? ` ${d.station.name} (${num(d.station.distKm, 1)} km)` : ''}{d?.product === 'nowcast' && d.nowcast ? ` ${d.nowcast.source}` : ''}</td>
                  <td>{m.weight == null ? '—' : m.tag === 'climatology' ? `${pct(m.weight)} (1 − β)` : pct(m.weight)}</td>
                  <td>{num(m.value, digits)}</td>
                  <td>{d?.run ?? '—'}{d?.ageH != null ? ` · ${num(d.ageH, 1)} h` : ''}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
      {v && v.members.some((m) => m.tag === 'climatology' && m.weight != null && m.weight < 1) && (
        <p className="pfb-empty">Zwei Ebenen: die Gewichte der Quellen teilen die Modellkombination unter sich auf (zusammen 100 %); diese Kombination geht mit β in die Antwort ein, die Klimatologie mit 1 − β.</p>
      )}
      {step.flags.length > 0 && (
        <ul className="pfb-flaglist">
          {step.flags.map((f) => <li key={f}><strong>{FLAG_TEXT[f]?.short ?? f}</strong> — {FLAG_TEXT[f]?.long ?? 'ohne Beschreibung'}</li>)}
        </ul>
      )}
    </div>
  );
}

function Provenance({ v2, stationHeight }: { v2: PointForecastV2; stationHeight: string | null }) {
  const runs = (['t1', 't2', 't3'] as const).map((t) => [t, v2.provenance.runs[t]] as const).filter(([, r]) => !!r);
  const st = v2.provenance.runs.stations;
  return (
    <div className="pfb-prov-body">
      <dl className="pfb-kv">
        <div><dt>Punkthöhe</dt><dd>{v2.point.hTrue == null ? '—' : `${Math.round(v2.point.hTrue)} m`}{stationHeight ? ' · Stationshöhe (Punkt ≤ 250 m an der Station, E-F-12)' : ''}</dd></div>
        {v2.point.terrain && <div><dt>Gelände</dt><dd>TPI 500 m {num(v2.point.terrain.tpi500, 0)} m · TPI 2 km {num(v2.point.terrain.tpi2000, 0)} m · SVF {num(v2.point.terrain.svf, 2)}{v2.point.terrain.z0 != null ? ` · z0 ${String(Number(v2.point.terrain.z0.toPrecision(2))).replace('.', ',')} m (WorldCover, 500-m-Kreis)` : ''}</dd></div>}
        {runs.map(([t, r]) => <div key={t}><dt>Lauf {t}</dt><dd>{r!.run} · {num(r!.ageH, 1)} h alt · {r!.models.join(', ') || 'Quellen unbekannt'}</dd></div>)}
        {st && <div><dt>Station</dt><dd>{st.name} ({st.id}) · {num(st.distKm, 1)} km · Δh {st.dElevM == null ? '—' : `${Math.round(st.dElevM)} m`}</dd></div>}
        {!st && v2.provenance.stationReason && <div><dt>Station</dt><dd>{v2.provenance.stationReason}</dd></div>}
        {v2.provenance.runs.nowcast.map((n) => <div key={n.source}><dt>Radar {n.source}</dt><dd>Slot {n.stamp} · {n.ageMin} min alt · {n.frames} Frames</dd></div>)}
      </dl>
      <span className="eyebrow">Setzungen ({v2.provenance.calib.length})</span>
      <ul className="pfb-calib">
        {v2.provenance.calib.map((c) => <li key={c} className={/:set\b/.test(c) ? 'is-set' : ''}>{c}</li>)}
      </ul>
    </div>
  );
}

/** `?pflog=1`: Zeiten und Herkunft des Cube-Pfads — die Ausgaben dieses Abrufs (erste Darstellung, Kern, Nachlieferung) und das Bündel. */
export function PfLog({ data, emissions }: { data: PointForecast; emissions: Emission[] }) {
  const cube = (data.cube ?? null) as CubeBlock | null;
  const t = cube?.timing ?? {};
  const st = cube?.stats ?? {};
  // x-cache (HIT/MISS) liest der Browser nicht (CORS). Was er sieht: ob eine Datei aus dem HTTP-Cache kam (transferSize 0).
  const res = typeof performance !== 'undefined' ? performance.getEntriesByType('resource') as PerformanceResourceTiming[] : [];
  const files = res.filter((r) => /buscosun-data|elevation-tiles-prod/.test(r.name));
  const visible = files.some((r) => r.encodedBodySize > 0);
  const fromCache = files.filter((r) => r.transferSize === 0 && r.encodedBodySize > 0).length;
  return (
    <div className="pfb-log">
      <span className="eyebrow">pflog · Zeiten und Herkunft</span>
      <dl className="pfb-kv">
        <div><dt>Ausgaben</dt><dd>{emissions.map((e) => `${e.kind ?? '—'} ${e.ms} ms (${e.hours} h${e.pending.length ? `, offen ${e.pending.join('+')}` : ''})`).join(' · ') || '—'}</dd></div>
        <div><dt>Lesen · Kern · erste</dt><dd>{t.readMs ?? '—'} · {t.coreMs ?? '—'} · {t.firstMs ?? '—'} ms</dd></div>
        <div><dt>Rechnung · Ausgabe · gesamt</dt><dd>{t.algoMs ?? '—'} · {t.outputMs ?? '—'} · {t.totalMs ?? '—'} ms</dd></div>
        <div><dt>fertig je Produkt</dt><dd>{Object.entries(t.doneAt ?? {}).map(([k, v]) => `${k} ${v}`).join(' · ') || '—'}</dd></div>
        <div><dt>Netz</dt><dd>{st.files ?? '—'} Dateien · {st.bytes != null ? `${Math.round(st.bytes / 1024)} KB` : '—'} · Ausweichwege {st.fallbacks ?? 0} · 404 {st.misses ?? 0}</dd></div>
        <div><dt>Browser-Cache</dt><dd>{visible ? `${fromCache} von ${files.length} Dateien aus dem HTTP-Cache` : 'nicht messbar (keine Timing-Freigabe)'} · x-cache im Browser nicht lesbar</dd></div>
      </dl>
      {(cube?.skips?.length ?? 0) > 0 && <details><summary>Fehlt ({cube!.skips!.length})</summary><ul>{cube!.skips!.map((s) => <li key={s}>{s}</li>)}</ul></details>}
      {(cube?.notes?.length ?? 0) > 0 && <details><summary>Notizen ({cube!.notes!.length})</summary><ul>{cube!.notes!.map((s) => <li key={s}>{s}</li>)}</ul></details>}
      {(cube?.errors?.length ?? 0) > 0 && <details open><summary>Fehler ({cube!.errors!.length})</summary><ul>{cube!.errors!.map((s) => <li key={s}>{s}</li>)}</ul></details>}
    </div>
  );
}
