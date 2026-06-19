/**
 * NC-US-D3 / US-D4 — Regen-Alarm-Konfiguration (Mockup 06).
 *
 * Standorte, Intensitäts-Schwelle, Vorlaufzeit, separate Phasen-Warnungen
 * (Gewitter/Hagel, Glätte, Starkregen), Ruhezeiten — plus Live-Vorschau des
 * Alerts aus der aktuellen Nowcast-Punktabfrage und ein Test-Versand über die
 * Web-Notifications-API. Persistenz lokal; reine Auswertung in `nowcastAlerts`.
 */

import { useMemo, useState } from 'react';
import type { Location } from '../types';
import { flagForCountry } from '../geocode';
import type { NowcastQueryResult } from './nowcastQuery';
import {
  ALERT_BANDS, BAND_LABEL, BAND_THRESH_MMH, MIN_LEAD_MIN, MAX_LEAD_MIN, clampLead,
  evaluateAlert, loadConfig, saveConfig, loadLocations, saveLocations, loadState, saveState, recordSent,
  type AlertConfig, type AlertLocation, type AlertThresholds,
} from './nowcastAlerts';

interface Props {
  currentLocation: Location;
  query: NowcastQueryResult | null;
  onClose: () => void;
}

let idSeq = 0;
const newId = () => `loc_${Date.now().toString(36)}_${idSeq++}`;

export default function NowcastAlerts({ currentLocation, query, onClose }: Props) {
  const [config, setConfig] = useState<AlertConfig>(() => loadConfig());
  const [locations, setLocations] = useState<AlertLocation[]>(() => {
    const existing = loadLocations();
    // Aktuellen Standort beim ersten Öffnen anlegen, falls leer.
    if (!existing.length) {
      return [{ id: newId(), name: shortName(currentLocation.name), lat: currentLocation.lat, lon: currentLocation.lon, country: currentLocation.country, enabled: true }];
    }
    return existing;
  });
  const [toast, setToast] = useState<string | null>(null);

  function patchConfig(p: Partial<AlertConfig>) { setConfig((c) => { const n = { ...c, ...p }; saveConfig(n); return n; }); }
  function patchThresholds(p: Partial<AlertThresholds>) { patchConfig({ thresholds: { ...config.thresholds, ...p } }); }
  function patchLocations(next: AlertLocation[]) { setLocations(next); saveLocations(next); }

  const hasCurrent = locations.some((l) => near(l, currentLocation));
  function addCurrent() {
    patchLocations([...locations, { id: newId(), name: shortName(currentLocation.name), lat: currentLocation.lat, lon: currentLocation.lon, country: currentLocation.country, enabled: true }]);
  }

  // Live-Vorschau: werte den ersten aktiven Standort gegen die aktuelle Abfrage aus.
  const preview = useMemo(() => {
    if (!query) return null;
    const loc = locations.find((l) => l.enabled) ?? locations[0];
    if (!loc) return null;
    const now = new Date();
    // Vorschau ignoriert Dedup/Limit/Ruhezeit-Sperre, zeigt aber die Schwellen-Logik.
    const previewState = { lastEventKey: {}, sentMs: [] };
    return evaluateAlert({ ...loc, lat: query.lat, lon: query.lon }, query, config, previewState, { nowMs: now.getTime(), localHour: 14 });
  }, [query, locations, config]);

  async function sendTest() {
    const loc = locations.find((l) => l.enabled) ?? locations[0];
    const draft = preview ?? {
      locationId: loc?.id ?? 'x', kind: 'rain-start' as const, onsetMin: 30, eventKey: 'test',
      title: `Test · Regen-Alarm · ${loc?.name ?? currentLocation.name}`,
      body: 'So sieht eine Buscosun-Nowcast-Benachrichtigung aus.',
    };
    let delivered = false;
    try {
      if ('Notification' in window) {
        let perm = Notification.permission;
        if (perm === 'default') perm = await Notification.requestPermission();
        if (perm === 'granted') { new Notification(draft.title, { body: draft.body }); delivered = true; }
      }
    } catch { /* ignore */ }
    // Dedup-/Limit-Zustand fortschreiben (echter Versand).
    const st = recordSent(loadState(), draft.locationId, draft, Date.now());
    saveState(st);
    setToast(delivered ? 'Test-Benachrichtigung gesendet.' : 'In-App-Vorschau (System-Push nicht erlaubt).');
    window.setTimeout(() => setToast(null), 3500);
  }

  const lead = clampLead(config.thresholds.leadTimeMin);

  return (
    <div className="nc-alerts-overlay" role="dialog" aria-modal="true" aria-label="Regen-Alarme einrichten">
      <div className="nc-alerts-sheet">
        <header className="nc-alerts-head">
          <h2>Regen-Alarme</h2>
          <p>Push vor Regenbeginn an deinem Standort</p>
          <button type="button" className="nc-alerts-close" onClick={onClose} aria-label="Schließen">✕</button>
        </header>

        <div className="nc-alerts-body">
          {/* Standorte */}
          <section className="nc-alerts-sec">
            <span className="nc-alerts-eyebrow">Deine Standorte</span>
            {locations.map((l) => (
              <div key={l.id} className={`nc-alerts-loc${l.enabled ? ' is-on' : ''}`}>
                <span className="nc-alerts-loc-flag">{flagForCountry(l.country)}</span>
                <span className="nc-alerts-loc-name">{l.name}{near(l, currentLocation) ? ' · aktueller Standort' : ''}</span>
                <Toggle on={l.enabled} onChange={(v) => patchLocations(locations.map((x) => x.id === l.id ? { ...x, enabled: v } : x))} />
                <button type="button" className="nc-alerts-loc-del" onClick={() => patchLocations(locations.filter((x) => x.id !== l.id))} aria-label="Standort entfernen">✕</button>
              </div>
            ))}
            {!hasCurrent && (
              <button type="button" className="nc-alerts-add" onClick={addCurrent}>+ Aktuellen Standort hinzufügen</button>
            )}
          </section>

          {/* Intensitäts-Schwelle */}
          <section className="nc-alerts-sec">
            <span className="nc-alerts-eyebrow">Ab welcher Intensität?</span>
            <div className="nc-seg">
              {ALERT_BANDS.map((b) => (
                <button key={b} type="button" className={`nc-seg-btn${config.thresholds.minBand === b ? ' is-active' : ''}`}
                  onClick={() => patchThresholds({ minBand: b })}>
                  <strong>{BAND_LABEL[b]}</strong><em>{BAND_THRESH_MMH[b]} mm/h</em>
                </button>
              ))}
            </div>
            <p className="nc-alerts-hint">Ab {BAND_LABEL[config.thresholds.minBand]} ({BAND_THRESH_MMH[config.thresholds.minBand]} mm/h) — keine Nieselregen-Alerts bei höherer Stufe.</p>
          </section>

          {/* Vorlaufzeit */}
          <section className="nc-alerts-sec">
            <span className="nc-alerts-eyebrow">Wie früh warnen?</span>
            <div className="nc-alerts-leadval">{lead} Minuten Vorlauf</div>
            <input type="range" min={MIN_LEAD_MIN} max={90} step={5} value={lead}
              onChange={(e) => patchThresholds({ leadTimeMin: Number(e.target.value) })} className="nc-alerts-slider" aria-label="Vorlaufzeit" />
            <div className="nc-alerts-ticks"><span>{MIN_LEAD_MIN} min</span><span>30</span><span>60</span><span>90 min</span></div>
            <p className="nc-alerts-hint">Vorlauf ≤ Skill-Horizont ({MAX_LEAD_MIN} min) — darüber keine minutengenauen Alerts.</p>
          </section>

          {/* Separate Warnungen */}
          <section className="nc-alerts-sec">
            <span className="nc-alerts-eyebrow">Separate Warnungen</span>
            <Row icon="⚡" title="Gewitter & Hagel" sub="ab 50 % Wahrscheinlichkeit · Hagel inkl." on={config.thresholds.thunder} onChange={(v) => patchThresholds({ thunder: v })} accent="#D4A373" />
            <Row icon="❄" title="Glätte · gefrier. Regen" sub="eigenes Signal · empfohlen aktiv" on={config.thresholds.glaze} onChange={(v) => patchThresholds({ glaze: v })} accent="#C0392B" />
            <Row icon="💧" title="Starkregen" sub="DWD-Schwelle · Überflutungs-Risiko" on={config.thresholds.heavy} onChange={(v) => patchThresholds({ heavy: v })} accent="#1F4878" />
          </section>

          {/* Ruhezeiten */}
          <section className="nc-alerts-sec">
            <span className="nc-alerts-eyebrow">Ruhezeiten</span>
            <Row icon="🌙" title={`${pad(config.quietHours.fromHour)}:00 – ${pad(config.quietHours.toHour)}:00`} sub="nur kritische Alerts · Gewitter/Glätte"
              on={config.quietHours.enabled} onChange={(v) => patchConfig({ quietHours: { ...config.quietHours, enabled: v } })} accent="#3A6FA8" />
          </section>

          {/* Vorschau */}
          <section className="nc-alerts-sec">
            <span className="nc-alerts-eyebrow">So sieht dein Alert aus</span>
            <div className="nc-alerts-preview">
              <div className="nc-alerts-preview-icon" />
              <div className="nc-alerts-preview-body">
                <span className="nc-alerts-preview-app">BUSCOSUN NOWCAST</span>
                {preview ? (
                  <>
                    <span className="nc-alerts-preview-title">{preview.title}</span>
                    <span className="nc-alerts-preview-text">{preview.body}</span>
                  </>
                ) : (
                  <span className="nc-alerts-preview-text">{query ? 'Aktuell kein Alarm: in den nächsten ' + lead + ' Min keine Schwellenüberschreitung.' : 'Keine aktuelle Abfrage für die Vorschau.'}</span>
                )}
              </div>
            </div>
          </section>

          {/* Hinweise */}
          <div className="nc-alerts-note nc-alerts-note-good">
            <strong>✓ Keine doppelten Alerts</strong>
            Pro Ereignis nur eine Benachrichtigung — kein Spam bei Modell-Updates (max. {config.maxPerDay}/Tag).
          </div>
          <div className="nc-alerts-note nc-alerts-note-info">
            <strong>ⓘ Vorlauf ≤ Skill-Horizont</strong>
            Über {MAX_LEAD_MIN} min Vorlauf sind keine minutengenauen Alerts möglich — wir warnen dann gröber.
          </div>

          <button type="button" className="nc-alerts-test" onClick={() => void sendTest()}>Test-Benachrichtigung senden</button>
          {toast && <div className="nc-alerts-toast">{toast}</div>}
        </div>
      </div>
    </div>
  );
}

// --- Kleinteile --------------------------------------------------------------

function Toggle({ on, onChange }: { on: boolean; onChange: (v: boolean) => void }) {
  return (
    <button type="button" role="switch" aria-checked={on} className={`nc-switch${on ? ' is-on' : ''}`} onClick={() => onChange(!on)}>
      <span className="nc-switch-knob" />
    </button>
  );
}

function Row({ icon, title, sub, on, onChange, accent }: { icon: string; title: string; sub: string; on: boolean; onChange: (v: boolean) => void; accent: string }) {
  return (
    <div className="nc-alerts-row">
      <span className="nc-alerts-row-icon" style={{ background: `${accent}22`, color: accent }}>{icon}</span>
      <span className="nc-alerts-row-body">
        <span className="nc-alerts-row-title">{title}</span>
        <span className="nc-alerts-row-sub">{sub}</span>
      </span>
      <Toggle on={on} onChange={onChange} />
    </div>
  );
}

function shortName(name: string): string { return name.split(',')[0]; }
function pad(h: number): string { return h.toString().padStart(2, '0'); }
function near(l: { lat: number; lon: number }, loc: Location): boolean {
  return Math.abs(l.lat - loc.lat) < 0.02 && Math.abs(l.lon - loc.lon) < 0.02;
}
