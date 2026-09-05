/**
 * Reiter „Thermalanomalien" (TA4) — die Standorte persistenter Wärmequellen, verbunden mit
 * den Brand-Einträgen des angezeigten Fensters.
 *
 * Eine Zeile je Standort aus `public/fire/ta/thermal-sites-v1.json` (Batch aus dem FIRMS-
 * Archiv 2020–2026 + E-PRTR/MaStR/BFE). Liegt im Fenster ein Eintrag auf dem Standort
 * (`record.anomaly`), trägt die Zeile sein Abzeichen: **ANLAGE** (passt zum Muster) oder
 * **ABWEICHUNG** (weicht ab — steht zusätzlich im Reiter „Brände"). Ohne Eintrag: „im Fenster
 * kein Signal" — das ist eine Beobachtungslücke, keine Stilllegung.
 *
 * Eigene Komponente mit denselben Klassen wie `FireFootprintPanel` (`.br-firelist`, `.br-fire`,
 * `.br-chip`, `.br-more`, `.br-detail`) — keine Änderung dort. Deckel wie V-246: `CLUSTER_PAGE`.
 */
import { useMemo, useState } from 'react';
import type { FireRecord } from './footprint/fireRegistry';
import { CLUSTER_PAGE } from './fireClusters';
import {
  SITE_CLASS_LABEL, FACILITY_KIND_LABEL, type ThermalSitesIndex, type ThermalSite, type SiteClass,
} from './anomaly/thermalSites';
import { siteYearsLabel } from './anomaly/classify';
import { BR_BADGE_LABEL } from './brandradarMeta';

export type AnomalySort = 'signal' | 'recency' | 'frequency' | 'name';

export interface AnomalyPanelProps {
  inSheet: boolean;
  compact?: boolean;
  sites: ThermalSitesIndex | null;
  /** Alle Einträge des Fensters (VOR dem Brandlisten-Filter) — die Verbindung läuft über `anomaly.siteId`. */
  records: readonly FireRecord[];
  nowMs: number;
  windowH: number;
  selectedSiteId: string | null;
  onSelectSite: (siteId: string, recordId: string | null) => void;
  onClearSelect: () => void;
  onHover: (recordId: string | null) => void;
  /** Wie viele `site`-Einträge der Filter gerade aus der Brandliste nimmt — und der Schalter dafür. */
  hiddenFromFires: number;
  sitesShownInFires: boolean;
  onToggleSitesInFires: () => void;
  onClose?: () => void;
  /** Ist die Liste abgeschaltet (`?ta=0`) oder nicht geladen? */
  disabled: boolean;
}

const COUNTRY_LABEL: Record<string, string> = { DE: 'Deutschland', AT: 'Österreich', CH: 'Schweiz', outside: 'außerhalb DACH' };
const fmtDate = (ms: number | null): string =>
  ms == null ? '—' : new Date(ms).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
const fmtStamp = (ms: number | null): string =>
  ms == null ? '—' : new Date(ms).toLocaleString('de-DE', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
const de = (n: number, frac = 0) => n.toLocaleString('de-DE', { maximumFractionDigits: frac });

/** Tage je Archivjahr im Mittel — nur über Jahre mit Signal. */
function daysPerYear(s: ThermalSite): number {
  const ys = Object.values(s.stats.years);
  return ys.length ? ys.reduce((a, b) => a + b, 0) / ys.length : 0;
}
export function siteName(s: ThermalSite): string {
  if (s.facility?.name) return s.facility.name;
  if (s.place) return `${SITE_CLASS_LABEL[s.cls]} bei ${s.place}`;
  return `${SITE_CLASS_LABEL[s.cls]} ${s.lat.toFixed(2)} / ${s.lon.toFixed(2)}`;
}

interface Row { site: ThermalSite; rec: FireRecord | null }

export function FireAnomalyPanel(p: AnomalyPanelProps) {
  const [sort, setSort] = useState<AnomalySort>('signal');
  const [classes, setClasses] = useState<Set<SiteClass>>(new Set(['A', 'B', 'C']));
  const [liveOnly, setLiveOnly] = useState(false);
  const [shown, setShown] = useState(CLUSTER_PAGE);

  const byRecord = useMemo(() => {
    const m = new Map<string, FireRecord>();
    for (const r of p.records) {
      if (!r.anomaly) continue;
      const cur = m.get(r.anomaly.siteId);
      // Bei mehreren Einträgen je Standort der mit den meisten Detektionen; Abweichung gewinnt.
      if (!cur || (r.anomaly.kind === 'site-deviating' && cur.anomaly?.kind !== 'site-deviating') || (r.hotspots ?? 0) > (cur.hotspots ?? 0)) m.set(r.anomaly.siteId, r);
    }
    return m;
  }, [p.records]);

  const rows = useMemo<Row[]>(() => {
    if (!p.sites) return [];
    const all: Row[] = p.sites.sites.map((site) => ({ site, rec: byRecord.get(site.id) ?? null }));
    const f = all.filter((r) => classes.has(r.site.cls) && (!liveOnly || r.rec));
    const live = (r: Row) => r.rec?.frpSumMw ?? -1;
    const recency = (r: Row) => r.rec?.lastMs ?? r.site.stats.lastMs ?? -Infinity;
    const name = (r: Row) => siteName(r.site);
    if (sort === 'signal') f.sort((a, b) => live(b) - live(a) || recency(b) - recency(a) || a.site.id.localeCompare(b.site.id));
    else if (sort === 'recency') f.sort((a, b) => recency(b) - recency(a) || a.site.id.localeCompare(b.site.id));
    else if (sort === 'frequency') f.sort((a, b) => daysPerYear(b.site) - daysPerYear(a.site) || a.site.id.localeCompare(b.site.id));
    else f.sort((a, b) => name(a).localeCompare(name(b), 'de'));
    return f;
  }, [p.sites, byRecord, classes, liveOnly, sort]);

  const liveCount = byRecord.size;
  const list = rows.slice(0, shown);
  const remaining = Math.max(0, rows.length - shown);
  const total = p.sites?.sites.length ?? 0;

  const SORTS: readonly { id: AnomalySort; label: string; title: string }[] = [
    { id: 'signal', label: 'Signal', title: 'Summe der Feuerstrahlungsleistung im Fenster — Standorte ohne Signal stehen hinten.' },
    { id: 'recency', label: 'Aktualität', title: 'Letzte Detektion — im Fenster, sonst im Archiv.' },
    { id: 'frequency', label: 'Häufigkeit', title: 'Mittlere Detektionstage je Archivjahr.' },
    { id: 'name', label: 'Name', title: 'Anlagenname, sonst Ort.' },
  ];
  const toggleClass = (c: SiteClass) => setClasses((prev) => { const n = new Set(prev); if (n.has(c)) n.delete(c); else n.add(c); return n; });

  return (
    <div className={`br-fires br-anomalies${p.inSheet ? ' is-sheet' : ''}`}>
      {!p.inSheet && (
        <div className="br-fires-head">
          <span className="br-eyebrow">Thermalanomalien · Archiv 2020–2026 + {p.windowH >= 168 ? '7-Tage' : '24-h'}-Fenster</span>
          <span className="br-fires-count">
            {!p.sites ? '—' : rows.length === total ? `${Math.min(shown, rows.length)} von ${total} gezeigt` : `${rows.length} von ${total} gefiltert · ${Math.min(shown, rows.length)} gezeigt`}
          </span>
        </div>
      )}

      {p.disabled && <p className="br-empty">Die Standortliste ist abgeschaltet (<code>?ta=0</code>) — die Brandliste verhält sich wie vor TA.</p>}
      {!p.disabled && !p.sites && <p className="br-empty">Standortliste wird geladen … (statische Datei, einmal je Sitzung)</p>}

      <div className="br-chiprow" role="group" aria-label="Sortierung">
        {!p.inSheet && <span className="br-chiprow-lbl">Sortieren:</span>}
        {SORTS.map((s) => (
          <button key={s.id} type="button" className={`br-chip is-red${sort === s.id ? ' is-active' : ''}`} aria-pressed={sort === s.id} title={s.title} onClick={() => setSort(s.id)}>
            {s.label}
          </button>
        ))}
      </div>
      <div className="br-chiprow" role="group" aria-label="Klassen">
        {!p.inSheet && <span className="br-chiprow-lbl">Klasse:</span>}
        {(['A', 'B', 'C'] as const).map((c) => (
          <button key={c} type="button" className={`br-chip is-ink${classes.has(c) ? ' is-active' : ''}`} aria-pressed={classes.has(c)} title={SITE_CLASS_LABEL[c]} onClick={() => toggleClass(c)}>
            {c} · {SITE_CLASS_LABEL[c]}
          </button>
        ))}
        <button type="button" className={`br-chip is-ghost${liveOnly ? ' is-active' : ''}`} aria-pressed={liveOnly} onClick={() => setLiveOnly((v) => !v)}>
          nur mit Signal im Fenster{liveCount > 0 ? ` · ${liveCount}` : ''}
        </button>
      </div>

      <p className="br-note">
        {p.hiddenFromFires > 0
          ? `${p.hiddenFromFires} ${p.hiddenFromFires === 1 ? 'Eintrag' : 'Einträge'} mit Anlagenmuster ${p.sitesShownInFires ? 'stehen grau auch' : 'stehen nicht'} in der Brandliste. `
          : 'Kein Eintrag des Fensters passt zum Anlagenmuster. '}
        <button type="button" className="br-link" onClick={p.onToggleSitesInFires}>
          {p.sitesShownInFires ? 'In der Brandliste ausblenden' : 'In der Brandliste grau einblenden'}
        </button>
      </p>

      {p.sites && rows.length === 0 && <p className="br-empty">Kein Standort entspricht der Auswahl — die Klassen-Chips oder „nur mit Signal" zurücksetzen.</p>}

      <ol className="br-firelist">
        {list.map(({ site, rec }) => {
          const sel = p.selectedSiteId === site.id;
          const badge = rec?.anomaly?.kind ?? null;
          const kind = site.facility ? FACILITY_KIND_LABEL[site.facility.kind] : SITE_CLASS_LABEL[site.cls];
          return (
            <li key={site.id}>
              <div
                data-site={site.id}
                className={`br-fire fire-fprow is-site-row is-cls-${site.cls}${sel ? ' is-sel' : ''}${badge === 'site' ? ' is-static' : ''}`}
                onMouseEnter={() => p.onHover(rec?.id ?? null)}
                onMouseLeave={() => p.onHover(null)}
              >
                <button
                  type="button" className="br-fire-btn"
                  aria-pressed={sel}
                  aria-label={`${siteName(site)} ${sel ? 'abwählen' : 'markieren'}`}
                  onClick={() => (sel ? p.onClearSelect() : p.onSelectSite(site.id, rec?.id ?? null))}
                >
                  <span className="br-fire-top">
                    <span className="br-fire-name">{siteName(site)}</span>
                    {badge && <span className={`br-badge is-${badge}`}>{BR_BADGE_LABEL[badge]}</span>}
                    <span className={`br-badge is-cls is-cls-${site.cls}`} title={SITE_CLASS_LABEL[site.cls]}>{site.cls}</span>
                    <span className="br-fire-region">{site.country ? COUNTRY_LABEL[site.country] ?? site.country : '—'}</span>
                  </span>
                  <span className="br-fire-line">
                    {kind}
                    {site.facility?.source && <> · {site.facility.source === 'eprtr' ? 'E-PRTR' : site.facility.source === 'mastr' ? 'MaStR' : 'BFE'}, {site.facility.distanceM} m</>}
                    {site.place && site.facility && <> · {site.place}</>}
                  </span>
                  <span className="br-fire-meta">
                    Ø {de(daysPerYear(site))} Tage/Jahr · {siteYearsLabel(site).replace('Signal in ', '')} · zuletzt {fmtDate(site.stats.lastMs)} (Archiv)
                    {rec
                      ? <> · im Fenster: {rec.hotspots ?? 0} Detektionen{rec.frpSumMw != null ? `, ΣFRP ${de(rec.frpSumMw)} MW` : ''}, zuletzt {fmtStamp(rec.lastMs)}</>
                      : <> · im Fenster: kein Signal</>}
                  </span>
                  {rec?.anomaly?.kind === 'site-deviating' && (
                    <span className="br-fire-ctx">Signal weicht vom Anlagenmuster ab — der Eintrag steht als Brand im Reiter „Brände".</span>
                  )}
                </button>
              </div>
            </li>
          );
        })}
      </ol>

      {remaining > 0 && (
        <button type="button" className="br-more" onClick={() => setShown((n) => n + CLUSTER_PAGE)}>
          Weitere {Math.min(CLUSTER_PAGE, remaining)} Standorte laden
          <span className="br-more-sub"> · gezeigt {Math.min(shown, rows.length)} von {rows.length}</span>
        </button>
      )}

      <p className="br-note br-anomaly-foot">
        Standortliste aus dem FIRMS-Archiv {p.sites ? `${p.sites.file.archive.from?.slice(0, 4)}–${p.sites.file.archive.to?.slice(0, 4)}` : '2020–2026'} (≥ 2 Jahre mit je ≥ 5 Detektionstagen),
        Anlagenzuordnung per Abstand ≤ {p.sites ? de(p.sites.file.rule.joinRadiusM) : '1 500'} m zu E-PRTR (EEA, CC-BY 4.0), MaStR (DL-DE/BY-2.0) und BFE (OPEN BY) — eigene Ableitung, kein Nachweis.
        Anlagen, die nach {p.sites?.file.archive.to?.slice(0, 7) ?? '2026-05'} entstanden sind, fehlen; stillgelegte bleiben gelistet, bis die Liste neu gebaut wird.
        Klasse C („Tagessignal") ist keine Wärmequelle: nur Tagdetektionen über Jahre — Reflexion ist wahrscheinlicher.
        {p.onClose && <> <button type="button" className="br-link" onClick={p.onClose}>Zu den Layern</button></>}
      </p>
    </div>
  );
}

/**
 * BD3 (2026-09-03) — die Standort-Angaben als Dossier-Karten in der MITTE. Vorher standen sie als
 * Inline-Karte (`.br-detail`) unter der markierten Zeile; die Zeilen sind WORTGLEICH übernommen,
 * nur auf drei Karten der BD2-Form gruppiert. Beide Aufrufer teilen diesen Baustein:
 * der Standort ohne Eintrag rendert ihn allein, der Standort MIT Eintrag als `extra` im
 * Brand-Dossier — so verliert kein Fall eine Zeile.
 */
export function AnomalySiteCards({ site, rec }: { site: ThermalSite; rec: FireRecord | null }) {
  const f = site.facility;
  const years = Object.entries(site.stats.years).sort(([a], [b]) => a.localeCompare(b));
  const checks = rec?.anomaly?.checks ?? null;
  return (
    <>
      <section className="br-ds-card br-ds-einordnung" aria-label="Standort und Anlage">
        <div className="br-ds-cardhead"><span className="br-ds-eyebrow is-stone">Standort &amp; Anlage</span></div>
        <dl className="fire-fp-dl br-ds-dl">
          <dt>Kennung</dt><dd><code>{site.id}</code> · {site.cells.length} {site.cells.length === 1 ? 'Zelle' : 'Zellen'} à 0,01°</dd>
          <dt>Klasse</dt><dd>{site.cls} · {SITE_CLASS_LABEL[site.cls]}</dd>
          {f && (
            <>
              <dt>Anlage</dt>
              <dd>{f.name} — {FACILITY_KIND_LABEL[f.kind]} · {f.source === 'eprtr' ? 'EEA Industrial Reporting (E-PRTR/IED), CC-BY 4.0' : f.source === 'mastr' ? 'Marktstammdatenregister (BNetzA), DL-DE/BY-2.0' : 'BFE Elektrizitätsproduktionsanlagen, OPEN BY'} · {f.distanceM} m vom Signal{f.detail ? <> · {f.detail}</> : null}</dd>
              <dt>Betreiber</dt><dd>{f.operator ?? 'nicht in der Quelle geführt — der Anlagenname trägt oft die Firma'}</dd>
            </>
          )}
          {site.facilityAlt && <><dt>Weitere Anlage</dt><dd>{site.facilityAlt.name} ({FACILITY_KIND_LABEL[site.facilityAlt.kind]}, {site.facilityAlt.source === 'eprtr' ? 'E-PRTR' : site.facilityAlt.source === 'mastr' ? 'MaStR' : 'BFE'}, {site.facilityAlt.distanceM} m)</dd></>}
          {site.note && <><dt>Einordnung</dt><dd>{site.note}</dd></>}
          <dt>Landbedeckung</dt>
          <dd>{site.landcover === 'industrial' ? 'CORINE 2018: Industrie-/Abbau-/Deponiefläche (Plausibilität)' : site.landcover === 'other' ? 'CORINE 2018: keine Industrie-/Abbau-/Deponiefläche in der Zelle' : '—'}</dd>
          <dt>Lage</dt><dd>{site.lat.toFixed(4)} / {site.lon.toFixed(4)}{site.place ? ` · ${site.place}` : ''}</dd>
        </dl>
      </section>

      <section className="br-ds-card is-steel br-ds-wetter" aria-label="Signatur im Archiv">
        <div className="br-ds-cardhead"><span className="br-ds-eyebrow is-steel">Signatur im Archiv</span></div>
        <dl className="fire-fp-dl br-ds-dl">
          <dt>Archiv</dt>
          <dd>{de(site.stats.detections)} Detektionen an {de(site.stats.distinctDays)} Tagen · nachts {de(site.stats.nightShare * 100)} % · NASA-Kennung „statisch" bei {de(site.stats.nasaType2Share * 100)} % · zuletzt {fmtDate(site.stats.lastMs)}</dd>
          <dt>Tage je Jahr</dt>
          <dd>{years.map(([y, n]) => `${y}: ${n}`).join(' · ')}</dd>
          <dt>FRP-Muster</dt>
          <dd>{site.stats.frp.p50 != null ? `Median ${de(site.stats.frp.p50, 1)} MW · p95 ${de(site.stats.frp.p95 ?? 0, 1)} MW · max ${de(site.stats.frp.max ?? 0, 1)} MW je Pixel` : '—'}</dd>
        </dl>
      </section>

      <section className="br-ds-card br-ds-merkmale" aria-label="Im Fenster und Signaturprüfung">
        <div className="br-ds-cardhead"><span className="br-ds-eyebrow is-stone">Im Fenster &amp; Prüfung</span></div>
        <dl className="fire-fp-dl br-ds-dl">
          <dt>Im Fenster</dt>
          <dd>{rec ? <>{rec.hotspots ?? 0} Detektionen, {rec.overpasses ?? 0} Überflüge{rec.frpSumMw != null ? `, ΣFRP ${de(rec.frpSumMw)} MW` : ''} · Abzeichen {rec.anomaly ? BR_BADGE_LABEL[rec.anomaly.kind] : '—'}</> : 'kein Signal — Beobachtungslücke oder kein Betrieb, keine Aussage'}</dd>
          {checks && (
            <>
              <dt>Signaturprüfung</dt>
              <dd>
                {checks.footprint ? '✓' : '✗'} Standortraster ± 1 Zelle · {checks.growth ? '✓' : '✗'} kein Wachstum · {checks.intensity ? '✓' : '✗'} FRP im Archivrahmen · {checks.mapping ? '✓' : '✗'} keine Kartierung/EMS
              </dd>
              {rec?.anomaly?.reasons.length ? <><dt>Begründung</dt><dd><ul className="fire-fp-reasons">{rec.anomaly.reasons.map((r, i) => <li key={i}>{r}</li>)}</ul></dd></> : null}
            </>
          )}
        </dl>
      </section>
    </>
  );
}

/** Die vier Kennzahl-Kacheln des Standort-Dossiers — Form wie `historyStatTiles`. */
export function siteStatTiles(s: ThermalSite, rec: FireRecord | null): { lbl: string; val: string; sub: string }[] {
  return [
    { lbl: 'Klasse', val: s.cls, sub: SITE_CLASS_LABEL[s.cls] },
    { lbl: 'Archiv', val: de(s.stats.detections), sub: `an ${de(s.stats.distinctDays)} Tagen · ${siteYearsLabel(s)}` },
    { lbl: 'Nachtanteil', val: `${de(s.stats.nightShare * 100)} %`, sub: 'Wärmequellen laufen auch nachts' },
    rec
      ? { lbl: 'Im Fenster', val: de(rec.hotspots ?? 0), sub: `${de(rec.overpasses ?? 0)} Überflüge · ${rec.anomaly ? BR_BADGE_LABEL[rec.anomaly.kind] : '—'}` }
      : { lbl: 'Im Fenster', val: '—', sub: 'kein Signal — keine Aussage' },
  ];
}
