// Build OpenPowerlifting strength benchmarks (aggregates only, no names).
// Usage: node tools/benchmarks/build.mjs [path/to/openpowerlifting-YYYY-MM-DD-xxxx.csv]
// Output: web/public/benchmarks/opl-<datadate>.json + index.json
import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../..');
const rawDir = path.join(here, 'raw');

function findCsv() {
  if (process.argv[2]) return path.resolve(process.argv[2]);
  const stack = [rawDir];
  let found = null;
  while (stack.length) {
    const d = stack.pop();
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) stack.push(p);
      else if (/openpowerlifting-\d{4}-\d{2}-\d{2}.*\.csv$/.test(e.name) && (!found || p > found)) found = p;
    }
  }
  if (!found) throw new Error('no OPL csv found in ' + rawDir);
  return found;
}

const PCTS = [5, 10, 25, 50, 75, 90, 95, 99];
const AGE_BANDS = ['<=23', '24-34', '35-39', '40-44', '45-49', '50-54', '55-59', '60+'];
const BW_MIN = 45, BW_STEP = 5, BW_COUNT = 21; // band 0 = <50, band 20 = >=145
const THIN = 200;

const ageBand = (a) => (a <= 23 ? 0 : a <= 34 ? 1 : a <= 39 ? 2 : a <= 44 ? 3 : a <= 49 ? 4 : a <= 54 ? 5 : a <= 59 ? 6 : 7);
const bwBand = (w) => Math.min(BW_COUNT - 1, Math.max(0, Math.floor((w - BW_MIN) / BW_STEP)));

// CSV line splitter handling quoted fields (and "" escapes). OPL has no embedded newlines.
function splitCsv(line) {
  const out = [];
  let i = 0;
  const n = line.length;
  while (i <= n) {
    if (line[i] === '"') {
      let s = '';
      i++;
      while (i < n) {
        if (line[i] === '"') {
          if (line[i + 1] === '"') { s += '"'; i += 2; continue; }
          i++;
          break;
        }
        s += line[i++];
      }
      out.push(s);
      i++; // skip comma
    } else {
      const j = line.indexOf(',', i);
      if (j === -1) { out.push(line.slice(i)); break; }
      out.push(line.slice(i, j));
      i = j + 1;
      if (i === n) { out.push(''); break; }
    }
  }
  return out;
}

function ageOf(age, ageClass) {
  if (age) {
    const a = parseFloat(age);
    if (Number.isFinite(a) && a > 0) return Math.floor(a);
  }
  const m = /^(\d+)-(\d+)$/.exec(ageClass || '');
  if (m) {
    const lo = +m[1], hi = +m[2];
    return hi >= 100 ? lo : (lo + hi) / 2;
  }
  const p = /^(\d+)\+$/.exec(ageClass || '');
  return p ? +p[1] : null;
}

const csv = findCsv();
const dataDate = (/(\d{4}-\d{2}-\d{2})/.exec(path.basename(csv)) || [])[1];
if (!dataDate) throw new Error('cannot read data date from filename');

const stats = { rows: 0, sbd: 0, raw: 0, wraps: 0, notDq: 0, valid: 0, withAge: 0, withBw: 0 };
// lifter key -> best record, per population
const best = { tested: new Map(), all: new Map() };

const rl = readline.createInterface({ input: fs.createReadStream(csv, { encoding: 'utf8' }), crlfDelay: Infinity });
let col = null;
for await (const line of rl) {
  if (!col) {
    col = Object.fromEntries(splitCsv(line).map((h, i) => [h, i]));
    continue;
  }
  if (!line) continue;
  stats.rows++;
  const f = splitCsv(line);
  if (f[col.Event] !== 'SBD') continue;
  stats.sbd++;
  const eq = f[col.Equipment];
  if (eq === 'Wraps') { stats.wraps++; continue; } // counted separately, excluded from distributions
  if (eq !== 'Raw') continue;
  stats.raw++;
  const place = f[col.Place];
  if (place === 'DQ' || place === 'DD' || place === 'NS') continue;
  stats.notDq++;
  const sq = +f[col.Best3SquatKg], bn = +f[col.Best3BenchKg], dl = +f[col.Best3DeadliftKg];
  if (!(sq > 0 && bn > 0 && dl > 0)) continue;
  const total = +f[col.TotalKg];
  if (!(total > 0)) continue;
  stats.valid++;
  const sex = f[col.Sex];
  if (sex !== 'M' && sex !== 'F') continue; // Mx excluded
  const age = ageOf(f[col.Age], f[col.AgeClass]);
  if (age == null) continue;
  stats.withAge++;
  const bw = +f[col.BodyweightKg];
  if (!(bw > 0)) continue;
  stats.withBw++;
  const rec = { total, sq, bn, dl, bw, age, sex };
  const key = f[col.Name] + '\u0000' + sex;
  const pops = f[col.Tested] === 'Yes' ? ['tested', 'all'] : ['all'];
  for (const p of pops) {
    const cur = best[p].get(key);
    if (!cur || total > cur.total) best[p].set(key, rec);
  }
}

// Collect per-bucket value lists.
const LIFTS = ['sq', 'bn', 'dl', 'total'];
function bucketize(map) {
  const b = new Map(); // "sex.age.bw" -> {sq:[],bn:[],dl:[],total:[]}
  for (const r of map.values()) {
    const k = `${r.sex}.${ageBand(r.age)}.${bwBand(r.bw)}`;
    let e = b.get(k);
    if (!e) { e = { sq: [], bn: [], dl: [], total: [] }; b.set(k, e); }
    for (const l of LIFTS) e[l].push(r[l]);
  }
  return b;
}

function pct(sorted, p) {
  const idx = (p / 100) * (sorted.length - 1);
  const lo = Math.floor(idx), hi = Math.ceil(idx);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
}
const r1 = (x) => Math.round(x * 10) / 10;

function build(map) {
  const b = bucketize(map);
  const out = {};
  const popStats = { lifters: map.size, buckets: 0, thin: 0, pooled1: 0, pooled2: 0 };
  for (const sex of ['M', 'F']) {
    for (let a = 0; a < AGE_BANDS.length; a++) {
      for (let w = 0; w < BW_COUNT; w++) {
        const own = b.get(`${sex}.${a}.${w}`);
        const nOwn = own ? own.sq.length : 0;
        let radius = 0;
        let n = nOwn;
        const pool = (r) => {
          const lists = { sq: [], bn: [], dl: [], total: [] };
          let cnt = 0;
          for (let x = Math.max(0, w - r); x <= Math.min(BW_COUNT - 1, w + r); x++) {
            const e = b.get(`${sex}.${a}.${x}`);
            if (!e) continue;
            cnt += e.sq.length;
            for (const l of LIFTS) for (const v of e[l]) lists[l].push(v);
          }
          return { lists, cnt };
        };
        let lists;
        if (nOwn >= THIN) lists = own;
        else {
          let p = pool(1);
          radius = 1;
          if (p.cnt < THIN) { p = pool(2); radius = 2; }
          lists = p.lists; n = p.cnt;
        }
        if (n === 0) continue;
        const thin = n < THIN ? 1 : 0;
        if (radius === 1) popStats.pooled1++;
        if (radius === 2) popStats.pooled2++;
        if (thin) popStats.thin++;
        popStats.buckets++;
        const row = [n, thin, radius];
        for (const l of LIFTS) {
          const s = Float64Array.from(lists[l]).sort();
          for (const p of PCTS) row.push(r1(pct(s, p)));
        }
        out[`${sex}.${a}.${w}`] = row;
      }
    }
  }
  return { buckets: out, popStats };
}

const tested = build(best.tested);
const all = build(best.all);

const generatedAt = new Date().toISOString();
const doc = {
  v: 1,
  dataDate,
  percentiles: PCTS,
  ageBands: AGE_BANDS,
  bw: { min: BW_MIN, step: BW_STEP, count: BW_COUNT },
  lifts: LIFTS,
  // bucket key "sex.ageBand.bwBand" -> [n, thin(0/1), poolRadius, ...8 pcts x (squat, bench, deadlift, total)]
  rowLayout: 'n,thin,poolRadius,squat[8],bench[8],deadlift[8],total[8]',
  tested: tested.buckets,
  all: all.buckets,
};
const outDir = path.join(root, 'web/public/benchmarks');
fs.mkdirSync(outDir, { recursive: true });
const name = `opl-${dataDate}.json`;
const json = JSON.stringify(doc);
fs.writeFileSync(path.join(outDir, name), json);
fs.writeFileSync(
  path.join(outDir, 'index.json'),
  JSON.stringify(
    {
      latest: name,
      dataDate,
      generatedAt,
      attribution:
        'OpenPowerlifting (openpowerlifting.org), public domain. Aggregated percentiles of raw full-power meet results, one best result per lifter.',
    },
    null,
    2,
  ) + '\n',
);

console.log('csv', csv, 'dataDate', dataDate);
console.log('row counts', stats);
console.log('unique lifters tested', tested.popStats, 'all', all.popStats);
console.log('output', name, (json.length / 1024).toFixed(1), 'KB');
