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

## Geplant
- P3 `verdict`: Linsen-Mapping (Fliegen/Berg&Weg/Himmel) → sage/amber/terracotta
- P5 Himmel-Derivations + Degradierungspfade bei fehlenden Daten
- P6 Föhn-Index-Schwellen
