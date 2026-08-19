# Startseite — Aufräumrunde (Reihenfolge, Hero-Höhe, Typografie)

> Auftrag (Jan, 2026-08-09, in vier Schritten während einer Sitzung):
> 1. „06 · HISTORIE und 07 · 3D-WETTER wieder weiter nach unten, um dann komplett mit der
>    Wetterkarte und Route nachrücken zu können."
> 2. „Das ↵ Enter zum Suchen … DACH-Wetterkarte und das LIVE · DE · AT · CH · OHNE ACCOUNT
>    können auf der Startseite entfernt werden."
> 3. „Vielleicht könntest du [Titel/Sub/Suche/04/05/Chips] noch etwas nach oben setzen."
> 4. „Kannst du schauen, dass auf der kompletten Startseite League Spartan eingesetzt wird?"
> 5. „Vielleicht könntest du die 4 [06/07/08/09] so nebeneinander positionieren in einer Reihe."
>
> Reine Darstellungsphase: **kein neuer Datenpfad, keine neue Abhängigkeit, kein Feature
> entfernt.** Betroffen sind ausschließlich `src/SearchPage.tsx` und `src/SearchPage.css`.

## 1. Ausgangslage

Das Hero-Feld trug seit dem Command-Deck-Umbau ein **2×2-Quadrat mit den Kacheln 04–07**
(Nowcast, Vorhersage, Historie, 3D-Wetter) neben der Ortssuche. Dadurch stand das Bento-Grid —
und damit **01 Wetterkarte** und **02 Tourenplanung** — weit unten; auf 1440×900 begann die
Wetterkarten-Kachel erst bei ~y 455.

## 2. Änderungen

| # | Was | Wie |
|---|---|---|
| A | 06 + 07 aus dem Hero zurück ins Bento | `HeroQuad` trägt nur noch 04 + 05; `.deck-quad` von `aspect-ratio 1/1` + zwei Rasterzeilen auf **2/1 + eine Zeile** (sonst bliebe die zweite Zeile als Leerraum stehen) |
| B | Eyebrow „LIVE · DE · AT · CH · OHNE ACCOUNT" entfernt | Element + zugehörige CSS-Regeln + Rasterzeile `eye` gelöscht |
| C | Such-Fußzeile „↵ Enter zum Suchen … DACH-Wetterkarte" entfernt | `deck-search-foot` gelöscht; `HeroSearch` braucht dadurch kein `onOpenFeature` mehr (Prop entfernt statt tot mitzuschleppen) |
| D | Hero-Block nach oben | `.deck-hero` padding-top 28 → **12 px**, `.deck-h1` margin-top 16 → **0** (der Titel ist seit B das erste Element); Tablet 40 → 20 px, Mobile 16 → 8 px |
| E | 06–09 als **eine** Reihe | Alle vier auf `t-half`; der frühere Globus-Sonderspan entfällt |
| F | Feedback-Kachel in Viertelspalte lesbar | In der schmalen Spalte gestapelt statt Zeilenform, Titel 24 → 19 px, Badge „E-MAIL" ausgeblendet. **Tablet und Mobile behalten die Zeilenform** (dort läuft sie über die volle Breite) |
| G | Komplette Startseite in League Spartan | Type-Tokens **lokal auf `.deck`** überschrieben (`--font-display`, `--font-mono`) + `font-family` auf der Wurzel |

Zu **G**: Jede Regel in `SearchPage.css` zieht ihre Familie aus den Tokens, deshalb genügt die
eine Stelle — Größen und Laufweiten bleiben unangetastet, nur die Familie wechselt. Die globalen
Tokens in `designTokens.css` sind **unverändert**, der Rest der App also unberührt. League Spartan
ist seit V-102 selbst gehostet (`src/fonts.css`, Schnitte 300–800) und in `index.html` bereits
vorgeladen — **keine neue Netzanfrage, kein Drittanbieter**. Damit ist die Startseite die letzte
Command-Deck-Fläche, die auf die Hausschrift wechselt (D-27); Regenradar, Kartenseite, Historie,
Vertikalschnitt, Event- und Routenplaner setzen sie längst durchgehend.

## 3. Raster nach der Änderung

**Desktop (>1024, 4 Spalten)**

```
Hero:  Titel · Sub · Suche          |  [04 Nowcast] [05 Vorhersage]
Bento: [01 Wetterkarte 2×2] [02 Tourenplanung 2]
                            [03 Event-Planung 2]
       [06 Historie] [07 3D-Wetter] [08 Globus] [09 Feedback]
```
Gemessene Kachelbreiten der letzten Reihe: 308 / 308 / 308 / 326 px — eine volle Reihe ohne Loch.

**Tablet (768–1024, 3 Spalten):** Historie · 3D-Wetter · Globus bilden die Reihe, Feedback läuft
darunter über die volle Breite (dort wieder in Zeilenform).

**Mobile (≤767, 2 Spalten):** Historie volle Breite, darunter 3D-Wetter + Globus als Paar, dann
Feedback volle Breite. Ohne die Sonderregel für Historie stünde der Globus allein neben einer Lücke.

## 4. Funktionserhalt

- **Alle 9 Kacheln vorhanden und klickbar** — nach Reload gezählt: 7 im Bento + 2 im Hero, jede mit
  ihrem `aria-label` und ihrem realen `FeatureInfo`-Ziel.
- **Kein Feature verloren.** Der mit C entfernte Direktlink war der einzige Verlust an
  Einstiegspunkten; die Wetterkarte bleibt über **Kachel 01** und über die Befehlspalette
  (⌘K → „01 Wetterkarte") erreichbar. Enter im Suchfeld sucht unverändert.
- **Befehlspalette und Bottom-Tab-Bar unverändert** (10 Einträge, keine Änderung an `PALETTE`).
- **Kein anderer Seitenbereich berührt:** Fundament, „Ehrlich bleiben", Footer, Deko-Karte,
  Favoriten, Warm-up (`warmMapData`) und der lazy `MapView`-Prefetch sind unangetastet.

## 5. Verifikation (2026-08-09)

| Prüfung | Ergebnis |
|---|---|
| Desktop 1440×900 | Hero halbiert, Wetterkarte rückt nach oben; 06–09 in einer Reihe |
| Tablet 900×900 | 3er-Reihe + Feedback voll, kein Horizontal-Scroll (`scrollWidth` 885 ≤ 900) |
| Mobile 390×844 | Historie voll · 3D+Globus als Paar · Feedback voll; kein Horizontal-Scroll (485 ≤ 500) |
| Schriftfamilie, berechnet | `h1`, Sub, Eyebrow, Wortmarke, kbd-Chip, Sucheingabe, Filter-Chip, LIVE-Badge → alle **„League Spartan"** |
| Kacheln nach Reload | 7 Bento-Kacheln + 2 Hero-Kacheln, alle mit Ziel |
| Konsole (frisches Laden) | 0 Fehler / 0 Warnungen |
| `npm run typecheck` | grün |

**Ehrlich dazu:** Die Emulation prüft Layout und Typografie zuverlässig, **nicht** die
Schriftdarstellung auf einem echten Telefon (Hinting/Subpixel). Ein Real-Device-Blick auf die
kleinen Mono-Labels („06 · HISTORIE" jetzt in League Spartan mit 3 px Laufweite) steht aus.
Ebenfalls nicht gemessen: ob die League-Spartan-Umstellung den ersten Bildaufbau messbar ändert —
die Datei war schon vorher vorgeladen, eine Änderung ist nicht zu erwarten, belegt ist sie nicht.

---

**Belege:** Messwerte in §3–§5 (Chrome DevTools MCP, 1440×900 / 900×900 / 390×844, 2026-08-09).
