// Standard normal CDF and its inverse, written out so the standards model
// needs no dependency. Both are accurate to ~1e-15 (absolute) — far tighter
// than the ~1e-6 the percentile maths needs.

/**
 * Φ(x) by Marsaglia's series, Φ(x) = ½ + φ(x)·(x + x³/3 + x⁵/(3·5) + …).
 * Every term has the sign of x, so there is no cancellation inside the sum;
 * past |x| = 10 the result is 0 or 1 to double precision.
 */
export function normCdf(x: number): number {
  if (Number.isNaN(x)) return NaN;
  if (x <= -10) return 0;
  if (x >= 10) return 1;
  let term = x;
  let sum = x;
  const x2 = x * x;
  for (let n = 3; n < 2000; n += 2) {
    term *= x2 / n;
    const next = sum + term;
    if (next === sum) break;
    sum = next;
  }
  return 0.5 + sum * Math.exp(-0.5 * x2 - 0.91893853320467274178); // ln √(2π)
}

/** Φ⁻¹(p), Wichura's AS241 (PPND16) — the algorithm Python's NormalDist.inv_cdf uses. */
export function normInv(p: number): number {
  if (!(p > 0 && p < 1)) {
    if (p === 0) return -Infinity;
    if (p === 1) return Infinity;
    return NaN;
  }
  const q = p - 0.5;
  if (Math.abs(q) <= 0.425) {
    const r = 0.180625 - q * q;
    const num = (((((((2.5090809287301226727e+3 * r + 3.3430575583588128105e+4) * r + 6.7265770927008700853e+4) * r
      + 4.5921953931549871457e+4) * r + 1.3731693765509461125e+4) * r + 1.9715909503065514427e+3) * r
      + 1.3314166789178437745e+2) * r + 3.3871328727963666080e+0) * q;
    const den = ((((((5.2264952788528545610e+3 * r + 2.8729085735721942674e+4) * r + 3.9307895800092710610e+4) * r
      + 2.1213794301586595867e+4) * r + 5.3941960214247511077e+3) * r + 6.8718700749205790830e+2) * r
      + 4.2313330701600911252e+1) * r + 1.0;
    return num / den;
  }
  let r = Math.sqrt(-Math.log(q <= 0 ? p : 1 - p));
  let num: number;
  let den: number;
  if (r <= 5) {
    r -= 1.6;
    num = ((((((7.7454501427834140764e-4 * r + 2.2723844989269184583e-2) * r + 2.4178072517745061177e-1) * r
      + 1.2704582524523683826e+0) * r + 3.6478483247632045960e+0) * r + 5.7694972214606914055e+0) * r
      + 4.6303378461565452959e+0) * r + 1.4234371107496835773e+0;
    den = ((((((1.0507500716444168432e-9 * r + 5.4759380849953449460e-4) * r + 1.5198666563616457197e-2) * r
      + 1.4810397642748007459e-1) * r + 6.8976733498510000455e-1) * r + 1.6763848301838038494e+0) * r
      + 2.0531916266377588219e+0) * r + 1.0;
  } else {
    r -= 5;
    num = ((((((2.0103343992922881326e-7 * r + 2.7115555687434875782e-5) * r + 1.2426609473880784386e-3) * r
      + 2.6532189526576123093e-2) * r + 2.9656057182850489123e-1) * r + 1.7848265399172913358e+0) * r
      + 5.4637849111641143699e+0) * r + 6.6579046435011037772e+0;
    den = ((((((2.0442631033899397856e-15 * r + 1.4215117583164458887e-7) * r + 1.8463183175100546818e-5) * r
      + 7.8686913114561329059e-4) * r + 1.4875361290850614853e-2) * r + 1.3692988092273580531e-1) * r
      + 5.9983220655588793769e-1) * r + 1.0;
  }
  const x = num / den;
  return q < 0 ? -x : x;
}
