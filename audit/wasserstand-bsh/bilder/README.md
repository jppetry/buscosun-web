# Bilder der Phase WL

Aufgenommen am 12.10.2026 gegen den Bau des Arbeitsbaums (`vite preview`), Uhr auf 2026-10-12 15:30 UTC
eingefroren, headless Chromium über CDP.

**Herkunft der Daten in diesen Bildern — genau die Produktionsarchitektur (E-WL-2):**

- der **Pegelkatalog** kommt aus dem Spiegel (`sea/v1/static/gauges.json`, hier als Fixture untergeschoben,
  weil er noch nicht im Daten-Repo liegt — Jans Gate §66),
- die **Vorhersagekurve** kommt **live aus der offiziellen BSH-API** (erkennbar am Stempel „Modellkurve
  Mo 12.10. 19:04", der jünger ist als die Fixture, und am vollen 48-h-Fenster).

Die Bilder belegen damit die Kette von Ende zu Ende gegen den echten Dienst. Der **netzfreie** Nachweis ist
ein anderer: `verify:sea-ui` Block L fängt die API ab (L0 zählt die abgefangenen Abrufe, L4b prüft die
Stützstellen gegen das Fixture-Fenster) — s. V-WL-13.

| Datei | Inhalt |
|---|---|
| `desktop-live.png` | ganze Seite 1440 × 900, Spot Cuxhaven-Duhnen (Nordsee: Kurve + Hoch-/Niedrigwasser) |
| `desktop-karte-live.png` | nur die Karte „Wasserstand · amtlich (BSH)" |
| `desktop-ostsee-live.png` / `desktop-ostsee-karte-live.png` | Warnemünde (Ostsee: Kurve ohne Gezeit, keine Hoch-/Niedrigwasserzeiten — die Karte sagt es) |
| `mobil-live.png` / `mobil-karte-live.png` | 390 × 844, Spot-Briefing aufgeklappt |

`../pixel/` trägt den Pixel-Diff HEAD ↔ `?wl=0` (Gate G-WL-3).
