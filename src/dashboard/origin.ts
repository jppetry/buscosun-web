/**
 * Herkunftstabelle des Dashboards (Phase DB, audit/dashboard.md §4/§5.4).
 *
 * Jede angezeigte Größe trägt ihre Parameter-Nummer (P01–P93 = Zeilen der Abdeckungsmatrix §4 und §4.7). Die Kachel schreibt sie als
 * `data-origin` an das Element und als `title` (Quelle + Pfad), damit die Herkunft im DOM und im Code nachvollziehbar
 * ist. `verify:dashboard` prüft: jede Matrixzeile hat hier einen Eintrag, `unavailable` rendert nie eine Zahl, und
 * kein Eintrag zeigt auf den Live-Pfad oder die Rasterfusion.
 *
 * kind:
 *   fusion          buscosun Fusion, neueste Stufe (Cube-Pfad, `stage: fs`, `PointForecastV2`)
 *   fusion-derived  aus Fusion-Werten gerechnet; die Regel steht in `model/rules.ts`
 *   data            Alternativquelle in `buscosun-data` (Cube-Ebenen, Radar-Spiegel, KONRAD3D, Repack, Stationskatalog)
 *   web             bestehender Datenpfad in buscosun-web (DWD-CAP/MeteoAlarm/GeoSphere, DWD-UV, DWD-Pollen, Terrarium)
 *   unavailable     keine Quelle auf der Plattform ⇒ „nicht verfügbar"
 *   ui              Beschriftung/Zustand ohne Wetterwert
 */
export type OriginKind = 'fusion' | 'fusion-derived' | 'data' | 'web' | 'unavailable' | 'ui';
export interface OriginEntry { label: string; kind: OriginKind; source: string; path: string }

const FUSION = 'buscosun Fusion (Cube-Pfad, Stufe fs)';
const V2 = 'src/pointForecast/cubeSource.ts → PointForecastV2 (fusion/output.ts)';
const RULES = 'src/dashboard/model/rules.ts';

export const ORIGIN = {
  P01: { label: 'Ortsname', kind: 'ui', source: 'Ort aus der URL / Nominatim-Suche', path: 'src/share/placeTable.ts · src/geocode.ts' },
  P02: { label: 'Ortshöhe', kind: 'fusion', source: FUSION, path: 'v2.point.hTrue (Terrarium z11 bzw. MOSMIX-Stationshöhe)' },
  P03: { label: 'Lauf', kind: 'fusion', source: FUSION, path: 'v2.provenance.runs.t1.run' },
  P04: { label: 'Anker-Uhrzeit', kind: 'unavailable', source: 'Stations-Adapter liefern keine Messzeit (V-DB-2)', path: 'src/pointForecast/cubeSource.ts fetchCubeObs' },
  P05: { label: 'Status FUSION LIVE', kind: 'fusion-derived', source: FUSION, path: 'cube.v2 vorhanden, provenance.notes (stage:fs)' },
  P06: { label: 'Temperatur jetzt', kind: 'fusion', source: FUSION, path: `${V2} · steps[0].vars.t2m.p50 (mit Messanker)` },
  P07: { label: 'Wettersymbol jetzt', kind: 'fusion-derived', source: FUSION, path: `${RULES} symbolFor` },
  P08: { label: 'Taupunkt', kind: 'fusion', source: FUSION, path: 'steps[0].vars.td2m.p50' },
  P09: { label: 'rel. Feuchte', kind: 'fusion', source: FUSION, path: 'steps[0].vars.rh.p50' },
  P10: { label: 'Wind', kind: 'fusion', source: FUSION, path: 'steps[0].vars.wind.p50' },
  P11: { label: 'Böen', kind: 'fusion', source: FUSION, path: 'steps[0].vars.gust.p50' },
  P12: { label: 'Druck am Ort', kind: 'fusion', source: FUSION, path: 'steps[0].vars.ps.p50 (Stationsdruck an h_true; MSL nicht verfügbar)' },
  P13: { label: 'Windrichtung', kind: 'fusion', source: FUSION, path: 'steps[0].vars.windDir.p50' },
  P14: { label: 'Bewölkung', kind: 'fusion', source: FUSION, path: 'steps[0].vars.clct.p50' },
  P15: { label: 'Schneegrenze', kind: 'fusion', source: FUSION, path: 'steps[0].vars.snowline.p50' },
  P16: { label: 'T 925/850/700 hPa', kind: 'data', source: 'buscosun-data point/ (Cube-Ebenen t925/t850/t700)', path: 'cube.cells (CubePathSummary, E-DB-8)' },
  P17: { label: 'Anker-Herkunft', kind: 'fusion', source: FUSION, path: 'steps[0].members[product=anchor].anchor.sources' },
  P18: { label: 'Warntext wörtlich', kind: 'web', source: 'DWD CAP · MeteoAlarm CAP (CH) · GeoSphere Austria', path: 'src/sources/dwdCapAlerts.ts · meteoAlarmCh.ts · fire/sources/geosphereWarnContext.ts' },
  P19: { label: 'Warnung gültig bis', kind: 'web', source: 'CAP expires', path: 'src/warnings/capAlerts.ts' },
  P20: { label: 'Warn-Absender', kind: 'web', source: 'CAP senderName', path: 'src/warnings/capAlerts.ts' },
  P21: { label: 'Länderhinweis Warnung', kind: 'ui', source: '—', path: 'src/dashboard/data/extras.ts' },
  P22: { label: 'Konfidenz', kind: 'fusion-derived', source: FUSION, path: `vars.t2m.confidence.score · typischer Fehler der Klasse aus fusion/confidenceClasses.ts (Archiv, E-KF-4)` },
  P23: { label: 'Konfidenz-Einstufung', kind: 'fusion-derived', source: FUSION, path: `${RULES} confidenceWord/confidenceClass ← fusion/confidenceClasses.ts (Score-Perzentile am Archiv, E-KF-3)` },
  P24: { label: 'Gewicht je Quelle', kind: 'fusion', source: FUSION, path: 'steps[0].vars.t2m.members[].weight + steps[0].members' },
  P25: { label: 'Zeitraum', kind: 'ui', source: 'Kalender Europe/Berlin', path: 'src/dashboard/format.ts' },
  P26: { label: 'Modelle', kind: 'fusion', source: FUSION, path: 'v2.provenance.runs.t1/t2/t3.models, runs.stations' },
  P27: { label: 'Ensemble-Reichweite', kind: 'fusion-derived', source: FUSION, path: `vars.t2m.sigmaKind · ${RULES}` },
  P28: { label: 'Konfidenz im Mittel', kind: 'fusion-derived', source: FUSION, path: `vars.t2m.confidence.score · ${RULES}` },
  P29: { label: 'Tagesname', kind: 'ui', source: 'Kalender Europe/Berlin', path: 'src/dashboard/format.ts' },
  P30: { label: 'Tagestext', kind: 'fusion-derived', source: FUSION, path: `${RULES} dayText` },
  P31: { label: 'Tagessymbol', kind: 'fusion-derived', source: FUSION, path: `${RULES} symbolFor` },
  P32: { label: 'Tmax/Tmin', kind: 'fusion-derived', source: FUSION, path: 'vars.t2m.p50 je Kalendertag' },
  P33: { label: 'Phasensymbol', kind: 'fusion-derived', source: FUSION, path: `${RULES} symbolFor` },
  P34: { label: 'Phasentemperatur', kind: 'fusion-derived', source: FUSION, path: `vars.t2m.p50 · ${RULES} PHASES` },
  P35: { label: 'Niederschlagswahrscheinlichkeit', kind: 'fusion-derived', source: FUSION, path: 'vars.precip.dist (1 − pDry) je Stunde, Maximum der Phase' },
  P36: { label: 'Phasenwind', kind: 'fusion-derived', source: FUSION, path: 'vars.wind.p50, Mittel der Phase' },
  P37: { label: 'Böenhinweis', kind: 'fusion-derived', source: FUSION, path: `vars.gust.p50 · ${RULES} GUST_WARN_MS` },
  P38: { label: 'Phasen-Hervorhebung', kind: 'ui', source: FUSION, path: `${RULES} (Phase mit Böen ≥ Warnschwelle)` },
  P39: { label: 'Regen-Tagessumme', kind: 'fusion-derived', source: FUSION, path: 'Σ vars.precip.mean' },
  P40: { label: 'max. Niederschlagswahrscheinlichkeit', kind: 'fusion-derived', source: FUSION, path: 'max (1 − pDry)' },
  P41: { label: 'Böen max', kind: 'fusion-derived', source: FUSION, path: 'max vars.gust.p50, Richtung vars.windDir' },
  P42: { label: 'Warnung aktiv', kind: 'web', source: 'CAP onset/expires', path: 'src/dashboard/data/extras.ts' },
  P43: { label: 'Sonnenscheindauer', kind: 'unavailable', source: 'keine Quelle (kein Strahlungs-/Sonnenscheinwert im Cube, MOSMIX SunD1 nicht gelesen; E-DB-10)', path: '—' },
  P44: { label: 'UV je Tag', kind: 'web', source: 'DWD UV-Vorhersage (38 Orte, nur DE, 3 Tage)', path: 'src/sources/dwdUvForecast.ts fetchUvDailyForecast' },
  P45: { label: 'Schneegrenze Tag', kind: 'fusion-derived', source: FUSION, path: `vars.snowline.p50 · ${RULES} snowlineShown` },
  P46: { label: 'Konfidenz je Tag', kind: 'fusion-derived', source: FUSION, path: 'Mittel vars.t2m.confidence.score' },
  P47: { label: 'Temperaturlinie', kind: 'fusion', source: FUSION, path: 'vars.t2m.p50' },
  P48: { label: 'Bandbreite p10–p90', kind: 'fusion', source: FUSION, path: 'vars.t2m.p10/p90' },
  P49: { label: 'Taupunktlinie', kind: 'fusion', source: FUSION, path: 'vars.td2m.p50' },
  P50: { label: 'Niederschlag mm/h', kind: 'fusion', source: FUSION, path: 'vars.precip.mean' },
  P51: { label: 'Tagesgrenzen/Achse', kind: 'ui', source: 'Kalender Europe/Berlin', path: 'src/dashboard/format.ts' },
  P52: { label: 'Phasen-Segmente', kind: 'ui', source: 'in der Vorlage nicht gezeichnet — entfällt', path: '—' },
  P53: { label: 'Stundenverlauf-Kopf', kind: 'fusion-derived', source: FUSION, path: `${RULES} ensembleReach` },
  P54: { label: 'Trocken bis', kind: 'data', source: 'buscosun-data Radar-Spiegel (RV/INCA/RZC)', path: `src/point/client/nowcastPoint.ts readNowcastPoint · ${RULES} DRY_MMH` },
  P55: { label: 'Radarbalken', kind: 'data', source: 'buscosun-data Radar-Spiegel', path: 'src/point/client/nowcastPoint.ts' },
  P56: { label: 'Radar-Horizont', kind: 'ui', source: 'src/point/sourceMatrix.ts NOWCAST', path: 'src/dashboard/data/extras.ts' },
  P57: { label: 'Zellen', kind: 'data', source: 'buscosun-data radar/img/v1/konrad3d (KONRAD3D)', path: 'src/sources/dwdKonrad3d.ts · src/radar/cellPolygons.ts cellLocationRelevance' },
  P58: { label: 'Blitze 1 h', kind: 'unavailable', source: 'nur WMS-Kachel, keine Punktabfrage', path: 'src/sources/dwdLightning.ts' },
  P59: { label: 'Hagel (CH)', kind: 'web', source: 'MeteoSchweiz POH/MESHS', path: 'src/sources/meteoSwissHail.ts fetchSwissHail' },
  P60: { label: 'Wolkenschichten', kind: 'fusion', source: FUSION, path: 'vars.clch/clcm/clcl.p50 (native Schritte)' },
  P61: { label: 'Gesamtbewölkung mit Quantilen', kind: 'fusion', source: FUSION, path: 'vars.clct.p10/p50/p90' },
  P62: { label: 'Wolken-Spanne', kind: 'ui', source: '336 h', path: '—' },
  P63: { label: 'Windrose', kind: 'fusion-derived', source: FUSION, path: `vars.windDir.p50 · ${RULES} windRose` },
  P64: { label: 'aktuelle Windrichtung', kind: 'fusion', source: FUSION, path: 'steps[0].vars.windDir.p50' },
  P65: { label: 'Richtung belastbar bis', kind: 'fusion-derived', source: FUSION, path: 'erste Stunde mit windDir = null (Konzentrationsschranke fuse.ts); windstärkeabhängiger Teil nicht verfügbar' },
  P66: { label: 'Reichweiten-Balken', kind: 'fusion-derived', source: FUSION, path: 'belastbar bis / 336 h' },
  P67: { label: 'Schnittachse', kind: 'fusion', source: FUSION, path: 'steps[0].vars.windDir.p50' },
  P68: { label: 'Geländeprofil', kind: 'web', source: 'Terrarium-DEM (AWS)', path: 'src/fusion/elevation.ts loadElevationLookup' },
  P69: { label: 'Temperaturschichtung', kind: 'fusion-derived', source: 'Cube-Profil γ', path: `${RULES} tempAt` },
  P70: { label: 'γ / Inversion', kind: 'data', source: 'buscosun-data point/ (gammaEff, zInv, dTInv, t1)', path: 'cube.cells (E-DB-8)' },
  P71: { label: 'Isothermen', kind: 'fusion-derived', source: 'T am Ort + γ', path: `${RULES} isothermHeight` },
  P72: { label: 'Schneefallgrenze im Schnitt', kind: 'fusion', source: FUSION, path: 'steps[0].vars.snowline.p50' },
  P73: { label: 'Windvektoren je Niveau', kind: 'unavailable', source: 'kein Höhenwind im Punkt-Cube (E-DB-11)', path: '—' },
  P74: { label: 'Stationen im Schnitt', kind: 'data', source: 'buscosun-data point/stations/catalog.json + MOSMIX-Stationsprodukt', path: 'src/point/client/stationPoint.ts' },
  P75: { label: 'Ortsmarke', kind: 'fusion', source: FUSION, path: 'hTrue, t2m, wind, windDir (Stunde 0)' },
  P76: { label: 'T je Höhenstufe', kind: 'fusion-derived', source: 'T am Ort + γ', path: `${RULES} tempAt` },
  P77: { label: 'Wind je Höhenstufe', kind: 'unavailable', source: 'kein Höhenwind im Punkt-Cube (E-DB-11)', path: '—' },
  P78: { label: 'Ablesung', kind: 'fusion-derived', source: 'aus P67–P76', path: `${RULES} readoutText` },
  P79: { label: 'Stationen außerhalb', kind: 'data', source: 'buscosun-data point/stations/catalog.json', path: 'src/dashboard/data/extras.ts' },
  P80: { label: 'Schnitt-Kopfzeile', kind: 'ui', source: 'Cube t1 0,05° + Terrarium', path: '—' },
  P81: { label: 'UV-Kachel', kind: 'web', source: 'DWD UV-Vorhersage (38 Orte, nur DE)', path: 'src/sources/dwdUvForecast.ts' },
  P82: { label: 'Pollen', kind: 'web', source: 'DWD Pollenflug-Gefahrenindex (nur DE)', path: 'src/sources/dwdPollen.ts fetchPollenForecast' },
  P83: { label: 'CAMS-Hinweis', kind: 'ui', source: 'Open-Meteo/CAMS hinter Opt-in (AT/CH)', path: 'src/sources/openMeteoPollen.ts · src/optIn.ts' },
  P84: { label: 'Gewitterpotenzial', kind: 'data', source: 'buscosun-data runs/ ICON-D2-Repack thunder', path: 'src/sources/iconD2Thunder.ts' },
  P85: { label: 'Rotation', kind: 'data', source: 'buscosun-data runs/ ICON-D2-Repack rotation', path: 'src/sources/iconD2Rotation.ts' },
  P86: { label: 'Neuschnee 24 h', kind: 'data', source: 'buscosun-data runs/ ICON-D2-Repack snowfresh', path: 'src/sources/iconD2Snow.ts' },
  P87: { label: 'Böen max (ICON-D2)', kind: 'data', source: 'buscosun-data runs/ ICON-D2-Repack gust', path: 'src/sources/iconD2GustSource.ts' },
  P88: { label: 'Feuerwetter', kind: 'unavailable', source: 'zurückgezogen (CLAUDE.md, fire/fireModel.ts)', path: '—' },
  // E-DB-23 (audit/dashboard.md §4.7/§12): Bandbreite, Leitsatz, Nächte und Marken.
  P89: { label: 'Bandbreite jetzt (80 %-Band)', kind: 'fusion', source: FUSION, path: 'steps[0].vars.t2m.p10/p90' },
  P90: { label: 'Bandbreite über 14 Tage', kind: 'fusion', source: FUSION, path: 'vars.t2m.p10/p90 je Stunde' },
  P91: { label: 'Leitsatz', kind: 'fusion-derived', source: FUSION, path: `${RULES} leadSentence (aus dayText, Tmax, Regensumme)` },
  P92: { label: 'Nächte', kind: 'ui', source: 'Sonnenstand (NOAA-Näherung), keine Wetterquelle', path: 'src/pointForecast/terrainPhysics.ts solarPosition · data/forecastStore.ts' },
  P93: { label: 'Bandbreiten-Marken', kind: 'fusion-derived', source: FUSION, path: `vars.t2m.p10/p90 · ${RULES} bandMarks` },
} as const satisfies Record<string, OriginEntry>;

export type ParamId = keyof typeof ORIGIN;

/** `title`-Text eines Werts: Größe · Quelle · Pfad. */
export function originTitle(id: ParamId): string {
  const o: OriginEntry = ORIGIN[id];
  return `${id} ${o.label} — ${o.source}${o.path && o.path !== '—' ? ` · ${o.path}` : ''}`;
}
