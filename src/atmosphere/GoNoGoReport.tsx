/**
 * E-7 — der PDF-Knopf des Arbeitsfensters ist kein Knopf ohne Funktion mehr.
 *
 * ── Was hier entschieden wurde ──────────────────────────────────────────────
 * Der Knopf stand seit dem Command-Deck-Redesign da (`vsd-toppill`, Download-
 * Symbol, „PDF") **ohne `onClick`**, und die Bildunterschrift versprach
 * daneben: „Auswertung enthält Ort, Zeit, Höhe, Werte, Grenzwert & Status —
 * als PDF/Link exportierbar." Ein Versprechen, das die Oberfläche gibt und der
 * Code nicht hält, ist schlimmer als ein fehlender Knopf.
 *
 * Drei Wege standen zur Wahl:
 *  (a) **PDF-Bibliothek** (jsPDF, pdf-lib): eine neue Laufzeit-Abhängigkeit für
 *      eine Seite — Dependency-Gate, STOPP & FRAGEN, und ~100 KB im Bundle.
 *  (b) **Knopf entfernen**: löst das Versprechen, nimmt aber eine Funktion weg,
 *      die die Zielgruppe (Drohnen-, Kran-, Gerüstarbeit) wirklich braucht —
 *      eine Auswertung, die man ausdruckt und ins Flugbuch legt.
 *  (c) **Der Druckweg des Browsers.** Jeder Browser hat im Druckdialog „Als PDF
 *      speichern"; es braucht nur eine Seite, die für Papier gebaut ist.
 *
 * Gewählt: **(c)**. Kein Byte neue Abhängigkeit, funktioniert offline, und das
 * Ergebnis ist genau das, was die Bildunterschrift zusagt — plus die Ehrlichkeit
 * über Modell und Grenzen, die auf Papier noch wichtiger ist als am Schirm.
 *
 * ── Wie ─────────────────────────────────────────────────────────────────────
 * Dieses Bauteil rendert per `createPortal` an den Body einen Block, der am
 * Schirm `display: none` ist und im Druck als EINZIGES sichtbar (`#root` wird
 * ausgeblendet, `atmosphereDeck.css`, `@media print`). Damit muss das Deck für
 * den Druck nicht umgebaut werden — und ein Ausdruck zeigt nie eine halb
 * abgeschnittene Bedienoberfläche.
 */
import { createPortal } from 'react-dom';
import type { GoNoGoConfig, GoNoGoResult } from '../threed/goNoGo';
import type { PreparedSection } from '../threed/buildCrossSection';
import { DEFAULT_ALPHA } from '../threed/crossSection';
import type { Location } from '../types';

/** Druck anstoßen — der Browser bietet im Dialog „Als PDF speichern" an. */
export function printGoNoGoReport(): void {
  if (typeof window !== 'undefined') window.print();
}

const dt = (ms: number) => new Intl.DateTimeFormat('de-DE', {
  weekday: 'short', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
}).format(new Date(ms));
const hm = (ms: number) => new Intl.DateTimeFormat('de-DE', { hour: '2-digit', minute: '2-digit' }).format(new Date(ms));
const km = (v: number) => `${Math.round(v)} km/h`;
const de = (v: number, digits = 1) => v.toFixed(digits).replace('.', ',');

export interface GoNoGoReportProps {
  res: GoNoGoResult | null;
  prepared: PreparedSection | null;
  cfg: GoNoGoConfig;
  location: Location | null;
}

export default function GoNoGoReport({ res, prepared, cfg, location }: GoNoGoReportProps) {
  if (typeof document === 'undefined') return null;
  const now = Date.now();
  // Der exponierteste Anker ist der, den `evaluateGoNoGo` auswertet — der
  // Bericht muss denselben nennen, sonst beschreibt er eine andere Stelle.
  const ref = prepared?.anchors.reduce((a, b) => (b.elevM > a.elevM ? b : a), prepared.anchors[0]) ?? null;
  /** Das erste Fenster über dem Limit, das noch kommt (für die Statuszeile). */
  const nextWindow = res?.noGoWindows.find((w) => w.endMs >= now) ?? null;

  return createPortal(
    <div className="vsd-print" aria-hidden="true">
      <div className="vsd-print-head">
        <div>
          <div className="vsd-print-brand">buscosun</div>
          <h1>Arbeitsfenster · Go / No-Go</h1>
        </div>
        <div className="vsd-print-meta">
          <div>Erstellt: {dt(now)}</div>
          <div>buscosun.com</div>
        </div>
      </div>

      {!res || !prepared ? (
        <p className="vsd-print-empty">
          Für diesen Ausdruck liegt noch keine Auswertung vor: es fehlt die Schnittlinie.
          Auf „Höhenwind" wechseln, eine Linie zeichnen, dann steht die Go/No-Go-Auswertung
          hier — mit Ort, Zeit, Höhe, Werten, Grenzwert und Status.
        </p>
      ) : (
        <>
          <table className="vsd-print-grid">
            <tbody>
              <tr><th>Ort</th><td>{location?.name ?? 'Schnittlinie'}{ref ? ` · ${de(ref.lat, 4)}, ${de(ref.lon, 4)} · ${Math.round(ref.elevM)} m ü. NN` : ''}</td></tr>
              <tr><th>Arbeitshöhe</th><td>{cfg.heightAglM} m über Grund</td></tr>
              <tr><th>Böen-Limit</th><td>{cfg.gustLimitKmh} km/h (eigener Grenzwert)</td></tr>
              <tr><th>Zeitfenster</th><td>{dt(prepared.startMs)} bis {dt(prepared.endMs)}</td></tr>
              <tr><th>Modelllauf</th><td>{dt(prepared.runAtMs)}</td></tr>
            </tbody>
          </table>

          {/*
            Der Status gilt für JETZT. Auf Papier ist das gefährlich zu kurz:
            ein großes „GO" über einem No-Go-Fenster, das in einer Viertelstunde
            beginnt, liest sich wie eine Freigabe für den Tag. Das nächste
            Fenster steht deshalb in derselben Zeile — am Schirm sieht man das
            Band, der Ausdruck muss es sagen.
          */}
          <div className={`vsd-print-status vsd-print-status--${res.status}`}>
            {res.status === 'go' ? 'GO' : 'NO-GO'}
            <span>
              {res.status === 'go'
                ? `jetzt ${hm(now)}: Böen auf Arbeitshöhe unter dem Limit (${km(res.gustNowKmh)} von ${cfg.gustLimitKmh} km/h).`
                : `jetzt ${hm(now)}: Böen auf Arbeitshöhe über dem Limit (${km(res.gustNowKmh)} von ${cfg.gustLimitKmh} km/h).`}
              {nextWindow ? ` Nächstes Fenster über dem Limit ab ${hm(nextWindow.startMs)} (bis ${hm(nextWindow.endMs)}, ${km(nextWindow.maxGustKmh)}).` : ''}
            </span>
          </div>

          <table className="vsd-print-grid">
            <tbody>
              <tr><th>Böen auf Arbeitshöhe, jetzt</th><td>{km(res.gustNowKmh)}</td></tr>
              <tr><th>Spitze im Zeitfenster</th><td>{km(res.peakGustKmh)}</td></tr>
              <tr><th>Bodenwert (10 m)</th><td>{km(res.groundGustKmh)}</td></tr>
              <tr><th>Höhenfaktor</th><td>×{de(res.heightFactor)} (Potenzprofil, α = {de(DEFAULT_ALPHA, 2)})</td></tr>
            </tbody>
          </table>

          <h2>Fenster über dem Limit</h2>
          {res.noGoWindows.length === 0 ? (
            <p className="vsd-print-p">
              Im ausgewerteten Zeitfenster überschreiten die Böen auf {cfg.heightAglM} m das
              Limit von {cfg.gustLimitKmh} km/h nicht.
            </p>
          ) : (
            <table className="vsd-print-list">
              <thead><tr><th>von</th><th>bis</th><th>höchste Böe</th></tr></thead>
              <tbody>
                {res.noGoWindows.map((w) => (
                  <tr key={w.startMs}><td>{hm(w.startMs)}</td><td>{hm(w.endMs)}</td><td>{km(w.maxGustKmh)}</td></tr>
                ))}
              </tbody>
            </table>
          )}

          <h2>Woher die Zahlen kommen</h2>
          <p className="vsd-print-p">
            Böen aus dem Vertikalschnitt über DWD ICON-D2 (Gitterzellen ≈ 2 km), ausgewertet
            am exponiertesten Punkt der Schnittlinie im 15-Minuten-Raster. Die Umrechnung vom
            10-m-Wert auf die Arbeitshöhe ist ein Potenzprofil mit α = {de(DEFAULT_ALPHA, 2)},
            begrenzt auf die Grenzschicht — eine Modellannahme, keine Messung in dieser Höhe.
          </p>
          <p className="vsd-print-p vsd-print-warn">
            <strong>Keine amtliche Freigabe und keine Flugerlaubnis.</strong> Dieser Ausdruck
            ist eine Modellauswertung mit dem selbst gesetzten Grenzwert und ersetzt weder die
            Prüfung vor Ort noch die Vorgaben des Betreibers oder der Luftaufsicht.
          </p>

          <p className="vsd-print-link">Diese Ansicht als Link: {typeof window !== 'undefined' ? window.location.href : ''}</p>
        </>
      )}
    </div>,
    document.body,
  );
}
