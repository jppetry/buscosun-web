/**
 * Node module-resolution hook: retry extensionless RELATIVE specifiers as `.ts`.
 * Lets the Node capture import the real app adapters (which use Vite-style
 * extensionless imports) unchanged, so it cannot drift from the browser path.
 * Built-in `node:module` hooks only — no dependency (Rule 5). Paired with
 * `register-ts.mjs` (via `node --import`).
 */
export async function resolve(specifier, context, nextResolve) {
  try {
    return await nextResolve(specifier, context);
  } catch (err) {
    // Only rescue relative, extensionless specifiers → append '.ts'.
    if (specifier.startsWith('.') && !/\.[cm]?[jt]sx?$|\.json$/i.test(specifier)) {
      try { return await nextResolve(specifier + '.ts', context); } catch { /* fall through */ }
    }
    throw err;
  }
}
