/**
 * GL-4 — everything the sheet of ONE glacier needs, loaded in parallel and independent of each other: a part that fails leaves its place empty and says so
 * (`missing`), it never blocks the others and never invents a value. All documents go through the client's contract rules.
 */
import {
  loadOutline, loadEpoch, loadHypso, loadSeries, loadProj, loadClima, loadDemGrid, loadMelt, loadSeasonRowsOf, loadReport, loadSources, epochYearsOf,
  type GlacierBases, type GlacierHypsoDoc, type GlacierSatIndex, type GlacierMeltPointer, type GlacierSourceRow,
} from './glacierClient';
import type { GlacierCatalogEntry, GlacierSeries } from './glacierContract';
import type { GlacierDemGrid, GlacierSeasonRow } from './glacierSatContract';
import type { GlacierMeltDoc, GlacierMeltRow } from './glacierMeltContract';
import { projectionView, type ClimaEntry, type ProjectionView } from './glacierSheetModel';

export interface SheetEpoch { year: number; source: string; geometry: GeoJSON.Geometry }
export interface SheetData {
  hyp: GlacierHypsoDoc['glaciers'][string] | null;
  series: GlacierSeries[];
  proj: ProjectionView | null;
  clima: { entry: ClimaEntry; doy0: number; bin: number } | null;
  geometry: GeoJSON.Geometry | null;
  epochs: SheetEpoch[];
  dem: GlacierDemGrid | null;
  seasons: Map<number, GlacierSeasonRow[]>;
  melt: { doc: GlacierMeltDoc; row: GlacierMeltRow } | null;
  sources: GlacierSourceRow[] | null;
  /** Parts that could not be loaded (named on the sheet). */
  missing: string[];
}

const pick = (fc: { features: Array<{ properties: { id?: string; ids?: string[] }; geometry: GeoJSON.Geometry }> } | null, id: string): GeoJSON.Geometry | null =>
  fc?.features.find((f) => f.properties.id === id || f.properties.ids?.includes(id))?.geometry ?? null;

export async function loadSheetData(a: {
  g: GlacierCatalogEntry; build: string; byId: ReadonlyMap<string, GlacierCatalogEntry>; satIndex: GlacierSatIndex | null; meltPointer: GlacierMeltPointer | null; signal?: AbortSignal; bases: GlacierBases;
}): Promise<SheetData> {
  const { g, build, byId, satIndex, meltPointer, signal, bases } = a;
  const missing: string[] = [];
  // essential parts are named when they are missing; optional documents (projection, series, hypsometry, climatology, elevation grid) simply do not exist for every glacier
  const ESSENTIAL = new Set(['Umriss', 'Quellen', 'Schmelzlauf']);
  const guard = async <T,>(what: string, p: Promise<T | null>): Promise<T | null> => {
    try { const v = await p; if (v == null && ESSENTIAL.has(what)) missing.push(what); return v; }
    catch (e) { if ((e as Error)?.name === 'AbortError') throw e; if (ESSENTIAL.has(what)) missing.push(what); return null; }
  };
  const klassA = g.klass === 'A' && g.country !== 'DE';
  const satOk = g.klass !== 'C' && g.country !== 'DE';
  const catIds = new Set(byId.keys());
  const [hypso, series, proj, clima, outline, report, sources, seasons, meltDoc] = await Promise.all([
    guard('Höhenbänder', loadHypso(build, g.region, signal, bases)),
    guard('Reihen', loadSeries(build, g.region, signal, bases)),
    guard('Projektion', loadProj(build, g.region, signal, bases)),
    klassA ? guard('Schneegrenzen-Klimatologie', loadClima(build, g.region, byId, signal, bases)) : Promise.resolve(null),
    guard('Umriss', loadOutline(build, g.region, 3, signal, bases)),
    loadReport(build, signal, bases).catch(() => null),
    guard('Quellen', loadSources(build, signal, bases)),
    satOk && satIndex ? loadSeasonRowsOf(g, satIndex, byId, signal, bases).catch(() => new Map<number, GlacierSeasonRow[]>()) : Promise.resolve(new Map<number, GlacierSeasonRow[]>()),
    meltPointer ? guard('Schmelzlauf', loadMelt(meltPointer.run, catIds, signal, bases)) : Promise.resolve(null),
  ]);
  const years = epochYearsOf(report, g.region);
  const epochDocs = await Promise.all(years.map((y) => loadEpoch(build, g.region, y, signal, bases).catch(() => null)));
  const epochs: SheetEpoch[] = [];
  epochDocs.forEach((d, i) => { const geo = pick(d, g.id); if (geo && d) epochs.push({ year: years[i], source: d.source ?? '', geometry: geo }); });
  const dem = klassA ? await guard('Höhengitter', loadDemGrid(build, g.region, g.id, signal, bases)) : null;
  const row = meltDoc?.glaciers.find((r) => r.id === g.id) ?? null;
  if (meltDoc && !row) missing.push('Schmelzlauf (Gletscher ohne Zeile)');
  return {
    hyp: hypso?.glaciers[g.id] ?? null, series: (series?.glaciers[g.id] ?? []).map((s) => ({ ...s, id: g.id })) as GlacierSeries[],
    proj: proj ? projectionView(proj, proj.glaciers[g.id]) : null,
    clima: klassA && clima?.glaciers[g.id] ? { entry: clima.glaciers[g.id] as ClimaEntry, doy0: clima.doy0, bin: clima.bin } : null,
    geometry: pick(outline, g.id), epochs, dem, seasons, melt: meltDoc && row ? { doc: meltDoc, row } : null, sources, missing,
  };
}
