# tests.md — Atmosphäre

> Wird ab P2 mit den reinen Modul-Tests gefüllt (profile-derivations, verdict,
> foehn-index). Bestehende DEV-Selbsttests: `window.__verifyThreeDState()` u. a.

## Erledigt
- P2 `profile-derivations` → `window.__verifyProfileDerivations()` — 11/11 grün:
  starke Thermik (tiefe Grenzschicht, Stärke>2, keine Wolken), stabil (flache
  Grenzschicht, Bodeninversion), Deckelinversion (Basis>2500 m), feuchte Schicht
  (Wolkenschicht erkannt), Windumrechnung (km/h, 270° Westwind).

## Geplant
- P3 `verdict`: Linsen-Mapping (Fliegen/Berg&Weg/Himmel) → sage/amber/terracotta
- P5 Himmel-Derivations + Degradierungspfade bei fehlenden Daten
- P6 Föhn-Index-Schwellen
