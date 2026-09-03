# Brandradar — Brand-Dossier in der Mitte (Vorlage BD2)

Erzeugt 2026-08-29. Verbindliche Vorlage für die Detailansicht der Brände (BD1-Inhalte,
Command-Deck-Sprache). Drei Varianten; eine wird umgesetzt.

## Dateien

| Datei | Inhalt |
|---|---|
| `brandradar-detail.dc.html` | Markup-Quelle aller drei Varianten (inline Styles, exakte Hex-Werte, Maße). `support.js` daneben, damit die Datei im Browser öffnet. |
| `br-detail-1a-desktop.png` · `-tablet` · `-mobile` | **1a Bühnenwechsel** — Topbar-Segment „Karte ⇄ Dossier"; Dossier in voller Mittelbreite, Karte rechts als Miniatur; links Registry; Zeit-Deck über die ganze Breite. |
| `br-detail-1b-*.png` | **1b Dossier-Blatt** — Karte bleibt Bühne, Blatt (860 × 690) fährt zentriert ein, Griff senkt es ab; Dock links bleibt stehen. |
| `br-detail-1c-*.png` | **1c Zwei Bühnen, geblättert** — Pager ① Karte / ② Dossier, Dossier in Registern (Kennzahlen · Verlauf · Wetterlage · Einordnung · Merkmale), Brandliste rechts. |

Pixelmaße der PNGs: Desktop 1440 × 1000, Tablet 1024 × 768, Mobil 390 × 844 — jeweils @2x.

## Tokens (bestehend, `src/designTokens.css`)

Flächen `--cream-50 #FAF6EA` (Panels), `--sand-50 #F5F1E8` (Content), `--ink-900 #2C2A26` (Rail),
Rahmen `--border-default #E0D6BE`, Trennlinie `#EDE6D3`, Kachelfläche `#FDFBF4`, Chip `#F2EEE3`.
Text `--ink-900`, `--ink-800 #3A3833`, `--stone-600 #5C5447`, `--stone-500 #8B7355`, `--stone-400 #A89A7A`.
Akzente `--br-red #A32B1E`, `--br-amber #E9A33C`, `--br-terra #C97B47`, Link `--terracotta-700 #A85E2E`,
`--br-steel #3A6FA8` (Wetterlage), `--hd-steel-chip #EAF1F7` / `--hd-steel-border #C7D6E4`,
`--br-mark #FFB03D` (markierter Brand), `--br-det #FF6B3D`, `--br-warn-tint/-border/-ink` (Ursache-Kasten),
`--br-sage-*` (ortsfest/kartiert), `--br-blocked-bg #F4F0E4` + `--br-stone` (blockierte EDO-Zeilen).

Schrift: **League Spartan** durchgehend (selbst gehostet, `src/fonts.css`) — auch für Eyebrows
(uppercase, `letter-spacing .14–.20em`, 10,5–12 px) und Diagramm-Achsen. Kein Mono, keine Google-Fonts.

## Inhalt der Detailansicht (unverändert BD1, nur umgruppiert)

Kopf → **Kennzahlen** (Fläche · Detektionen · Stärke · Tendenz, je mit Untertitel/Herkunft) →
**Verlauf** (ΣFRP je Überflug, log-Achse, Lücken > 6 h schraffiert, ☀/☾, Jetzt-Linie) →
**Wetterlage** (Zusammenfassung + Kacheln Erstdetektion · Brandtag · Vortage · Jetzt, Quellenzeile
„Modellwerte DWD ICON (Open-Meteo, 2–13 km) — keine Messung") → **Einordnung & Bestätigung**
(Konfidenz, Landbedeckung CORINE, Kartierung, EMS, **Ursache = keine Quelle** + Einordnungshilfen) →
**Merkmale**. Alle Ehrlichkeits-Sätze bleiben wortgleich.

## Kartenflächen

Die grün gestreiften Felder sind Platzhalter für MapLibre — Geometrie und Maße gelten, die Füllung
kommt aus der Karte.
