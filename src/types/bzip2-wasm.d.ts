declare module 'bzip2-wasm' {
  /** WASM-kompiliertes bzip2 (Emscripten). ~100× schneller als pure-JS bz2. */
  export default class BZip2 {
    /** Lädt + initialisiert die WASM. Vor allen anderen Methoden aufrufen. */
    init(): Promise<void>;
    /**
     * Entpackt einen bz2-Puffer. `decompressedLength` ist die ZIEL-Puffergröße
     * (muss ≥ der tatsächlichen entpackten Länge sein; großzügig über-allokieren).
     * Gibt eine `Uint8Array` der tatsächlichen entpackten Länge zurück.
     */
    decompress(compressed: Uint8Array | ArrayLike<number>, decompressedLength: number): Uint8Array;
    compress(decompressed: Uint8Array | ArrayLike<number>, blockSize?: number, compressedSize?: number): Uint8Array;
  }
}
