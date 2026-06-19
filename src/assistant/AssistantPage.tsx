/**
 * „Meteorologe, der lokal in deinem Browser läuft" — Feature-Seite.
 *
 * Hängt an der bestehenden Route `id === 'assistant'` (App.tsx). Lädt das lokale
 * LLM erst auf aktive Nutzer-Aktion (Lazy-Load mit Fortschritt), beschreibt
 * Wetterphänomene strikt aus verifizierten Pipeline-Werten (siehe weatherFacts/
 * grounding/prompt) und zeigt auf nicht-WebGPU-Geräten einen sauberen
 * Fallback-Hinweis. Gestaltung nach mockups-v2/21-meteorologe-explainer.svg.
 */

import { useEffect, useRef, useState } from 'react';
import { FeatureTopbar } from '../feature/featureHeader';
import { geocodeDACH, shortLocationName } from '../geocode';
import type { Location } from '../types';
import { useWeatherDescriber } from './useWeatherDescriber';
import { loadLocationFacts, type LocationFacts } from './weatherFacts';
import type { Phenomenon } from './grounding';
import './AssistantPage.css';

const PHENOMENA: { key: Phenomenon; label: string }[] = [
  { key: 'foehn', label: 'Föhn' },
  { key: 'inversion', label: 'Temperaturinversion' },
  { key: 'leewaves', label: 'Lee-Wellen' },
  { key: 'windprofile', label: 'Höhenwindprofil' },
  { key: 'cloudbase', label: 'Wolkenuntergrenze' },
  { key: 'modelspread', label: 'Modell-Unsicherheit' },
];

/** Beispielort für sofortige Föhn-Demo (Innsbruck, Inntal). */
const DEFAULT_LOCATION: Location = { name: 'Innsbruck, Österreich', lat: 47.2692, lon: 11.4041, country: 'AT' };

function gb(mb: number | null): string {
  return mb ? `${(mb / 1024).toFixed(1).replace('.', ',')} GB` : '–';
}

export default function AssistantPage({ onBack }: { onBack: () => void }) {
  const dsc = useWeatherDescriber();
  const { modelMeta, support, state } = dsc;

  // --- Ortssuche + Grounding-Daten -----------------------------------------
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Location[]>([]);
  const [location, setLocation] = useState<Location>(DEFAULT_LOCATION);
  const [facts, setFacts] = useState<LocationFacts | null>(null);
  const [factsLoading, setFactsLoading] = useState(false);
  const [factsError, setFactsError] = useState<string | null>(null);
  const [activePhen, setActivePhen] = useState<Phenomenon | null>(null);
  const factsAbort = useRef<AbortController | null>(null);

  // Grounding-Daten für den gewählten Ort laden (unabhängig vom LLM).
  useEffect(() => {
    factsAbort.current?.abort();
    const ac = new AbortController();
    factsAbort.current = ac;
    setFactsLoading(true);
    setFactsError(null);
    setFacts(null);
    setActivePhen(null);
    void loadLocationFacts(location, ac.signal)
      .then((f) => { if (!ac.signal.aborted) setFacts(f); })
      .catch(() => { if (!ac.signal.aborted) setFactsError('Wetterdaten für diesen Ort nicht verfügbar.'); })
      .finally(() => { if (!ac.signal.aborted) setFactsLoading(false); });
    return () => ac.abort();
  }, [location]);

  // Ortssuche (debounced).
  useEffect(() => {
    if (query.trim().length < 2) { setResults([]); return; }
    const ac = new AbortController();
    const t = setTimeout(() => {
      void geocodeDACH(query, ac.signal).then((r) => { if (!ac.signal.aborted) setResults(r.slice(0, 6)); }).catch(() => {});
    }, 350);
    return () => { clearTimeout(t); ac.abort(); };
  }, [query]);

  const pickPhenomenon = (key: Phenomenon) => {
    const block = facts?.blocks[key];
    if (!block) return;
    setActivePhen(key);
    if (state === 'ready') dsc.describe(block);
  };

  const ready = state === 'ready';
  const activeBlock = activePhen ? facts?.blocks[activePhen] : null;

  return (
    <div className="assistant-page">
      <FeatureTopbar onBack={onBack} />
      <main className="assistant-body">
        {/* ---------- HERO ---------- */}
        <header className="asst-hero">
          <span className="asst-eyebrow">Meteorologe-Assistent · Lokales LLM</span>
          <h1 className="asst-title">Frag den Meteorologen.<br />Direkt im Browser.</h1>
          <p className="asst-sub">
            Ein {modelMeta.paramsLabel}-Sprachmodell (ca.&nbsp;{modelMeta.downloadGB.toFixed(1).replace('.', ',')}&nbsp;GB) — einmal laden,
            dann läuft es auf deinem Gerät. Keine Daten verlassen deinen Browser. Keine Cloud, keine Tracker.
          </p>
        </header>

        {/* ---------- AKTIVIERUNGS-KARTE ---------- */}
        <section className="asst-card">
          <div className="asst-card-head">
            <div className={`asst-avatar ${ready ? 'on' : ''}`} aria-hidden="true">
              <span className="asst-avatar-dot" />
            </div>
            <div className="asst-card-meta">
              <span className="asst-kicker">Modell-Details</span>
              <h2 className="asst-model-name">{modelMeta.label}</h2>
              <p className="asst-model-sub">Quantisiert auf {modelMeta.quant} · WebLLM-Runtime · GPU-beschleunigt via WebGPU</p>
              <span className={`asst-pill ${ready ? 'on' : state === 'downloading' ? 'busy' : ''}`}>
                {ready ? 'Aktiv' : state === 'downloading' ? 'Lädt …' : state === 'unsupported' ? 'Nicht verfügbar' : 'Nicht aktiviert'}
              </span>
            </div>
          </div>

          <div className="asst-stats">
            <div className="asst-stat"><span>Download-Größe</span><strong>ca. {modelMeta.downloadGB.toFixed(1).replace('.', ',')} GB</strong><em>einmalig</em></div>
            <div className="asst-stat"><span>RAM-/VRAM-Bedarf</span><strong>{gb(modelMeta.vramMB)}</strong><em>während Nutzung</em></div>
            <div className="asst-stat"><span>Speicher</span><strong>IndexedDB</strong><em>danach offline</em></div>
            <div className="asst-stat"><span>Inferenz</span><strong>im Worker</strong><em>blockiert nichts</em></div>
          </div>

          {/* System-Kompatibilität / Status */}
          {support && (
            <ul className="asst-compat">
              <li className={support.supported ? 'ok' : 'bad'}>
                {support.supported ? 'WebGPU verfügbar' : 'WebGPU nicht verfügbar'}
              </li>
              <li className={support.supported ? 'ok' : 'bad'}>
                {support.supported ? 'GPU-Beschleunigung aktiv' : 'keine GPU-Beschleunigung'}
              </li>
              <li className="ok">Inferenz im Web Worker (Main-Thread frei)</li>
            </ul>
          )}

          {/* CTA / Fortschritt / Fallback */}
          {state === 'unsupported' ? (
            <div className="asst-unsupported">
              <strong>Dein Gerät unterstützt den lokalen Meteorologen nicht.</strong>
              <p>{support?.reason}</p>
              <p className="asst-fallback-note">Ein Server-Meteorologe als Ausweichlösung ist geplant — bis dahin kannst du die App ohne den Assistenten normal nutzen.</p>
            </div>
          ) : state === 'downloading' ? (
            <div className="asst-progress">
              <div className="asst-progress-bar"><span style={{ width: `${Math.round((dsc.progress?.progress ?? 0) * 100)}%` }} /></div>
              <p className="asst-progress-text">{dsc.progress?.text ?? 'Wird geladen …'}</p>
            </div>
          ) : state === 'ready' ? (
            <p className="asst-ready-note">Modell aktiv — wähle unten ein Phänomen für eine Erklärung.</p>
          ) : state === 'error' ? (
            <div className="asst-unsupported">
              <strong>Modell konnte nicht geladen werden.</strong>
              <p>{dsc.error}</p>
              <button type="button" className="asst-cta" onClick={dsc.activate}>Erneut versuchen</button>
            </div>
          ) : (
            <button type="button" className="asst-cta" onClick={dsc.activate} disabled={state === 'checking'}>
              <DownloadIcon />
              Modell jetzt laden · ca. {modelMeta.downloadGB.toFixed(1).replace('.', ',')} GB
            </button>
          )}
          <p className="asst-card-foot">Du kannst die App ohne den Meteorologen normal nutzen.</p>
        </section>

        {/* ---------- PRIVACY-VERSPRECHEN ---------- */}
        <section className="asst-promises">
          <span className="asst-section-eyebrow">Privacy-Versprechen · anders als Cloud-Chatbots</span>
          <div className="asst-promise-grid">
            <PromiseCard n="01" title="Kein externer API-Call.">Das Modell läuft via WebLLM lokal in deinem Browser-Tab. Keine Anfrage geht an OpenAI, Anthropic oder uns — im DevTools-Network-Panel überprüfbar.</PromiseCard>
            <PromiseCard n="02" title="Funktioniert offline.">Nach dem Download liegt das Modell in IndexedDB. Die Erklärungen entstehen aus Werten, die ohnehin schon in deinem Browser liegen.</PromiseCard>
            <PromiseCard n="03" title="Strikt gegroundet.">Der Meteorologe formuliert nur verifizierte Messwerte unserer Pipelines um — er erfindet keine Zahlen, Orte oder Trends.</PromiseCard>
          </div>
        </section>

        {/* ---------- WERKBANK ---------- */}
        <section className="asst-work">
          <span className="asst-section-eyebrow">Phänomen erklären lassen</span>

          <div className="asst-search">
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Ort suchen (DE · AT · CH) …"
              aria-label="Ort suchen"
            />
            {results.length > 0 && (
              <ul className="asst-search-results">
                {results.map((r) => (
                  <li key={`${r.lat},${r.lon}`}>
                    <button type="button" onClick={() => { setLocation(r); setQuery(''); setResults([]); }}>
                      {shortLocationName(r.name)}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="asst-loc-head">
            <span className="asst-loc-name">{shortLocationName(location.name)}</span>
            {factsLoading && <span className="asst-loc-status">Wetterdaten werden geladen …</span>}
            {factsError && <span className="asst-loc-status err">{factsError}</span>}
          </div>

          <div className="asst-chips" role="group" aria-label="Phänomene">
            {PHENOMENA.map((p) => {
              const available = !!facts?.blocks[p.key];
              return (
                <button
                  key={p.key}
                  type="button"
                  className={`asst-chip${activePhen === p.key ? ' active' : ''}`}
                  disabled={!available || factsLoading}
                  onClick={() => pickPhenomenon(p.key)}
                  title={available ? `„${p.label}" erklären` : 'Für diesen Ort nicht feststellbar'}
                >
                  {p.label}
                </button>
              );
            })}
          </div>

          {/* Chat-Ausgabe */}
          {activeBlock && (
            <div className="asst-chat">
              <div className="asst-chat-q">
                <span className="asst-chat-role">Deine Frage</span>
                <p>„Erkläre {PHENOMENA.find((p) => p.key === activePhen)?.label} für {shortLocationName(location.name)}.“</p>
              </div>
              <div className="asst-chat-a">
                <span className="asst-chat-role">Meteorologe</span>
                {!ready ? (
                  <p className="asst-chat-hint">Lade zuerst das Modell (Karte oben), dann beantworte ich das aus den Messwerten.</p>
                ) : dsc.generation?.phenomenon === activePhen ? (
                  <>
                    <p className="asst-chat-text">
                      {dsc.generation.text || (dsc.generation.status === 'generating' ? 'denkt nach …' : '')}
                      {dsc.generation.status === 'generating' && <span className="asst-caret" />}
                    </p>
                    {dsc.generation.status === 'generating' && (
                      <button type="button" className="asst-stop" onClick={dsc.cancel}>Stopp</button>
                    )}
                    {dsc.generation.status === 'error' && <p className="asst-chat-hint err">Die Generierung ist fehlgeschlagen.</p>}
                  </>
                ) : (
                  <button type="button" className="asst-cta small" onClick={() => dsc.describe(activeBlock)}>Erklärung erzeugen</button>
                )}

                {/* Transparenz: die verwendeten Messwerte */}
                <details className="asst-grounding">
                  <summary>Grundlage ({activeBlock.facts.length} Messwerte)</summary>
                  <ul>
                    {activeBlock.facts.map((f) => (
                      <li key={f.key}><span>{f.label}</span><strong>{f.value}</strong></li>
                    ))}
                  </ul>
                  {activeBlock.caveats.map((c, i) => <p key={i} className="asst-caveat">{c}</p>)}
                </details>
              </div>
            </div>
          )}
        </section>
      </main>
    </div>
  );
}

function PromiseCard({ n, title, children }: { n: string; title: string; children: React.ReactNode }) {
  return (
    <div className="asst-promise">
      <span className="asst-promise-n">Versprechen {n}</span>
      <h3>{title}</h3>
      <p>{children}</p>
    </div>
  );
}

function DownloadIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <line x1="8" y1="2" x2="8" y2="11" /><polyline points="4,7 8,11 12,7" /><line x1="3" y1="14" x2="13" y2="14" />
    </svg>
  );
}
