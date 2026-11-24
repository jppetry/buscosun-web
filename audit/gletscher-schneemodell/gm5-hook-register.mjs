// GM-5 measurement hook (only inside the measuring process): melt.mjs of the frozen copy gets recording wrappers for its imports of
// lib/snowpackcore.mjs and lib/weathercore.mjs. No file of the copy is changed; every wrapped call is passed through unchanged.
import { register } from 'node:module';
register(new URL('./gm5-hook-loader.mjs', import.meta.url));
