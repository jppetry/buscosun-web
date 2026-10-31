/**
 * Regionssuche der Brandradar-Topbar (2026-10-31, Jans Auftrag): eine Region, Stadt oder ein
 * Land in der Europa-Box eingeben, die Karte fliegt auf ihre Bbox. Reine Ortsauflösung über
 * Nominatim (wie `src/geocode.ts`), auf die Europa-Box begrenzt (`viewbox` + `bounded`) — keine
 * Wetter- oder Branddaten, nichts wird gewählt oder gefiltert. Aufbau wie `DeckBarSearch` der
 * Dashboard-Topbar: Enter sucht, ein Treffer springt sofort, mehrere stehen als Liste.
 */
import { useRef, useState } from 'react';
import { EUROPE_BOX } from './fireRegion';

export interface RegionHit {
  name: string;
  /** ISO-Code klein, wie Nominatim ihn liefert; `null` ohne Angabe (Meer). */
  cc: string | null;
  /** [W, S, O, N]. */
  bbox: [number, number, number, number];
}

interface NominatimRegion {
  display_name: string;
  boundingbox?: [string, string, string, string];
  address?: { country_code?: string };
}

/** Nominatim-Suche in der Europa-Box. `boundingbox` kommt als [S, N, W, O] (Strings). */
export async function geocodeEurope(query: string, signal?: AbortSignal): Promise<RegionHit[]> {
  const url = new URL('https://nominatim.openstreetmap.org/search');
  url.searchParams.set('q', query);
  url.searchParams.set('format', 'json');
  url.searchParams.set('limit', '6');
  url.searchParams.set('addressdetails', '1');
  url.searchParams.set('viewbox', `${EUROPE_BOX.west},${EUROPE_BOX.north},${EUROPE_BOX.east},${EUROPE_BOX.south}`);
  url.searchParams.set('bounded', '1');
  const res = await fetch(url.toString(), { headers: { 'Accept-Language': 'de' }, signal });
  if (!res.ok) throw new Error(`Geocoder: ${res.status}`);
  const data = (await res.json()) as NominatimRegion[];
  const out: RegionHit[] = [];
  for (const r of data) {
    const b = r.boundingbox?.map(Number);
    if (!b || b.length !== 4 || !b.every(Number.isFinite)) continue;
    out.push({ name: r.display_name, cc: r.address?.country_code ?? null, bbox: [b[2], b[0], b[3], b[1]] });
  }
  return out;
}

/** Kurzname: erster Bestandteil, dazu Land und Verwaltungsebene aus dem `display_name`. */
function hitLabel(h: RegionHit): { main: string; sub: string } {
  const parts = h.name.split(',').map((s) => s.trim()).filter(Boolean);
  return { main: parts[0] ?? h.name, sub: parts.slice(1).slice(-2).join(', ') };
}

export function FireRegionSearch({ onPick, compact = false }: { onPick: (hit: RegionHit) => void; compact?: boolean }) {
  const [q, setQ] = useState('');
  const [hits, setHits] = useState<RegionHit[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const acRef = useRef<AbortController | null>(null);
  const reset = () => { setHits([]); setErr(null); };
  const pick = (h: RegionHit) => { onPick(h); setQ(hitLabel(h).main); reset(); inputRef.current?.blur(); };
  const run = async () => {
    const query = q.trim();
    if (!query) return;
    acRef.current?.abort();
    const ac = new AbortController();
    acRef.current = ac;
    setBusy(true);
    reset();
    try {
      const found = await geocodeEurope(query, ac.signal);
      if (ac.signal.aborted) return;
      if (found.length === 0) setErr('Nichts gefunden in der Europa-Box.');
      else if (found.length === 1) pick(found[0]);
      else setHits(found);
    } catch (e) {
      if ((e as { name?: string })?.name === 'AbortError') return;
      setErr(e instanceof Error ? e.message : 'Suche fehlgeschlagen');
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className={`br-search${compact ? ' is-compact' : ''}`}>
      <div className="br-search-box">
        <svg width="15" height="15" viewBox="0 0 18 18" fill="none" aria-hidden="true"><circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="1.6" /><line x1="12.5" y1="12.5" x2="16" y2="16" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /></svg>
        <input
          ref={inputRef}
          className="br-search-input"
          type="text"
          value={q}
          placeholder={compact ? 'Region' : 'Region oder Ort in Europa'}
          aria-label="Region suchen und auf der Karte anzeigen"
          onChange={(e) => { setQ(e.target.value); if (err) setErr(null); }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') { e.preventDefault(); void run(); }
            if (e.key === 'Escape') { setQ(''); reset(); }
          }}
          disabled={busy}
        />
        {busy && <span className="br-search-busy" aria-hidden="true">…</span>}
      </div>
      {(hits.length > 0 || err) && (
        <div className="br-search-drop" role="listbox" aria-label="Suchergebnisse">
          {err && <div className="br-search-err">⚠ {err}</div>}
          {hits.map((h) => {
            const l = hitLabel(h);
            return (
              <button key={`${h.bbox.join(',')}`} type="button" className="br-search-hit" role="option" aria-selected="false" onClick={() => pick(h)}>
                <span className="br-search-hit-cc">{h.cc ? h.cc.toUpperCase() : '—'}</span>
                <span className="br-search-hit-txt"><b>{l.main}</b>{l.sub && <em>{l.sub}</em>}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
