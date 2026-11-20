// Number formatting that reproduces Python's f-string output, so ported
// criterion and rationale text matches the retired engine word for word.
// JS `toFixed` rounds exact ties away from zero; Python rounds them to even
// (format(100.25, '.1f') == '100.2'). Weights like 100.25 do occur.

/** Python `format(x, '.Nf')`. */
export function pyFixed(x: number, digits: number): string {
  if (!Number.isFinite(x)) return x > 0 ? 'inf' : x < 0 ? '-inf' : 'nan';
  const plain = x.toFixed(digits);
  // toFixed with many digits is exact for doubles, so a tie shows as "5000…".
  const wide = Math.abs(x).toFixed(Math.min(100, digits + 30));
  const dot = wide.indexOf('.');
  const tail = wide.slice(dot + 1 + digits);
  if (!/^50*$/.test(tail)) return plain;
  const truncated = digits === 0 ? wide.slice(0, dot) : wide.slice(0, dot + 1 + digits);
  const lastDigit = Number(truncated[truncated.length - 1]);
  if (lastDigit % 2 === 1) return plain; // odd: rounding away (what JS did) lands on even
  return (x < 0 ? '-' : '') + truncated;
}

/** Python `format(x, 'g')` (6 significant digits, trailing zeros stripped). */
export function pyG(x: number): string {
  if (x === 0) return Object.is(x, -0) ? '-0' : '0';
  if (!Number.isFinite(x)) return x > 0 ? 'inf' : x < 0 ? '-inf' : 'nan';
  const ax = Math.abs(x);
  const sign = x < 0 ? '-' : '';
  let e = Math.floor(Math.log10(ax));
  if (10 ** e > ax) e -= 1;
  if (10 ** (e + 1) <= ax) e += 1;
  if (e >= -4 && e < 6) {
    let s = pyFixed(ax, 5 - e);
    // Rounding can carry into a new digit (9.999995 -> 10.0000); Python picks
    // the notation from the rounded value.
    if (Number(s) >= 10 ** (e + 1)) {
      e += 1;
      if (e >= 6) return sign + expForm(ax);
      s = pyFixed(ax, 5 - e);
    }
    return sign + stripZeros(s);
  }
  return sign + expForm(ax);
}

function stripZeros(s: string): string {
  if (!s.includes('.')) return s;
  return s.replace(/0+$/, '').replace(/\.$/, '');
}

function expForm(ax: number): string {
  // Only reached for |x| >= 1e6 or < 1e-4, which never appears in training
  // numbers; exact tie handling is not attempted here.
  const [m, ex] = ax.toExponential(5).split('e');
  const n = Number(ex);
  return `${stripZeros(m)}e${n < 0 ? '-' : '+'}${String(Math.abs(n)).padStart(2, '0')}`;
}

/** Python `repr(list_of_ints)`: "[8, 8, 7]". */
export function pyList(xs: readonly number[]): string {
  return `[${xs.map((n) => String(n)).join(', ')}]`;
}

/** Python `round(x)` on a float: nearest integer, exact ties to even. */
export function pyRound(x: number): number {
  const f = Math.floor(x);
  const diff = x - f;
  if (diff > 0.5) return f + 1;
  if (diff < 0.5) return f;
  return f % 2 === 0 ? f : f + 1;
}
