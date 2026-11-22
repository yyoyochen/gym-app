// The 16 type roles (docs/DESIGN.md §3). tokens.css defines --text-<role> and
// --track-<role> for each; type.css turns each into a .t-<role> class. The kit
// gallery renders this list, and a test keeps tokens, docs and gallery in step.
export interface TypeRole {
  role: string;
  family: 'sans' | 'mono';
  caps: boolean;
  sample: string;
  job: string;
}

export const TYPE_ROLES: readonly TypeRole[] = [
  { role: 'hero', family: 'sans', caps: false, sample: '102.5', job: "the screen's number" },
  { role: 'display', family: 'sans', caps: false, sample: '7 × 3', job: 'logger "next set"' },
  { role: 'num-xl', family: 'sans', caps: false, sample: '140 kg', job: 'BigNumber lg, onboarding question' },
  { role: 'title-lg', family: 'sans', caps: false, sample: 'History', job: 'large title, next-rest number' },
  { role: 'num-lg', family: 'sans', caps: false, sample: '+2.5 kg', job: 'unit beside a hero, PR sub, big input' },
  { role: 'num-md', family: 'sans', caps: false, sample: 'Sat 21', job: 'stepper input, date stamp, kept unit' },
  { role: 'title', family: 'sans', caps: false, sample: 'Session A, squat + bench', job: 'session and screen titles' },
  { role: 'value', family: 'sans', caps: false, sample: '12 / 15 sets', job: 'row values, headings, action-sheet buttons' },
  { role: 'body', family: 'sans', caps: false, sample: 'Squat felt quick off the floor today.', job: 'sentences; the 15px floor' },
  { role: 'body-strong', family: 'sans', caps: false, sample: 'Hold 120 kg for 3 sessions', job: 'promise, criteria, captions' },
  { role: 'quiet', family: 'sans', caps: false, sample: 'last week', job: 'the grey label over a value' },
  { role: 'label', family: 'mono', caps: true, sample: '[Session A]  Sun 22 Nov', job: 'spec labels, legends, day initials' },
  { role: 'stamp', family: 'mono', caps: true, sample: 'Beat  Hit  Ready', job: 'verdicts, level chips, ready mark' },
  { role: 'mono', family: 'mono', caps: false, sample: '//NOTE 4×8 @ RPE 8', job: 'stats, notes, set sheets' },
  { role: 'button', family: 'mono', caps: true, sample: 'Log set', job: 'buttons' },
  { role: 'micro', family: 'mono', caps: true, sample: 'Mon  Wk 47  Today', job: 'chart ticks, tab captions, small units' },
];
