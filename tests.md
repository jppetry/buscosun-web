# tests.md — Atmosphäre

> Wird ab P2 mit den reinen Modul-Tests gefüllt (profile-derivations, verdict,
> foehn-index). Bestehende DEV-Selbsttests: `window.__verifyThreeDState()` u. a.

## Erledigt
- P2 `profile-derivations` → `window.__verifyProfileDerivations()` — 11/11 grün:
  starke Thermik (tiefe Grenzschicht, Stärke>2, keine Wolken), stabil (flache
  Grenzschicht, Bodeninversion), Deckelinversion (Basis>2500 m), feuchte Schicht
  (Wolkenschicht erkannt), Windumrechnung (km/h, 270° Westwind).

- P3 `verdict` → `window.__verifyVerdict()` — 10/10 grün: Fliegen (gut / zu windig /
  flach), Berg & Weg (Inversion→Nebelmeer / klar / Gipfel in Wolken), Himmel (trüb),
  Grounding-Block (phenomenon 'atmosphere'), Template-Fallback.

- P4 `thermalField` → `window.__verifyThermalField()` — 7/7 grün: Thermik>0 über
  durchmischtem Profil, tieferes Gelände ≥ höheres, stabil schwach, Farb-/Alpha-Ramp,
  Bildgröße + vertikale Spiegelung (latMin unten).

- P5 `skyCards` → `window.__verifySkyCards()` — 8/8 grün: Sonnenuntergang (tiefe
  Wolke poor / hohe Wolke good / klar fair), Nebelmeer (Inversion+Wolke good /
  nur Inversion fair / keins none), Optik (kalter Cirrus good / keine none).

- P6a `foehn` → `window.__verifyFoehn()` — 5/5 grün: aktiv (starker Südwind),
  Tendenz (mäßiger Südwind), Nordwest stark → none, schwach → none, Kammwind aus
  Höhenband (nicht Boden).

- P6b `isentropes` → `window.__verifyIsentropes()` — 6/6 grün: θ steigt mit Höhe,
  flache Lage ≈ horizontale Isentropen, Föhn (Lee aloft wärmer) → Isentrope sinkt
  im Lee ab, heightForTheta außerhalb → null.

## Migration aus threed (A/B/C/D)
- D Windscherung: `profile-derivations` Selbsttest jetzt 12/12 (Scherungszone bei
  starkem Wind-Sprung erkannt). Render: terracotta-Marker im Windgürtel.
- C Talwind: `threed/dynamics.talwindReversals`/`bearingDeg` wiederverwendet
  (dort `__verifyDynamics` getestet); `TalwindPanel` = getPointForecast 48 h +
  DEM-Hangrichtung. Live Innsbruck: Umkehrzeiten gelistet.
- A Tour-Import: `threed/tourImport` wiederverwendet; Live „⤓ Tour laden" im Header.
- B Punkt-Abfrage: Live-Readout im Profil bestätigt („2137 m · 14,3° / Td …").

## Geplant
- P3 `verdict`: Linsen-Mapping (Fliegen/Berg&Weg/Himmel) → sage/amber/terracotta
- P5 Himmel-Derivations + Degradierungspfade bei fehlenden Daten
- P6 Föhn-Index-Schwellen
