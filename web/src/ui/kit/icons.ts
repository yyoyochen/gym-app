// 1-bit 9×9 pixel icons. '#' = ink, '.' = paper. Drawn on the pixel grid,
// rendered with crisp edges at an integer scale (PixelIcon). The first seven
// come from the approved mood board; the rest are drawn to match.
const BACK = [
  '.....##..',
  '....##...',
  '...##....',
  '..##.....',
  '.##......',
  '..##.....',
  '...##....',
  '....##...',
  '.....##..',
];
const mirror = (rows: string[]) => rows.map(r => [...r].reverse().join(''));
/** Rows ↔ columns: turns the '<' of BACK into '^'. */
const transpose = (rows: string[]) => [...rows[0]].map((_, x) => rows.map(r => r[x]).join(''));

export const ICONS = {
  today: ['....#....', '.#..#..#.', '..#...#..', '...###...', '####.####', '...###...', '..#...#..', '.#..#..#.', '....#....'],
  progress: ['.........', '......###', '......#..', '......#..', '...####..', '...#.....', '...#.....', '####.....', '.........'],
  // Rewind clock: ◀ at 12 o'clock, gap below it, so the ring reads as turning back.
  history: ['...#.....', '..#####..', '...#...#.', '....#...#', '#...#...#', '#...###.#', '#.......#', '.#.....#.', '..#####..'],
  profile: ['...###...', '..#...#..', '..#...#..', '...###...', '.........', '.#######.', '#.......#', '#.......#', '#.......#'],
  check: ['.........', '........#', '.......##', '......##.', '#....##..', '##..##...', '.####....', '..##.....', '.........'],
  bar: ['.........', '.#.....#.', '##.....##', '##.....##', '#########', '##.....##', '##.....##', '.#.....#.', '.........'],
  plus: ['.........', '....#....', '....#....', '....#....', '#########', '....#....', '....#....', '....#....', '.........'],
  minus: ['.........', '.........', '.........', '.........', '#########', '.........', '.........', '.........', '.........'],
  back: BACK,
  chevron: mirror(BACK),
  up: transpose(BACK),
  down: [...transpose(BACK)].reverse(),
  close: ['##.....##', '.##...##.', '..##.##..', '...###...', '....#....', '...###...', '..##.##..', '.##...##.', '##.....##'],
  pain: ['.....##..', '....##...', '...##....', '..######.', '....##...', '...##....', '..##.....', '.##......', '.........'],
  flame: ['....#....', '...##....', '...###...', '..####.#.', '.#######.', '.###.###.', '.##...##.', '.##...##.', '..#####..'],
  edit: ['.......##', '......###', '.....###.', '....###..', '...###...', '..###....', '.###.....', '##.......', '#........'],
  trash: ['...###...', '#########', '.#.....#.', '.#.#.#.#.', '.#.#.#.#.', '.#.#.#.#.', '.#.#.#.#.', '.#.....#.', '.#######.'],
  export: ['....#....', '...###...', '..#.#.#..', '....#....', '....#....', '#...#...#', '#.......#', '#.......#', '#########'],
  import: ['....#....', '....#....', '....#....', '..#.#.#..', '...###...', '#...#...#', '#.......#', '#.......#', '#########'],
  // The gear is drawn on a 13 × 13 grid: the user's reference cog in outline, a ring around a plus-shaped hole.
  settings: [
    '.....###.....', '..##.#.#.##..', '.#..##.##..#.', '.#.........#.', '..#..###..#..', '###.##.##.###', '#...#...#...#',
    '###.##.##.###', '..#..###..#..', '.#.........#.', '.#..##.##..#.', '..##.#.#.##..', '.....###.....',
  ],
  // Grip: three bars (≡), the handle you drag to reorder a list.
  grip: ['.........', '#########', '.........', '.........', '#########', '.........', '.........', '#########', '.........'],
  // Info: a lowercase i in a ring, on the same 9 × 9 grid as the rest.
  info: ['..#####..', '.#.....#.', '#...#...#', '#.......#', '#..##...#', '#...#...#', '#..###..#', '.#.....#.', '..#####..'],
  // Calendar page: two binding rings, a solid header, day dots.
  calendar: ['.#.....#.', '#########', '#########', '#.......#', '#.#.#.#.#', '#.......#', '#.#.#.#.#', '#.......#', '#########'],
} satisfies Record<string, string[]>;

export type IconName = keyof typeof ICONS;
/** Alias: the PR mark is the flame. */
export const PR_ICON: IconName = 'flame';

/** Horizontal runs of ink, one rect each (fewer SVG nodes than per-pixel). */
/** Drawn size in px: the icon's own grid (9, or 13 for the gear) times an integer scale. */
export function iconSize(name: IconName, scale = 2): number {
  return ICONS[name].length * Math.max(1, Math.round(scale));
}

export function iconRuns(rows: readonly string[]): { x: number; y: number; w: number }[] {
  const out: { x: number; y: number; w: number }[] = [];
  rows.forEach((row, y) => {
    let x = 0;
    while (x < row.length) {
      if (row[x] !== '#') { x++; continue; }
      const s = x;
      while (x < row.length && row[x] === '#') x++;
      out.push({ x: s, y, w: x - s });
    }
  });
  return out;
}
