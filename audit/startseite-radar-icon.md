# Startseite — Radar-Glyphe der Kachel „04 · Nowcast“ (RI1)

> Auftrag Jan 2026-10-03: „das SVG-Icon auf der Regenradar-Kachel auf der Startseite interaktiv machen, sodass es sich
> modern bewegt“. Punktuelle Änderung (s. Memory „Design ruhig & punktuell“): nur die 64-px-Glyphe, Kachel und Layout
> unverändert.

## 1 Diagnose (Ist)

- Ort: `src/SearchPage.tsx` `TILE_NOWCAST` (Hero-Paar ab 1025 px, sonst Bento-Grid — immer genau eine Instanz),
  CSS `src/SearchPage.css` „Nowcast“.
- Glyphe: drei Ringe (`--sand-200`), Mittelpunkt und eine Linie (`--steel-600`), die per CSS-Keyframe `deck-spin`
  in 4 s linear rotiert. Kein Nachleuchten, keine Echos, keine Reaktion auf Zeiger oder Fokus.
  `prefers-reduced-motion` hält die Linie an (statisches Bild: Linie (32,32) → (58,24)).
- Die Startseite ist lazy (`router.tsx`: `HomeRoute` per `import()`), der Code zählt also nur in `totalJs`, nicht in
  `eagerJs`.
- Mit reinem CSS lässt sich die Drehgeschwindigkeit beim Hover nicht ohne Sprung ändern, und der Strahl kann dem Zeiger
  nicht folgen ⇒ eine kleine rAF-Schleife ist nötig.

## 2 Plan

Neue Komponente `src/RadarSweepIcon.tsx` ersetzt das Inline-SVG; Geometrie (viewBox 64, Ringe, Mittelpunkt) bleibt.

- **Ruhe:** Strahl dreht im Uhrzeigersinn, 4 s je Umlauf wie bisher, mit Nachleuchten (24 gestapelte Keile à 3° bis
  72° hinter dem Strahl, gemeinsame Vorderkante ⇒ keine Nähte; 7°-Stufen waren bei DPR 3 als Streifen sichtbar). Fünf Echos (Regenband NO, Zelle SW) leuchten auf, wenn der
  Strahl sie überstreicht, und klingen in 1,1 s ab (PPI-Bild).
- **Hover (Maus/Stift, nicht Touch):** Strahl dreht sich gedämpft zum Zeiger (τ 90 ms), ein Ring läuft einmal nach
  außen; ruht der Strahl auf einem Echo, bleibt es hell. Das Nachleuchten folgt der Drehrichtung und verblasst, wenn der
  Strahl steht. Beim Verlassen beschleunigt er stetig zurück in den Umlauf (τ 500 ms) — keine Sprünge.
- **`prefers-reduced-motion`:** kein eigener Umlauf und kein Ping, Ruhebild = Strahl an der bisherigen Position. Der
  Strahl folgt aber dem Zeiger (Bewegung, die der Nutzer selbst auslöst) und bleibt nach dem Verlassen dort stehen;
  danach läuft die Schleife aus. Grund: der Prüf-Chrome dieser Maschine meldet `reduce` (typisch: Windows
  „Animationen in Windows anzeigen“ aus) — die alte Linie stand dort also schon immer still.
- **Kosten:** DOM direkt aus EINER rAF-Schleife (kein React-State je Frame), Schleife nur solange die Glyphe sichtbar
  ist (IntersectionObserver); Hintergrund-Tabs pausieren rAF ohnehin.

## 3 Umsetzung

- `src/RadarSweepIcon.tsx` (neu): Komponente wie in §2; Echo-Treffer, wenn der Strahl im Frame darüberstreicht ODER
  innerhalb des Winkels liegt, den das Echo vom Mittelpunkt aus abdeckt (statt fester 4° — sonst blieb das Echo dunkel,
  auf das der Zeiger zeigt). Zeiger-Ereignisse hängen an der umgebenden `.deck-tile` (passiv, kein `preventDefault`).
- `src/SearchPage.tsx`: `TILE_NOWCAST` rendert `<RadarSweepIcon />` statt des Inline-SVG; Kachel, Text, `aria-label`,
  Klickziel und Filter-Dimmung unverändert.
- `src/SearchPage.css`: `deck-spin`/`.tile-radar-sweep` (nur hier benutzt) ersetzt durch Klassen für Ringe, Nachleuchten,
  Strahl, Echos, Ping; Farben aus den Tokens `--sand-200`/`--steel-600` wie bisher.
- `budget.json`: totalJs 1518 → 1520 (Notiz dort).

## 4 Gate (2026-10-03)

Prüfskript (Scratchpad, eigener `chrome-headless-shell` über `scripts/lib/cdpBrowser.mjs`, echte Mausereignisse per
`Input.dispatchMouseEvent`, `prefers-reduced-motion` per `Emulation.setEmulatedMedia`, Dev-Server :5214). Der Chrome-MCP
war unbrauchbar: Tab im Hintergrund, `document.hidden`, 0 rAF/s.

| Prüfung | Desktop 1440×900 | Desktop, reduced motion | Mobil 390×844 DPR 3 |
|---|---|---|---|
| Umlauf in Ruhe (in der Seite gemessen) | 88–89 °/s (Soll 90) | 0 °/s | 89 °/s |
| Zeiger SW ⇒ Strahlwinkel | 135° | 135° | 135° (nur Maus; Touch ignoriert) |
| Zeiger NO ⇒ Echo unter dem Strahl | 0,90 (hell) | 0,90 | 0,90 |
| nach dem Verlassen | 87–93 °/s | 0 °/s, bleibt stehen, Schleife endet | 87–93 °/s |
| Ping (r / Deckkraft je Frame) | 4 → 28,4 / 0,49 → 0 in 0,9 s | aus | — |
| größte Frame-Lücke (120 Frames) | 16,8 ms | 16,8 ms | 16,8 ms |
| Konsole (Fehler/Warnungen) | 0 | 0 | 0 |

- Bilder (Ruhe, Hover SW/NO, nach dem Verlassen, mobil) im Scratchpad der Sitzung angesehen; das Nachleuchten mit
  7°-Keilen zeigte bei DPR 3 Streifen ⇒ 3°-Keile, danach glatt.
- `npm run typecheck` 0 Fehler; `npm run build` grün (verify-seo 803 ok, verify-routing **249/249**).
- `npm run budget` grün nach Anhebung: eagerJs **108,6** / 108,7 (unverändert), totalJs **1519,1** / 1520. Kontrollbau
  HEAD `07cc7cf` im Worktree: totalJs 1517,5; Chunk-Vergleich: nur `HomeRoute` +1,5 KB gzip (16,05 → 17,55), sonst kein
  Chunk > 20 B anders.
- `verify-dashboard-switch` (einziger Verifier, der die Startseite nennt) gegen `vite preview`: **49/50 — identisch an HEAD**
  (49/50, dieselbe Prüfung (B) „0 WebGL-Draws hinter dem Dashboard“ rot) ⇒ vorbestehend, nicht RI1. Gegen den
  Dev-Server 43/50, weil dort keine benannten Chunks (`MapView-*.js`) existieren — kein Befund.

**Fünf Selbstverifikations-Fragen**
1. Funktionserhalt: Kachel bleibt derselbe `<button>` aus `makeTile` (Klick ⇒ Nowcast, `aria-label`, Dimmung, Tab-Index);
   das SVG bleibt `aria-hidden`; Ringe, Mittelpunkt und Strahl sind da. Der Klick selbst wurde nicht im Browser
   ausgelöst — die Listener sind passiv, am Code geprüft.
2. Desktop pixelgleich: absichtlich geändert ist nur die 64-px-Glyphe; Maß 64×64 und Container unverändert. Kein
   Pixel-Diff der übrigen Seite gegen HEAD gemacht.
3. Touch-Targets: unverändert (ganze Kachel).
4. Konsole sauber: 0 Fehler/Warnungen in allen drei Profilen.
5. Long Tasks: in headless-shell nicht messbar (bekannt); größte Frame-Lücke 16,8 ms, je Frame nur ein Dutzend
   `setAttribute`. Real-Device offen.

**Offen:** Real-Device (iOS/Android) — dort läuft nur der Umlauf, kein Hover; Commit = Jans Gate.
