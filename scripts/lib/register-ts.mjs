/**
 * Registers the extensionless-.ts resolve hook (ts-hooks.mjs). Use via:
 *   node --experimental-strip-types --import ./scripts/lib/register-ts.mjs <script.mjs>
 * so a Node script can import the real app source (adapters, fixtureBuild) that
 * uses Vite-style extensionless imports.
 */
import { register } from 'node:module';
register('./ts-hooks.mjs', import.meta.url);
