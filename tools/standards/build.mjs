// Build the compact gym-goer strength standards table the app ships.
// Usage: node tools/standards/build.mjs path/to/strength_standards.json
// Output: web/public/standards/gym-standards.json
//
// The source model (build_standards.py + strength_standards.json) lives
// outside this repo; docs/STANDARDS-METHODOLOGY.md is its methodology.
// This keeps only what rate() needs: the lognormal fits, the scaling
// constants, the age/female factors, per-exercise ratios for loaded lifts and
// the per-sex level tables for bodyweight lifts.
//
// The source JSON stores the fits rounded to 4 decimals. To match the model
// exactly, the squat/bench/deadlift fits are recomputed at full precision from
// the anchor percentiles it also stores (same formula as _fit() in the model),
// and checked against the rounded values.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../..');
const OUT = path.join(root, 'web/public/standards/gym-standards.json');

const src = process.argv[2];
if (!src) {
  console.error('usage: node tools/standards/build.mjs path/to/strength_standards.json');
  process.exit(2);
}
const model = JSON.parse(fs.readFileSync(path.resolve(src), 'utf8'));
const m = model.meta;

const LB = 2.2046226; // kg -> lb constant used by the source model
const LEVELS = [['beginner', 5], ['novice', 20], ['intermediate', 50], ['advanced', 80], ['elite', 95]];

// Inverse standard normal CDF, central region only (|p - 0.5| <= 0.425), which
// is all the fit needs. Wichura AS241, the algorithm Python's
// statistics.NormalDist.inv_cdf uses; the full version is in
// web/src/benchmarks/normal.ts.
function invNorm(p) {
  const q = p - 0.5;
  if (Math.abs(q) > 0.425) throw new Error('invNorm: only the central region is needed here');
  const r = 0.180625 - q * q;
  const num = (((((((2.5090809287301226727e+3 * r + 3.3430575583588128105e+4) * r + 6.7265770927008700853e+4) * r
    + 4.5921953931549871457e+4) * r + 1.3731693765509461125e+4) * r + 1.9715909503065514427e+3) * r
    + 1.3314166789178437745e+2) * r + 3.3871328727963666080e+0) * q;
  const den = ((((((5.2264952788528545610e+3 * r + 2.8729085735721942674e+4) * r + 3.9307895800092710610e+4) * r
    + 2.1213794301586595867e+4) * r + 5.3941960214247511077e+3) * r + 6.8718700749205790830e+2) * r
    + 4.2313330701600911252e+1) * r + 1.0;
  return num / den;
}

function fitFromAnchors([p50lb, p75lb, p90lb]) {
  const [p50, p75, p90] = [p50lb, p75lb, p90lb].map(x => x / LB);
  const s75 = Math.log(p75 / p50) / invNorm(0.75);
  const s90 = Math.log(p90 / p50) / invNorm(0.9);
  return [Math.log(p50), (s75 + s90) / 2];
}

const round4 = x => Math.round(x * 1e4) / 1e4;
const fit = {};
for (const lift of ['squat', 'bench', 'deadlift']) {
  const f = fitFromAnchors(m.anchor_lb_p50_p75_p90[lift]);
  const [mu4, s4] = m.fit_lognormal_mu_sigma_kg[lift];
  if (round4(f[0]) !== mu4 || round4(f[1]) !== s4) throw new Error(`fit for ${lift} does not match the source (${f} vs ${mu4},${s4})`);
  fit[lift] = f;
}
{
  // OHP is not fitted: median = bench p50 x a fixed fraction, sigma assumed.
  const [mu4, sigma] = m.fit_lognormal_mu_sigma_kg.ohp;
  const benchP50lb = m.anchor_lb_p50_p75_p90.bench[0];
  const fraction = Math.round((Math.exp(mu4) * LB / benchP50lb) * 100) / 100;
  const mu = Math.log((benchP50lb * fraction) / LB);
  if (round4(mu) !== mu4) throw new Error(`ohp fraction ${fraction} does not reproduce mu ${mu4}`);
  fit.ohp = [mu, sigma];
}

const loaded = [];
const bodyweight = [];
for (const e of model.exercises) {
  if (e.load_type === 'bodyweight') {
    const tab = s => LEVELS.map(([l]) => e.standards[s][l]);
    bodyweight.push({ id: e.id, name: e.name, unit: e.unit, confidence: e.confidence, ...(e.note ? { note: e.note } : {}), male: tab('male'), female: tab('female') });
  } else {
    if (!fit[e.base_lift]) throw new Error(`unknown base lift ${e.base_lift} for ${e.id}`);
    loaded.push({ id: e.id, name: e.name, base: e.base_lift, ratio: e.ratio_to_base, loadType: e.load_type, unit: e.unit, confidence: e.confidence, ...(e.note ? { note: e.note } : {}) });
  }
}

const out = {
  v: 1,
  meta: {
    population: 'Modeled self-reported gym-goers (not competition lifters)',
    levels: LEVELS,
    confidence: m.confidence,
    source: 'GymBro gym-goer strength standards model (docs/STANDARDS-METHODOLOGY.md).',
    attribution: 'Squat, bench and deadlift anchors: Symmetric Strength self-reported gym logs, via FitnessVolt aggregates (CC BY 4.0, attribution). Everything else is modeled.',
    licenceNote: 'The licence of the anchor source (Symmetric Strength) has not been verified.',
    loadTypes: m.load_types,
  },
  fit,
  refBw: m.reference_bodyweight_kg,
  bwExp: m.bodyweight_exponent,
  bwClamp: m.bodyweight_scaling_clamp_kg,
  female: m.female_factor,
  age: m.age_factor_assumed,
  loaded,
  bodyweight,
};

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify(out) + '\n');
console.log(`${loaded.length} loaded + ${bodyweight.length} bodyweight exercises -> ${path.relative(root, OUT)} (${fs.statSync(OUT).size} bytes)`);
