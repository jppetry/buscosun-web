/**
 * Typen für das erzeugte Bündel `shareParser.js` — sie kommen aus der QUELLE.
 *
 * Diese Datei ist der einzige handgeschriebene Teil der Brücke, und sie enthält
 * bewusst keine Signatur: sie leitet weiter. Damit kann sie nicht von der
 * Implementierung abweichen, auch wenn sich `src/share/edgeShare.ts` ändert —
 * ein handgepflegter Typvertrag neben einem erzeugten Bündel wäre genau die
 * zweite Wahrheit, die diese Phase überall vermeidet.
 *
 * Zur Laufzeit spielt sie keine Rolle: Deno liest `.js`, TypeScript liest `.d.ts`.
 */
export * from '../../src/share/edgeShare.ts';
