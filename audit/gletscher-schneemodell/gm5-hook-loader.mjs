// GM-5 resolve hook: redirects ONLY the two relative imports of the copy's melt.mjs to the recording wrappers next to this file.
const MELT_RE = /\/buscosun-glacier-cache\/gm5\/code\/scripts\/glacier\/melt\.mjs$/i;
const WRAP = {
  './lib/snowpackcore.mjs': new URL('./gm5-hook-snowpack.mjs', import.meta.url).href,
  './lib/weathercore.mjs': new URL('./gm5-hook-weather.mjs', import.meta.url).href,
};
export async function resolve(specifier, context, next) {
  if (MELT_RE.test(context.parentURL ?? '') && WRAP[specifier]) return { url: WRAP[specifier], shortCircuit: true };
  return next(specifier, context);
}
