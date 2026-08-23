/**
 * Leichter, marken-getönter Fallback während ein Routen-Chunk lädt
 * (`HydrateFallback` des Routers + `<Suspense>`-Fallback im Layout).
 * Selbsttragend gestylt (designTokens.css ist eager geladen), damit kein
 * seiten-spezifisches CSS nötig ist, das ja erst mit dem Chunk käme.
 */
export default function AppLoader() {
  return (
    <div
      style={{
        minHeight: '100vh', display: 'grid', placeItems: 'center',
        background: 'var(--cream-50, #FAF6EA)', color: 'var(--stone-600, #5C5447)',
        fontFamily: 'var(--font-base, ui-sans-serif, system-ui, -apple-system, sans-serif)',
      }}
    >
      <style>{'@keyframes app-spin{to{transform:rotate(360deg)}}'}</style>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.85rem' }}>
        <div
          style={{
            width: 34, height: 34, borderRadius: '50%',
            border: '3px solid var(--sand-200, #E0D6BE)',
            borderTopColor: 'var(--terracotta-500, #C97B47)',
            animation: 'app-spin 0.8s linear infinite',
          }}
          aria-hidden="true"
        />
        <span style={{ fontSize: '0.9rem' }}>lädt …</span>
      </div>
    </div>
  );
}
