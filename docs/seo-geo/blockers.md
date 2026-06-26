# blockers.md — seo-geo Fail-Stops & Lücken

Hier landen fehlgeschlagene Gates (Ursache + Fix-Vorschlag) und dokumentierte
Lücken (z. B. nicht erreichte CWV-Schwellen mit Begründung).

## Kein Fail-Stop bisher.

### Nicht-blockierende Beobachtungen (0.4 CWV)
CWV-Schwellen sind grün (Home LCP 257 ms / CLS 0.00; Ort LCP 938 ms / CLS 0.00).
Folgende App-interne Punkte sind **optionale** Optimierungen, bewusst NICHT
umgesetzt (Eingriff in den laufenden interaktiven MapLibre-/SPA-Pfad = Risiko
ohne CWV-Nutzen; Daten-/Architektur-Leitplanke):
- Home: render-blocking CSS (`assets/index-*.css`, ~368 kB) — könnte kritisch
  inlined / gesplittet werden.
- Home: ein Forced-Reflow während des SPA-Mounts (Layout-Thrashing).
- App-Bundle `index-*.js` ~2.3 MB (gzip 687 kB) — Code-Splitting für MapLibre/
  Globus/Atmosphäre würde TTI verbessern, betrifft aber nicht die indexierten
  statischen Seiten.
Empfehlung: separat im App-Repo angehen, nicht im SEO-Paket.
