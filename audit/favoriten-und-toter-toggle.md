# audit/favoriten-und-toter-toggle.md — Diagnose + Ergebnis Phase F1 (V-04 + V-22)

> Stand: 2026-08-03. Auftrag: `improvements.md` V-04 (Favoriten anlegbar machen) und V-22 (toter `warnings`-Toggle).
> Jans Freigabe zu Beginn: V-22 — Toggle **jetzt** aus `LAYER_ORDER` nehmen (formal ein Funktions-Entzug).

---

## 1 · V-04: zwei Hälften eines Features, die sich nie trafen

### 1.1 Der bekannte Teil — bestätigt

`src/favorites.ts` exportiert `addFavorite`, `removeFavorite`, `isFavorite`, `toggleFavorite`. Importiert wurde davon genau:

```
$ grep -rn "from './favorites'" src/
src/SearchPage.tsx:35:import { getFavorites, removeFavorite } from './favorites';
```

**`addFavorite`, `toggleFavorite` und `isFavorite` hatten keinen einzigen Aufrufer.** Die Startseite konnte gespeicherte Orte anzeigen und löschen — nur nie welche anlegen.

### 1.2 Die Prämisse des Katalogs war zur Hälfte falsch

V-04 sagt: „Historie pflegt ein zweites, **funktionierendes** Parallelsystem". Am Code stimmt das nicht:

```
$ grep -rn "getFavorites\|getRecents" src/history/ | grep -v historyState.ts
(keine Ausgabe)
```

`historyState.getFavorites()` hat **ebenfalls keinen Konsumenten**. Die Historie hat mit `HistoryPage.tsx:367` („★ Favorit") zwar einen Auslöser, aber keine Anzeige — wer dort einen Ort speicherte, sah ihn **nie wieder**, weder in der Historie noch auf der Startseite.

Das Bild ist also nicht „ein funktionierendes und ein kaputtes System", sondern:

| | anlegen | anzeigen |
|---|---|---|
| Startseite (`favorites.ts`) | ❌ | ✅ |
| Historie (`historyState.ts`) | ✅ | ❌ |

Zwei komplementäre Hälften. Genau deshalb ist die Zusammenführung risikoarm: sie **fügt** auf beiden Seiten Funktion hinzu und entfernt auf keiner.

### 1.3 Umsetzung

1. **`src/FavoriteStar.tsx`** (neu) — der eine Auslöser. Bewusst eine eigene Datei, damit der Punktforecast ihn nutzen kann, ohne die gesamte Startseite mitzuziehen. `aria-pressed`, sprechendes `aria-label`, 44 px Touch-Target.
2. **Suchergebnisse** (`SearchPage.tsx`): je Treffer ein Stern. Die Zeile wurde von einem `<button>` zu einem `<div class="deck-search-row">` mit **zwei** Buttons umgebaut — ein Button im Button wäre ungültiges HTML und für Tastatur/Screenreader unbedienbar. `stopPropagation`, damit Speichern nicht zur Karte navigiert.
3. **Punktforecast** (`PointForecastPanel.tsx`): Stern mit Beschriftung neben dem Ortsnamen.
4. **Abo** (`subscribeFavorites`): derselbe Ort ist an mehreren Stellen gleichzeitig sichtbar — ohne Benachrichtigung zeigte die Chip-Leiste weiter den alten Stand.
5. **Konsolidierung**: `historyState` delegiert `isFavorite`/`toggleFavorite`/`getFavorites` an `favorites.ts`. Die Alt-Einträge werden **einmalig** übernommen (`migrateLegacyOnce`), der Alt-Key wird **nicht gelöscht** — verlustfrei und nachvollziehbar. `RECENT_KEY` bleibt bewusst getrennt: „zuletzt angesehen" ist etwas anderes als „gespeichert".
6. **Ehrlichkeit bei vollem Speicher** (D-04): `addFavorite` verdrängt bei 8 Einträgen den ältesten. Der Stern sagt das im Titel an („ältester Ort weicht"), statt es stillschweigend zu tun.

### 1.4 Zwei eigene Fehler, im Test gefunden und behoben

Beide entstanden dadurch, dass `.deck-search-result` / `.pfc-loc` nun **Flex-Kinder** sind:

| Fehler | Messung | Fix |
|---|---|---|
| Suchdropdown lief mobil über, Ortsname verlor seine Ellipse | `row.scrollWidth 381 > clientWidth 337` (390 px) | `flex: 1; min-width: 0; width: auto` auf `.deck-search-row .deck-search-result` |
| Punktforecast-Kopf lief 6 px über | `row.scrollWidth 306 > clientWidth 300` | negativen `margin-right: -0.35rem` entfernt |

### 1.5 Eine Einschränkung, die benannt gehört

Der Punktforecast-Stern ist heute an **beiden** Einbaustellen nicht regulär sichtbar:

- **Desktop-Readout:** gerendert nur bei `!overview && !START_NOW_ONLY` (`MapView.tsx:3794`) — `START_NOW_ONLY` ist per Default **true** (`:164`, abschaltbar mit `?startnow=0`).
- **Mobiles Sheet:** `.pfc-title`/`.pfc-loc` sind dort seit jeher ausgeblendet, weil der Sheet-Kopf den Ort selbst trägt; die neue Zeile folgt dieser Ausblendung, damit das mobile Layout **unverändert** bleibt.

Der Codepfad ist mit `?startnow=0` verifiziert (Stern rendert, 96×44, Ellipse intakt). **Der wirksame Einstieg zum Speichern ist heute die Suchseite** — auf Desktop und Mobil gleichermaßen. Ein zusätzlicher Auslöser im mobilen Sheet-Kopf ist als **V-132** vorgemerkt statt hier ungeprüft eingebaut zu werden.

---

## 2 · V-22: ein Schalter, der nichts tut

Am Code bestätigt:

```
$ grep -c warnings src/radar/RadarMap.tsx
0
```

`NowcastRadarMap.tsx:85,90` bot `warnings` als Layer an; `RadarMap.tsx` kennt die Kennung **überhaupt nicht**. DWD-Warnungen werden geholt, aber nur zu einem Skalar `warnLevel` reduziert — es wurden nie Warnpolygone gezeichnet.

Aus `LAYER_ORDER` entfernt (Jans Freigabe). **`LAYER_META.warnings` bleibt absichtlich stehen**: sobald V-24 echte Polygone liefert, genügt es, die Kennung wieder einzureihen.

---

## 3 · Ergebnis (Gate GF1, 2026-08-03)

Verifiziert mit **Playwright-MCP** (der Chrome-DevTools-MCP-Browser war erneut durch eine Parallel-Session gesperrt — Profil-Lock, wie in Phase R2), Dev auf **:5215**, Desktop 1440×900 und iPhone 12 Pro 390×844.

| Prüfung | Ergebnis |
|---|---|
| Stern je Suchtreffer | 8 Zeilen, je ein Stern, **44×44 px**, `aria-pressed`, kein Button-im-Button |
| Speichern | `localStorage` schreibt den Ort; Stern → ★, `aria-pressed=true`, Label wechselt auf „entfernen" |
| Kein Fehlklick | Dropdown bleibt offen, **kein** Hash-Wechsel — Speichern navigiert nicht |
| Persistenz | nach Reload als Chip „Neustadt an der Weinstraße" auf der Startseite |
| Migration | Historie-Favorit „Zermatt" (CH) übernommen, **kaputter Eintrag ohne Koordinate verworfen**, Alt-Key erhalten, Flag gesetzt, Chip erscheint |
| Punktforecast-Stern (`?startnow=0`) | 96×44, Beschriftung „Speichern", Ortsname behält Ellipse, kein Überlauf |
| V-22 | „Warnungen" kommt auf der Radar-Seite **im gesamten Seitentext nicht mehr vor** |
| Desktop 1440 | Dropdown und alle 8 Zeilen ohne Überlauf, Zeilenhöhe 46 px, kein horizontaler Seiten-Scroll |
| Mobil 390 | kein Überlauf, Ortsname ellipsiert, Stern 44×44, kein horizontaler Seiten-Scroll |
| `npm run typecheck` · `npm run build` | beide grün |

Belege: `audit/screenshots/favoriten/desktop-1440-suchergebnisse-mit-stern.png`, `mobil-390-suchergebnisse-mit-stern.png`.

### Die fünf Selbstverifikations-Fragen

1. **Funktionserhalt einzeln.** Chip-Leiste (anzeigen + löschen) unverändert, zusätzlich live aktualisiert. Suchtreffer öffnen weiterhin per Klick die Karte. Historie-Stern funktioniert weiter, schreibt jetzt aber sichtbar. Einziger Entzug: der `warnings`-Toggle — mit Jans ausdrücklicher Freigabe, `LAYER_META` bleibt für die Rückkehr stehen.
2. **Desktop pixelgleich.** Nicht anwendbar im strengen Sinn: V-04 **fügt** auf der Suchseite sichtbar einen Stern hinzu, das ist der Auftrag. Geprüft wurde stattdessen, dass nichts **anderes** verrutscht: Dropdownbreite, Zeilenhöhe 46 px, Ellipse des Ortsnamens, kein horizontaler Seiten-Scroll — alles unverändert bzw. innerhalb der Zeile aufgefangen.
3. **Touch-Targets ≥ 44 px.** Gemessen: Suchergebnis-Stern **44×44**, Punktforecast-Stern **96×44**.
4. **Konsole sauber.** Startseite und Suche: 0 Errors. Zwei Befunde, die **nicht** aus dieser Phase stammen: ein 404 von `api.brightsky.dev/alerts` für Innsbruck (AT) — die DE-only-Warnquelle wird weiterhin für jedes Land abgefragt (→ **V-130**); und sechs maplibre-interne Fehler beim Radar-Kartenaufbau (Tile-Loading). Beide liegen außerhalb der geänderten Codepfade; ich habe sie **nicht** durch Rückbau gegengeprüft.
5. **Keine Long Tasks > 200 ms.** Kein neuer Rechenpfad — `localStorage`-Lesen/Schreiben einer auf 8 Einträge gedeckelten Liste plus ein Modul-lokales Pub/Sub. Kein Fetch, kein Renderpfad, keine GPU-Aussage nötig.

### 🔴 Offen an Jan

- **V-132** (neu): eigener Speichern-Auslöser im mobilen Sheet-Kopf — heute ist die Suchseite der einzige mobile Einstieg.
- **V-130** (neu): BrightSky-Warnabruf feuert auch für AT/CH und endet dort in einem 404.
- **V-131** (neu): Der Einstiegstext des Regenradars verspricht weiter einen „ehrlichen Übergang zur ICON-D2-Vorhersage" — die Modellhälfte wurde am 2026-07-24 (N1) aber entfernt.
