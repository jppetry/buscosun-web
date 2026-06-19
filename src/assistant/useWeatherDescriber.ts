/**
 * React-Hook für den Meteorologen-Assistenten.
 *
 * Kapselt die Engine-State-Machine (Capability-Check → Lazy-Download mit
 * Fortschritt → bereit → generierend), die Generierung mit Streaming und den
 * Abbruch bei Navigation/Unmount. Hält KEINE Daten — der Grounding-Block kommt
 * vom Aufrufer (Page).
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  checkWebGpuSupport, loadEngine, generate, isEngineLoaded,
  type WebGpuSupport, type LoadProgress,
} from './engine';
import { getModelMeta, type ModelMeta } from './model';
import { buildMessages } from './prompt';
import type { GroundingBlock, Phenomenon } from './grounding';

export type EngineState = 'checking' | 'unsupported' | 'idle' | 'downloading' | 'ready' | 'error';

export interface Generation {
  phenomenon: Phenomenon;
  text: string;
  status: 'generating' | 'done' | 'error';
}

export interface DescriberApi {
  support: WebGpuSupport | null;
  state: EngineState;
  progress: LoadProgress | null;
  error: string | null;
  modelMeta: ModelMeta;
  generation: Generation | null;
  /** Modell herunterladen + initialisieren (erst auf aktive Nutzer-Aktion). */
  activate: () => void;
  /** Ein Phänomen grounded beschreiben (streamt in `generation`). */
  describe: (block: GroundingBlock) => void;
  /** Laufende Generierung abbrechen. */
  cancel: () => void;
}

export function useWeatherDescriber(): DescriberApi {
  const [support, setSupport] = useState<WebGpuSupport | null>(null);
  const [state, setState] = useState<EngineState>('checking');
  const [progress, setProgress] = useState<LoadProgress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [generation, setGeneration] = useState<Generation | null>(null);

  const modelMeta = getModelMeta();
  const genAbort = useRef<AbortController | null>(null);
  const mounted = useRef(true);

  // Capability-Check beim Mount (vor jedem Download).
  useEffect(() => {
    mounted.current = true;
    void checkWebGpuSupport().then((s) => {
      if (!mounted.current) return;
      setSupport(s);
      if (!s.supported) setState('unsupported');
      else setState(isEngineLoaded() ? 'ready' : 'idle');
    });
    return () => {
      mounted.current = false;
      // Abbruch bei Navigation/Unmount, falls gerade generiert wird.
      genAbort.current?.abort();
    };
  }, []);

  const activate = useCallback(() => {
    setState((prev) => {
      if (prev !== 'idle' && prev !== 'error') return prev;
      setError(null);
      setProgress(null);
      void loadEngine((p) => { if (mounted.current) setProgress(p); })
        .then(() => { if (mounted.current) setState('ready'); })
        .catch((e) => {
          if (!mounted.current) return;
          setError(e instanceof Error ? e.message : 'Modell konnte nicht geladen werden.');
          setState('error');
        });
      return 'downloading';
    });
  }, []);

  const describe = useCallback((block: GroundingBlock) => {
    if (!isEngineLoaded()) return;
    genAbort.current?.abort();
    const ac = new AbortController();
    genAbort.current = ac;
    setGeneration({ phenomenon: block.phenomenon, text: '', status: 'generating' });
    void generate(buildMessages(block), {
      temperature: 0.3,
      signal: ac.signal,
      onToken: (_d, full) => {
        if (!mounted.current || ac.signal.aborted) return;
        setGeneration((g) => (g && g.phenomenon === block.phenomenon ? { ...g, text: full } : g));
      },
    })
      .then((full) => {
        if (!mounted.current || ac.signal.aborted) return;
        setGeneration((g) => (g && g.phenomenon === block.phenomenon ? { phenomenon: block.phenomenon, text: full, status: 'done' } : g));
      })
      .catch((err) => {
        if (!mounted.current || ac.signal.aborted || (err as Error)?.name === 'AbortError') return;
        setGeneration((g) => (g ? { ...g, status: 'error' } : g));
      });
  }, []);

  const cancel = useCallback(() => {
    genAbort.current?.abort();
    setGeneration(null);
  }, []);

  return { support, state, progress, error, modelMeta, generation, activate, describe, cancel };
}
