// The engine's sentences, English template → Chinese template. Values are
// {name} placeholders and must appear in both (keys.test.ts checks). Templates
// are written as readable() shows them: "×" not "x", lists without brackets.
// A template with no {placeholder} is a plain word or phrase ("double").
//
// Sentences the engine builds from pieces get one entry per piece plus a
// joining entry ("{a} — held: {b}"), so every combination reads without a
// template for each. Values that are words ({word}, {area}) translate to text
// that starts and ends in Chinese, so they sit next to Chinese without a space.
// engine-coverage.test.ts runs real engine output through this table.
import type { Dict } from './types';

const zh: Dict = {
  // ---- pieces: rep words, sides and areas, days
  single: '單次',
  double: '雙次',
  triple: '三次',
  '{n}-rep set': '一組 {n} 次',
  'top set': '最重組',
  'left {area}': '左{area}',
  'right {area}': '右{area}',
  neck: '頸部',
  shoulder: '肩膀',
  elbow: '手肘',
  wrist: '手腕',
  'upper back': '上背',
  'lower back': '下背',
  hip: '髖部',
  knee: '膝蓋',
  ankle: '腳踝',
  other: '其他部位',
  bodyweight: '自身體重',
  today: '今天',
  yesterday: '昨天',
  '{d} days ago': '{d} 天前',

  // ---- joining pieces
  '{a} — held: {b}': '{a}——先維持：{b}',
  '{a} — held for a red readiness day': '{a}——今天狀態紅燈，先維持',
  '{a} — eased for a tired day (autoregulation)': '{a}——今天疲累，調輕（自我調節）',
  '{a}; back-offs topped {n}s at {w}kg — add {inc}kg': '{a}；遞減組 {w}kg 已做滿 {n} 次——加 {inc}kg',
  '{a}; back-offs were too easy ({n}+ RIR) at {w}kg — add {inc}kg': '{a}；遞減組 {w}kg 太輕鬆（{n}+ RIR）——加 {inc}kg',
  '{a}; back-offs stay at {w}kg, chasing {reps} reps': '{a}；遞減組維持 {w}kg，目標 {reps} 次',
  '{a}, then {b}': '{a}，接著 {b}',
  '{reason}: {from}kg → {to}kg': '{reason}：{from}kg → {to}kg',
  '{p}kg refused — {why}; capped at {limit}kg': '不採用 {p}kg——{why}；上限 {limit}kg',

  // ---- why: models.ts
  're-entry after {days}+ days: {sets} × {reps} at your last logged working weight ({w}kg on {date}), then normal progression':
    '休息 {days}+ 天後回歸：用你上次記錄的正式組重量（{date} 的 {w}kg）做 {sets} × {reps}，之後恢復正常漸進',
  'repeated pain on a loaded area': '受力部位反覆疼痛',
  'first session back after a layoff: anchored on your last logged session, no jump': '停練後第一次回來：以你上次記錄的訓練為準，不加重',
  'maintenance: hold {w}kg for {sets} × {reps} — no progression on this slot': '維持：{w}kg 做 {sets} × {reps}——這一項不做漸進',
  'seed from recent best (e1RM {e1}kg incl. bodyweight x {pct}% training max) — start 5 × 5 at +{w}kg added':
    '依近期最佳推算（e1RM {e1}kg，含體重，× {pct}% 訓練最大值）——5 × 5 從加重 +{w}kg 開始',
  'first top-set session: best recent e1RM {e1}kg → a {word} with {rir} RIR left ≈ {w}kg':
    '第一次做最重組：近期最佳 e1RM {e1}kg → {word}、保留 {rir} RIR ≈ {w}kg',
  'top {word} at {w}kg failed — down {inc}kg': '最重組 {w}kg {word}失敗——減 {inc}kg',
  'top {word} at {w}kg went past the floor ({rir} RIR, floor {floor}) — down {inc}kg':
    '最重組 {w}kg {word}超過強度底線（{rir} RIR，底線 {floor}）——減 {inc}kg',
  'no effort logged on the top {word} at {w}kg — repeat it and rate it': '最重組 {w}kg {word}沒有記錄強度——重複一次並記錄強度',
  'top {word} at {w}kg left {rir} RIR (floor {floor}) — add {inc}kg': '最重組 {w}kg {word}還剩 {rir} RIR（底線 {floor}）——加 {inc}kg',
  'top {word} at {w}kg landed on the floor ({rir} RIR) — repeat it': '最重組 {w}kg {word}剛好在底線（{rir} RIR）——再重複一次',
  'from your starting set {w} × {reps}: a {word} with {rir} in reserve ≈ {to} kg':
    '從你的起始組 {w} × {reps} 推算：{word}、保留 {rir} 下餘力 ≈ {to} kg',
  'Your weight': '你選的重量',
  'Your sets': '你自己的組',
  'new lift — start here and build': '新動作——從這裡開始累積',

  // ---- why: port/progression.ts, port/strength.ts
  'topped {max}s across {n} sets at {w}kg — add {inc}kg, reset to {min}': '{w}kg {n} 組都做滿 {max} 次——加 {inc}kg，次數回到 {min}',
  'hit {max} at {w}kg but only {n} set(s) — repeat {w}kg for more sets before adding weight':
    '{w}kg 做到 {max} 次但只有 {n} 組——先用 {w}kg 多做幾組再加重',
  'stay at {w}kg — add a rep toward {max} on every set (last: {list})': '維持 {w}kg——每組多做一下，朝 {max} 次前進（上次：{list}）',
  'seed from recent best (e1RM {e1}kg × {pct}% training max) — start 5 × 5 at {w}kg':
    '依近期最佳推算（e1RM {e1}kg × {pct}% 訓練最大值）——5 × 5 從 {w}kg 開始',
  'new lift — no history to seed from, start light': '新動作——沒有紀錄可推算，從輕重量開始',
  'completed 5 × 5 at {w}kg — add {inc}kg (progressive overload)': '{w}kg 完成 5 × 5——加 {inc}kg（漸進超負荷）',
  '{n} straight incomplete sessions at {w}kg — deload to {to}kg (planned fatigue management)':
    '{w}kg 連續 {n} 次訓練沒完成——減量到 {to}kg（計畫性疲勞管理）',
  'incomplete last time ({list}) — repeat {w}kg and finish all 5 × 5 (repeated exposure before load increase)':
    '上次沒完成（{list}）——重複 {w}kg，做完全部 5 × 5（先重複驗證再加重）',

  // ---- why: effort.ts (floor raisers and the jump cap)
  're-entry session: every compound set at 3 RIR': '回歸訓練：每個複合動作組都保留 3 RIR',
  'readiness red': '狀態紅燈',
  'first session after a {days}-day gap': '間隔 {days} 天後的第一次訓練',
  'first session after a layoff: no jump': '停練後第一次訓練：不加重',
  'after a layoff jumps are capped at {w}kg (5% or one increment)': '停練後加重上限為 {w}kg（5% 或一次增量）',
  'jumps are capped at one increment ({w}kg)': '加重上限為一次增量（{w}kg）',
  // readable() turns "capped at 0kg" into "capped at bodyweight" too; here it means no jump at all.
  'after a layoff jumps are capped at bodyweight (5% or one increment)': '停練後加重上限為 0kg（5% 或一次增量）',

  // ---- why: pain.ts
  'pain flagged on this lift last session (severity {n}) — hold the load': '上次訓練這個動作標記了疼痛（程度 {n}）——維持重量',
  'two pain flags (severity 2+) on the {area} within {days} days — regress 10% and +1 RIR until a clean session':
    '{days} 天內{area}兩次標記疼痛（程度 2+）——退 10% 並 +1 RIR，直到一次沒有疼痛的訓練',
  'pain on the {area} in the last {days} days — +1 RIR': '最近 {days} 天{area}有疼痛——+1 RIR',
  'protecting the {area} (profile) — +1 RIR': '保護{area}（個人資料）——+1 RIR',

  // ---- criterion
  'Top {word} at {w}kg ({floor}), then {n} × {reps}+ at {b}kg. Both parts count; a heavier top {word} at the same effort beats it.':
    '最重組 {w}kg {word}（{floor}），接著遞減組 {b}kg 做 {n} × {reps}+。兩部分都算；同樣強度下更重的最重組{word}就算超越。',
  'Do these sets in order: {list}. Each at its weight for at least its reps; more weight or reps beats it.':
    '依序做這些組：{list}。每組用它的重量，至少做到它的次數；重量或次數更多就算超越。',
  '{n} × {reps} at {w}kg': '{w}kg 做 {n} × {reps}',
  '{n} × {reps} at {w}': '{w} 做 {n} × {reps}',
  'Do {sets} × {reps}+ at {w}kg. More reps or more weight beats it.': '{w}kg 做 {sets} × {reps}+。次數或重量更多就算超越。',
  'Work up to a top {word} and log your back-offs — this session sets the baseline.': '漸進加重到最重組{word}，並記錄遞減組——這次訓練建立基準。',
  'Log your sets at {w}kg — this session sets the baseline.': '記錄你在 {w}kg 的每一組——這次訓練建立基準。',
  'Log your sets — this session sets the baseline.': '記錄你的每一組——這次訓練建立基準。',
  'Do {sets} × {reps} at {w}kg — done is the goal; there is no beat.': '{w}kg 做 {sets} × {reps}——完成就是目標，沒有超越。',
  'Complete all {sets} sets of {reps} at {w}kg — that earns the next jump.': '{w}kg 完成全部 {sets} 組 × {reps} 次——就能換到下一次加重。',
  'Hit {w}kg × {reps} on at least one set — reaching the new weight at target reps counts.':
    '至少一組做到 {w}kg × {reps}——新重量達到目標次數就算。',
  "Repeat {w}kg × {reps} for {n}+ sets — one good set proved you can; two prove it's yours.":
    '{w}kg × {reps} 重複 {n}+ 組——一組好的證明你做得到；兩組證明它是你的。',
  'Match or beat {total} total reps at {w}kg (last time: {list}).': '{w}kg 總次數追平或超越 {total} 次（上次：{list}）。',
  'Beat {total} total reps at {w}kg (last time: {list}).': '{w}kg 總次數超越 {total} 次（上次：{list}）。',
  'First time: pick a weight': '第一次：選一個重量',
  'Top {w} × {reps}, then {n} × {r} at {b}': '最重組 {w} × {reps}，接著 {b} 做 {n} × {r}',

  // ---- principle
  'Top set + back-offs: one heavy set at a safe effort shows strength; back-offs build volume at a fixed share of it.':
    '最重組 + 遞減組：一組在安全強度內的大重量展現力量；遞減組用它的固定比例累積訓練量。',
  'Your own plan: every set as written; doing more than written beats it.': '你自己的計畫：每組照寫的做；做得比寫的多就算超越。',
  'Double progression: build reps to the ceiling at a fixed load, then convert the earned reps into added weight.':
    '雙重漸進：固定重量把次數做到上限，再把多做的次數換成加重。',
  "Establish a baseline before progressing — you can't overload what you haven't measured.": '先建立基準再求進步——沒測過的，就無法超負荷。',
  'Maintenance: a fixed dose holds what you have; completing it is the whole job.': '維持：固定的量守住你現有的；完成就是全部任務。',
  'Safety beats progression: a lighter, fixed session first, then normal progression resumes.': '安全優先於進步：先做一次較輕的固定訓練，之後恢復正常漸進。',
  'Progressive overload: once the rep target is earned across enough sets, load must rise for further adaptation.':
    '漸進超負荷：足夠多組都達到目標次數後，重量要往上加，才能繼續適應。',
  'Repeated exposure: {n}+ sets at the top weight demonstrate repeatable capacity, not a one-off.':
    '重複驗證：最高重量做 {n}+ 組，證明是可重複的能力，不是偶然。',
  'Training-max buffering: open a strength cycle ~7% below estimated max so early sessions are completable.':
    '訓練最大值緩衝：力量週期從比估計最大值低約 7% 開始，讓前幾次訓練都做得完。',
  'Linear load progression: a completed 5 × 5 earns a fixed increment; incompletion earns a repeat, not a jump.':
    '線性加重：完成 5 × 5 就加固定重量；沒完成就重複，不加重。',

  // ---- result detail
  'not done': '未完成',
  logged: '已記錄',
  '{n}/{of} sets as planned': '{n}/{of} 組照計畫完成',
  'all {n} sets, some with more': '{n} 組全部完成，部分做得更多',
  'all {n} sets as planned': '{n} 組全部照計畫完成',
  '{n}/{of} sets of {reps} at {w}kg': '{w}kg × {reps} 完成 {n}/{of} 組',
  '{n} sets of {reps}+ at {w}kg or more': '{w}kg 以上做 {reps}+ 次，共 {n} 組',
  '{n} × {reps} at {w}kg done': '{w}kg {n} × {reps} 完成',
  '{n} × {reps} at {w}kg complete': '{w}kg {n} × {reps} 完成',
  'no top {word} at {w}kg': '沒有 {w}kg 的最重組{word}',
  'top set at {w}kg × {reps} short of {need}': '最重組 {w}kg × {reps}，未達 {need} 次',
  'top set at {w}kg went past the floor ({floor})': '最重組 {w}kg 超過強度底線（{floor}）',
  'top set done; back-offs {rest}': '最重組完成；遞減組 {rest}',
  'top {w}kg × {reps} (planned {plan}kg) and {n} back-offs done': '最重組 {w}kg × {reps}（計畫 {plan}kg），{n} 組遞減組完成',
  'top {w}kg × {reps} within the floor and {n} × {r} at {b}kg done': '最重組 {w}kg × {reps} 在底線內，遞減組 {b}kg {n} × {r} 完成',
  '0/{of} sets of {reps} — no set at {w}kg': '0/{of} 組 {reps} 次——沒有一組達到 {w}kg',
  '{n} sets of {reps}+ up to {max}kg (target {w}kg)': '{n} 組 {reps}+ 次，最重到 {max}kg（目標 {w}kg）',
  '{n} sets of {reps} at {w}kg (target {of})': '{w}kg × {reps} 做了 {n} 組（目標 {of} 組）',
  'stayed below {w}kg': '都低於 {w}kg',
  '{w}kg × {top} (target {reps})': '{w}kg × {top}（目標 {reps} 次）',
  'hit {w}kg × {reps}': '達成 {w}kg × {reps}',
  '{w}kg × {top}, needed {reps}': '{w}kg × {top}，需要 {reps} 次',
  'no working set at target weight': '沒有一組達到目標重量',
  '{n} sets of {reps}+ at {w}kg (target {of})': '{w}kg 做 {reps}+ 次，共 {n} 組（目標 {of} 組）',
  'repeated {w}kg × {reps} for {n} sets': '{w}kg × {reps} 重複了 {n} 組',
  '{now} reps vs {prev} last time': '{now} 次，上次 {prev} 次',
  'matched {prev} reps': '追平 {prev} 次',
  'swapped to {name}': '已換成「{name}」',
  'swapped to {name} — logged, not graded': '已換成「{name}」——已記錄，不評分',

  // ---- nudges (nudge.ts)
  'Pain flagged ({area}, severity {n}) — {name} stops for today. Next session holds the load and starts with a pain check.':
    '已標記疼痛（{area}，程度 {n}）——「{name}」今天先停。下次訓練維持重量，並先做疼痛檢查。',
  "Rep failure at {w}kg — drop the remaining sets to {to}kg. Don't repeat {w}kg until next session.":
    '{w}kg 做到力竭失敗——剩下的組降到 {to}kg。下次訓練前別再做 {w}kg。',
  'Top set at {effort} is past the floor ({floor}) — no more top sets; back-offs drop to {to}kg.':
    '最重組到了 {effort}，超過強度底線（{floor}）——不再做最重組；遞減組降到 {to}kg。',
  'Niggle logged — carry on as planned; next session holds the load.': '已記錄小不適——照計畫繼續；下次訓練維持重量。',
  'Top set felt light ({effort}). Optional: one more {word} at {w}kg, still stopping at {floor}.':
    '最重組感覺很輕（{effort}）。可選：{w}kg 再做一組{word}，一樣停在 {floor}。',
  'Plan met. Extra sets are a bonus, not required.': '計畫已達成。多做的組是額外加分，不是必須。',
  'Last set — take it to {effort}: aim for {reps} reps.': '最後一組——做到 {effort}：目標 {reps} 次。',
  'Too easy — next time +1 increment.': '太輕鬆了——下次 +1 次增量。',
  'Readiness red — effort floor raised to {floor}; no extra sets today.': '狀態紅燈——強度底線提高到 {floor}；今天不加組。',

  // ---- reminders (remind.ts, app/coach.ts)
  '{n} days since your last session. Today is anchored on the last logged session for each lift, not on goals or old maxes; every compound set stops at 3 RIR. Normal progression resumes next time.':
    '距離上次訓練 {n} 天。今天每個動作都以上次記錄的訓練為準，不看目標或舊的最大值；每個複合動作組都停在 3 RIR。下次恢復正常漸進。',
  '{n} days since your last session. Re-entry block: two sessions of 3 × 8 at roughly your last logged working weights, then normal progression.':
    '距離上次訓練 {n} 天。回歸期：兩次訓練，用大約上次記錄的正式組重量做 3 × 8，之後恢復正常漸進。',
  'rested {t}': '已休息 {t}',
  'Last session: {name}, {ago}, {kept}/{total} kept': '上次訓練：{name}，{ago}，達成 {kept}/{total}',
  'Last session: {name}, {ago}': '上次訓練：{name}，{ago}',
  '{name} (minimum)': '{name}（精簡版）',
  // Stored session name a new program day gets (shown through tn()).
  'Session {key}': '課表 {key}',
};

// te() tries the template with the most literal text first, so a piece that
// ends in a value ("— add {inc}kg", "reset to {min}") would swallow a suffix
// joined after it. The pieces that can be followed by a joined suffix get
// that suffix spelled out, so the longer template wins.
const suffix = (joiner: string) => {
  const ren = (s: string) => s.replace(/\{(\w+)\}/g, (_m, k: string) => (k === 'a' ? '{a}' : `{${k}2}`)).replace('{a}', '');
  return [ren(joiner), ren(zh[joiner])];
};
const withSuffix: [string, string[]][] = [
  ['topped {max}s across {n} sets at {w}kg — add {inc}kg, reset to {min}', ['{a} — held: {b}', '{a} — eased for a tired day (autoregulation)']],
  ['seed from recent best (e1RM {e1}kg × {pct}% training max) — start 5 × 5 at {w}kg', ['{a} — held: {b}', '{a} — eased for a tired day (autoregulation)']],
  ['first top-set session: best recent e1RM {e1}kg → a {word} with {rir} RIR left ≈ {w}kg', ['{a} — held: {b}', '{a} — held for a red readiness day']],
  ['top {word} at {w}kg left {rir} RIR (floor {floor}) — add {inc}kg', [
    '{a} — held: {b}', '{a} — held for a red readiness day',
    '{a}; back-offs topped {n}s at {w}kg — add {inc}kg', '{a}; back-offs were too easy ({n}+ RIR) at {w}kg — add {inc}kg',
  ]],
];
for (const [piece, joiners] of withSuffix) {
  for (const j of joiners) {
    const [en, cn] = suffix(j);
    zh[piece + en] = zh[piece] + cn;
  }
}

// readable() shows "at 0kg" as "at bodyweight" (and drops it from "Log your
// sets at 0kg — "), so each "at {w}kg" also gets an "at bodyweight" form.
const CJK = '[\\u3400-\\u9fff\\uff00-\\uffef，。：；（）「」、]';
const tight = (s: string) => s.replace(new RegExp(`(${CJK}) 自身體重`, 'g'), '$1自身體重').replace(new RegExp(`自身體重 (${CJK})`, 'g'), '自身體重$1');
for (const [en, cn] of Object.entries({ ...zh })) {
  const slots = [...en.matchAll(/at \{(\w+)\}kg/g)].map(m => m[1])
    .filter(k => en.split(`{${k}}`).length === 2 && cn.split(`{${k}}kg`).length === 2);
  for (let mask = 1; mask < 1 << slots.length; mask++) {
    let e = en, c = cn;
    slots.forEach((k, i) => {
      if (!(mask & (1 << i))) return;
      e = e.replace(`at {${k}}kg`, 'at bodyweight');
      c = c.replace(`{${k}}kg`, '自身體重');
    });
    if (!(e in zh) && !e.startsWith('Log your sets at bodyweight')) zh[e] = tight(c);
  }
}
export default zh;
