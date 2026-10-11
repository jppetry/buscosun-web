/**
 * GL-1 — Readout of the situation page: the newest OFFICIAL numbers per country with date, source and the authority's key
 * sentence VERBATIM (plan §6 `official.json`), the inventory facts with their reference year, the selected glacier, the list of
 * official reports, the usual reporting rhythm. Nothing here is modelled; the model lines (melt, snow line) stay locked.
 */
import { Valued, OriginChip, LockNote } from './GlacierParts';
import { fmtKm2, fmt0, fmt1, fmtRefYear, displayName, metricValue, satLines, type GlacierMetricDef } from './glacierView';
import type { GlacierMetric } from './glacierState';
import { GLACIER_COUNTRY_LABEL, GLACIER_REGIONS, type GlacierCatalogEntry, type GlacierCountry, type GlacierOfficialItem } from './glacierContract';
import type { GlacierLatest, GlacierSatLatest } from './glacierClient';

const dateDe = (iso: string) => `${iso.slice(8, 10)}.${iso.slice(5, 7)}.${iso.slice(0, 4)}`;
const val = (items: readonly GlacierOfficialItem[], id: string, key: string) => items.find((i) => i.id === id)?.values?.find((v) => v.key === key)?.value ?? null;
const item = (items: readonly GlacierOfficialItem[], id: string) => items.find((i) => i.id === id) ?? null;

export interface CountryFacts { n: number; km2: number; refYear: string; source: string }

function SourceLine({ it }: { it: GlacierOfficialItem }) {
  return <div className="gl-src">{it.source.split(',')[0]} · {dateDe(it.date)} · <a href={it.url} target="_blank" rel="noopener noreferrer">Quelle</a></div>;
}
const Quote = ({ it }: { it: GlacierOfficialItem }) => <blockquote className="gl-quote" cite={it.url}>{it.quote}</blockquote>;

function Inventory({ f }: { f: CountryFacts }) {
  return <p>Inventar <span className="gl-num" data-origin="official">{fmt0(f.n)} Gletscher · {f.km2 >= 10 ? fmt0(f.km2) : fmt1(f.km2)} km²</span> · Bezugsjahr {fmtRefYear(f.refYear)} ({f.source})</p>;
}

export function CountryCards({ items, facts }: { items: readonly GlacierOfficialItem[]; facts: Record<GlacierCountry, CountryFacts> }) {
  const chVol = item(items, 'ch-glamos-2026-volume'), chZero = item(items, 'ch-glamos-2026-freezing');
  const atLen = item(items, 'at-oeav-2024-25-length'), atRank = item(items, 'at-oeav-2024-25-rank'), atP = item(items, 'at-oeav-2024-25-pasterze');
  const deArea = item(items, 'de-badw-2026-area');
  return (
    <>
      <article className="gl-card" data-country="CH">
        <div className="gl-card-head"><b>{GLACIER_COUNTRY_LABEL.CH} · 2026</b><OriginChip origin="official" /></div>
        {chVol ? (
          <>
            <div className="gl-big"><span className="gl-num" data-origin="official">über {val(items, chVol.id, 'volumeLossOverPct')} %</span><span>des Eises verschwunden</span></div>
            <Quote it={chVol} />
            {chZero && <p><span className="gl-num" data-origin="official">{val(items, chZero.id, 'daysAbove4000')} Tage</span> Nullgradgrenze über 4 000 m — Rekord</p>}
            <SourceLine it={chVol} />
          </>
        ) : <p>Amtliche Zahl nicht ladbar.</p>}
        <Inventory f={facts.CH} />
      </article>
      <article className="gl-card" data-country="AT">
        <div className="gl-card-head"><b>{GLACIER_COUNTRY_LABEL.AT} · 2024/25</b><OriginChip origin="official" /></div>
        {atLen ? (
          <>
            <div className="gl-big"><span className="gl-num" data-origin="official">{fmt1(val(items, atLen.id, 'meanLengthChange') ?? 0)} m</span><span>mittlere Längenänderung</span></div>
            <Quote it={atLen} />
            {atRank && <p>Rang <span className="gl-num" data-origin="official">{val(items, atRank.id, 'rank')}</span> in der 135-jährigen Messreihe</p>}
            {atP && <p>Pasterze, Hauptzunge: <span className="gl-num" data-origin="official">{fmt0(val(items, atP.id, 'tongueRetreat') ?? 0)} m</span></p>}
            <SourceLine it={atLen} />
          </>
        ) : <p>Amtliche Zahl nicht ladbar.</p>}
        <Inventory f={facts.AT} />
      </article>
      <article className="gl-card" data-country="DE">
        <div className="gl-card-head"><b>{GLACIER_COUNTRY_LABEL.DE} · Herbst 2025</b><OriginChip origin="official" /></div>
        {deArea ? (
          <>
            <div className="gl-big"><span className="gl-num" data-origin="official">{fmt1(val(items, deArea.id, 'ha2025') ?? 0)} ha</span><span>Summe der vier Gletscher</span></div>
            <Quote it={deArea} />
            <p><span className="gl-num" data-origin="official">{fmt1(val(items, deArea.id, 'changePct') ?? 0)} %</span> seit 2023 ({fmt1(val(items, deArea.id, 'ha2023') ?? 0)} ha)</p>
            <SourceLine it={deArea} />
          </>
        ) : <p>Amtliche Zahl nicht ladbar.</p>}
        <p>Die vier Gletscher sind für Satellitenzahlen sehr klein (1,5–12,8 ha); es gelten die Zahlen der BAdW.</p>
      </article>
    </>
  );
}

const KIND_LABEL: Record<string, string> = { report: 'Bericht', status: 'Status' };
export function ReportList({ items }: { items: readonly GlacierOfficialItem[] }) {
  const sorted = [...items].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
  return (
    <>
      <h3 className="gl-h3">Amtliche Berichte</h3>
      <ol className="gl-feed" aria-label="Amtliche Berichte, jüngste zuerst">
        {sorted.map((it) => (
          <li key={it.id} data-id={it.id}>
            <time dateTime={it.date}>{dateDe(it.date).slice(0, 6)}</time>
            <span>
              <b>{it.scope === 'DACH' ? 'DACH' : GLACIER_COUNTRY_LABEL[it.scope]} · {it.title}</b>{' '}<OriginChip origin="official" label={KIND_LABEL[it.kind]} />
              <small>{it.source.split(',')[0]} · {it.period} · <a href={it.url} target="_blank" rel="noopener noreferrer">Quelle</a></small>
            </span>
          </li>
        ))}
      </ol>
    </>
  );
}

/** Usual reporting rhythm — no promised dates (the three networks publish when they publish). */
export function Rhythm() {
  return (
    <>
      <h3 className="gl-h3">Nächste Berichte</h3>
      <ul className="gl-feed" aria-label="Üblicher Berichtsrhythmus">
        <li><time>CH</time><span>GLAMOS: Saisonschätzung Anfang Oktober, Bulletin im Februar<small>üblicher Rhythmus, kein angekündigter Termin</small></span></li>
        <li><time>AT</time><span>Österreichischer Alpenverein: Gletscherbericht im März<small>üblicher Rhythmus (13.03.2026 für 2024/25)</small></span></li>
        <li><time>DE</time><span>BAdW: nach der jeweils nächsten Vermessung<small>zuletzt Herbst 2025, Meldung 19.03.2026</small></span></li>
      </ul>
    </>
  );
}

export function SelectedGlacier({ g, latest, sat, nowMs, defs }: { g: GlacierCatalogEntry; latest: GlacierLatest | undefined; sat: GlacierSatLatest | undefined; nowMs: number; defs: Readonly<Record<GlacierMetric, GlacierMetricDef>> }) {
  const len = metricValue('laenge', latest, g), ba = metricValue('bilanz', latest, g), da = metricValue('flaeche', latest, g);
  const reg = GLACIER_REGIONS[g.region]?.label ?? g.region;
  return (
    <article className="gl-card" data-glacier={g.id} aria-label={`Gletscher ${displayName(g)}`}>
      <div className="gl-card-head"><b>{displayName(g)}</b><span className="gl-chip is-official"><i aria-hidden="true" />Klasse {g.klass}</span></div>
      <p>{g.country} · {reg} · {fmtKm2(g.area.km2)} <OriginChip origin="official" label={`Inventar ${fmtRefYear(g.area.refYear)}`} /></p>
      <p>Höhe {fmt0(g.z[0])}–{fmt0(g.z[2])} m (Median {fmt0(g.z[1])} m) · {g.zSource}{g.debris != null && g.debris >= 2 ? ' · überwiegend schuttbedeckt' : ''}</p>
      {len.v != null && <p>Länge {len.period}: <Valued origin="measured">{len.text}</Valued></p>}
      {ba.v != null && <p>Bilanz {ba.period}: <Valued origin="measured">{ba.text}</Valued></p>}
      {da.v != null && <p>Fläche {da.period}: <Valued origin="official">{da.text} je 10 Jahre</Valued></p>}
      {len.v == null && ba.v == null && da.v == null && <p>Keine Messreihe zugeordnet — nur Inventar.</p>}
      {satLines(g, sat, nowMs).map((l, i) => <p key={i}>{l.origin ? <><OriginChip origin={l.origin} /> {l.text}</> : l.text}</p>)}
      {defs.schmelze.locked && <p><LockNote>{defs.schmelze.label}: {defs.schmelze.locked}</LockNote></p>}
      {g.status && <p>Status laut Behörde: {g.status}</p>}
    </article>
  );
}
