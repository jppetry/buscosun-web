/// <reference types="vite/client" />

// `bz2` (SheetJS) hat keine Typen und hängt sich an `window.bz2` bzw.
// `globalThis.bz2`. Deklaration nur, damit der dynamische Import im Worker
// typecheckt — die eigentliche API lesen wir über window/globalThis.
declare module 'bz2';

// jsfive (pure-JS HDF5-Reader) hat keine Typen — minimale Deklaration für die
// von meteoSwissRadar.ts genutzte API.
declare module 'jsfive' {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  export class File {
    constructor(buffer: ArrayBuffer, filename?: string);
    keys: string[];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    get(path: string): any;
  }
}
