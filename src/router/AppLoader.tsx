/**
 * Marken-Lader: buscosun-Marke mit Ladekreis, während ein Routen-Chunk lädt
 * (`HydrateFallback` des Routers + `<Suspense>`-Fallback im Layout).
 * Selbsttragend gestylt (designTokens.css ist eager geladen), damit kein
 * seiten-spezifisches CSS nötig ist, das ja erst mit dem Chunk käme.
 *
 * `cover`: dieselbe Ansicht als Vollbild-Abdeckung ÜBER einer schon gerenderten Seite
 * (Brandradar: bis Karte und Daten da sind) — gleiche Stelle, gleiche Farben, damit der
 * Übergang vom Chunk-Lader nicht springt. `done` blendet sie aus.
 */
const MARK = 'url(/buscosun-mark.svg) center / contain no-repeat';

export default function AppLoader({ cover = false, done = false }: { cover?: boolean; done?: boolean }) {
  return (
    <div
      role="status"
      aria-hidden={done || undefined}
      style={{
        ...(cover
          ? {
            position: 'fixed' as const, inset: 0, zIndex: 400,
            opacity: done ? 0 : 1, visibility: done ? 'hidden' as const : 'visible' as const, pointerEvents: done ? 'none' as const : 'auto' as const,
            transition: 'opacity .3s ease, visibility 0s linear .3s',
          }
          : { minHeight: '100vh' }),
        display: 'grid', placeItems: 'center',
        background: 'var(--cream-50, #FAF6EA)',
      }}
    >
      <style>{'@keyframes app-spin{to{transform:rotate(360deg)}}'}</style>
      <div
        style={{
          gridArea: '1 / 1', width: 104, height: 104, borderRadius: '50%', boxSizing: 'border-box',
          border: '3px solid var(--sand-200, #E0D6BE)',
          borderTopColor: 'var(--terracotta-500, #C97B47)',
          animation: done ? 'none' : 'app-spin 0.9s linear infinite',
        }}
        aria-hidden="true"
      />
      <div
        style={{
          gridArea: '1 / 1', width: 56, height: 56,
          backgroundColor: 'var(--terracotta-500, #C97B47)',
          WebkitMask: MARK, mask: MARK,
        }}
        aria-hidden="true"
      />
      <span style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)', whiteSpace: 'nowrap' }}>lädt …</span>
    </div>
  );
}
