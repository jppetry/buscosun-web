/**
 * linalg.ts — the little dense linear algebra the fit of phase FL needs (`audit/fusion-lernphase.md` §3.2–§3.3):
 * symmetric positive-definite solves (Cholesky with a jitter ladder), inverse, and a Jacobi eigen-decomposition for
 * repairing a covariance estimate. Hand-written on purpose (D-06: no numerics dependency), plain Float64Array,
 * row-major n×n. Deterministic.
 */

/** Cholesky factor L (lower) of a symmetric PD matrix A (n×n, row-major); returns null when not PD. */
export function cholesky(A: Float64Array, n: number): Float64Array | null {
  const L = new Float64Array(n * n);
  for (let j = 0; j < n; j++) {
    let d = A[j * n + j];
    for (let k = 0; k < j; k++) d -= L[j * n + k] * L[j * n + k];
    if (!(d > 0) || !Number.isFinite(d)) return null;
    const ljj = Math.sqrt(d);
    L[j * n + j] = ljj;
    for (let i = j + 1; i < n; i++) {
      let s = A[i * n + j];
      for (let k = 0; k < j; k++) s -= L[i * n + k] * L[j * n + k];
      L[i * n + j] = s / ljj;
    }
  }
  return L;
}

/** Solve L Lᵀ x = b in place of a fresh vector. */
export function cholSolve(L: Float64Array, n: number, b: Float64Array): Float64Array {
  const y = new Float64Array(n);
  for (let i = 0; i < n; i++) { let s = b[i]; for (let k = 0; k < i; k++) s -= L[i * n + k] * y[k]; y[i] = s / L[i * n + i]; }
  const x = new Float64Array(n);
  for (let i = n - 1; i >= 0; i--) { let s = y[i]; for (let k = i + 1; k < n; k++) s -= L[k * n + i] * x[k]; x[i] = s / L[i * n + i]; }
  return x;
}

/**
 * Solve A x = b for symmetric A with a jitter ladder: A + ε·diag(A) for ε ∈ {0, 1e-10, 1e-8, …, 1e-2}. Returns the
 * solution and the ε that was needed (0 = clean). Null when even the largest jitter fails.
 */
export function solveSpd(A: Float64Array, n: number, b: Float64Array): { x: Float64Array; jitter: number } | null {
  const ladder = [0, 1e-10, 1e-8, 1e-6, 1e-4, 1e-2];
  for (const eps of ladder) {
    let M = A;
    if (eps > 0) {
      M = new Float64Array(A);
      for (let i = 0; i < n; i++) M[i * n + i] += eps * Math.max(Math.abs(A[i * n + i]), 1e-12);
    }
    const L = cholesky(M, n);
    if (L) return { x: cholSolve(L, n, b), jitter: eps };
  }
  return null;
}

/** Inverse of a symmetric PD matrix via Cholesky (column by column); null when not PD after jitter. */
export function invSpd(A: Float64Array, n: number): Float64Array | null {
  const ladder = [0, 1e-10, 1e-8, 1e-6, 1e-4, 1e-2];
  for (const eps of ladder) {
    let M = A;
    if (eps > 0) { M = new Float64Array(A); for (let i = 0; i < n; i++) M[i * n + i] += eps * Math.max(Math.abs(A[i * n + i]), 1e-12); }
    const L = cholesky(M, n);
    if (!L) continue;
    const inv = new Float64Array(n * n);
    const e = new Float64Array(n);
    for (let j = 0; j < n; j++) { e.fill(0); e[j] = 1; const col = cholSolve(L, n, e); for (let i = 0; i < n; i++) inv[i * n + j] = col[i]; }
    return inv;
  }
  return null;
}

/** Jacobi eigen-decomposition of a symmetric matrix: eigenvalues (unsorted) and eigenvectors as columns of V. */
export function jacobiEigen(A: Float64Array, n: number, maxSweeps = 60): { values: Float64Array; vectors: Float64Array } {
  const a = new Float64Array(A);
  const v = new Float64Array(n * n);
  for (let i = 0; i < n; i++) v[i * n + i] = 1;
  for (let sweep = 0; sweep < maxSweeps; sweep++) {
    let off = 0;
    for (let p = 0; p < n; p++) for (let q = p + 1; q < n; q++) off += a[p * n + q] * a[p * n + q];
    if (off < 1e-22) break;
    for (let p = 0; p < n; p++) {
      for (let q = p + 1; q < n; q++) {
        const apq = a[p * n + q];
        if (Math.abs(apq) < 1e-300) continue;
        const theta = (a[q * n + q] - a[p * n + p]) / (2 * apq);
        const t = Math.sign(theta || 1) / (Math.abs(theta) + Math.sqrt(theta * theta + 1));
        const c = 1 / Math.sqrt(t * t + 1), s = t * c;
        for (let k = 0; k < n; k++) {
          const akp = a[k * n + p], akq = a[k * n + q];
          a[k * n + p] = c * akp - s * akq; a[k * n + q] = s * akp + c * akq;
        }
        for (let k = 0; k < n; k++) {
          const apk = a[p * n + k], aqk = a[q * n + k];
          a[p * n + k] = c * apk - s * aqk; a[q * n + k] = s * apk + c * aqk;
        }
        for (let k = 0; k < n; k++) {
          const vkp = v[k * n + p], vkq = v[k * n + q];
          v[k * n + p] = c * vkp - s * vkq; v[k * n + q] = s * vkp + c * vkq;
        }
      }
    }
  }
  const values = new Float64Array(n);
  for (let i = 0; i < n; i++) values[i] = a[i * n + i];
  return { values, vectors: v };
}

/** Repair a symmetric matrix to PD: eigenvalues floored at `floorFrac` × the largest (never below `absFloor`). */
export function nearestPd(A: Float64Array, n: number, floorFrac = 1e-6, absFloor = 1e-12): Float64Array {
  const { values, vectors } = jacobiEigen(A, n);
  let max = 0;
  for (let i = 0; i < n; i++) max = Math.max(max, values[i]);
  const floor = Math.max(absFloor, floorFrac * max);
  const out = new Float64Array(n * n);
  for (let k = 0; k < n; k++) {
    const lam = Math.max(floor, values[k]);
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) out[i * n + j] += lam * vectors[i * n + k] * vectors[j * n + k];
  }
  return out;
}

export const matVec = (A: Float64Array, n: number, x: Float64Array): Float64Array => {
  const y = new Float64Array(n);
  for (let i = 0; i < n; i++) { let s = 0; for (let j = 0; j < n; j++) s += A[i * n + j] * x[j]; y[i] = s; }
  return y;
};
export const dot = (a: Float64Array, b: Float64Array): number => { let s = 0; for (let i = 0; i < a.length; i++) s += a[i] * b[i]; return s; };
