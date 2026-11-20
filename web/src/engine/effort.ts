// Effort scale, effort floors (spec §3.3.1) and the load-jump cap.
// Effort is stored as RIR everywhere; RPE is only a way of showing it.
import type { EffortScale, Exercise, ModelKind, Readiness, SlotType } from '../domain/types';
import { pyG } from './pyformat';

export function rirToRpe(rir: number): number {
  return 10 - rir;
}

export function rpeToRir(rpe: number): number {
  return 10 - rpe;
}

/** RPE is entered in half steps between 6 and 10. */
export function snapRpe(rpe: number): number {
  return Math.min(10, Math.max(6, Math.round(rpe * 2) / 2));
}

export function formatEffort(rir: number, scale: EffortScale): string {
  return scale === 'rpe' ? `RPE ${pyG(rirToRpe(rir))}` : `${pyG(rir)} RIR`;
}

/** "1–2 RIR" or "RPE 8–9" — low RIR is high RPE, so the order flips. */
export function formatEffortRange(lowRir: number, highRir: number, scale: EffortScale): string {
  if (lowRir === highRir) return formatEffort(lowRir, scale);
  return scale === 'rpe'
    ? `RPE ${pyG(rirToRpe(highRir))}–${pyG(rirToRpe(lowRir))}`
    : `${pyG(lowRir)}–${pyG(highRir)} RIR`;
}

/** A floor is a minimum RIR, i.e. a maximum RPE. */
export function formatFloor(rir: number, scale: EffortScale): string {
  return scale === 'rpe' ? `≤ RPE ${pyG(rirToRpe(rir))}` : `≥ ${pyG(rir)} RIR`;
}

// ---------------------------------------------------------------- floors

/** What kind of set a floor is for. */
export type EffortRole = 'top' | 'working' | 'isolation';

export interface RoleDefaults { floor: number; lastSet: number }

/** §3.3.1 defaults. The program editor pre-fills slot.params.rirFloor from these. */
export const DEFAULT_FLOORS: Record<EffortRole, RoleDefaults> = {
  // Strength doesn't need sets near failure and RIR estimates are off by ~1
  // rep, so heavy top sets keep 2 in the tank, last set included.
  top: { floor: 2, lastSet: 2 },
  // Size benefits from going closer to failure, so the last set may go to 1.
  working: { floor: 2, lastSet: 1 },
  // A failed rep on a machine or cable is harmless.
  isolation: { floor: 1, lastSet: 0 },
};

export const REENTRY_FLOOR = 3;

export function effortRole(model: ModelKind, slotType: SlotType, isTopSet = false): EffortRole {
  if (slotType === 'isolation') return 'isolation';
  return model === 'topset' && isTopSet ? 'top' : 'working';
}

export interface FloorInput {
  role: EffortRole;
  /** The slot's own floor (pre-filled from the defaults, editable). */
  baseFloor?: number;
  readiness?: Readiness;
  /** Days since the previous session of any kind; null when there is none. */
  gapDays?: number | null;
  /** Reasons a pain flag or a profile injury touches an area this lift loads (see pain.ts). */
  painReasons?: string[];
  /** First session back after 8–20 days (§3.5): every compound set at 3 RIR. */
  reentry?: boolean;
}

export interface FloorResult {
  floor: number;
  /** How far the last set of the slot may go. */
  lastSetFloor: number;
  /** True when one of the +1 RIR raisers applied. */
  raised: boolean;
  reasons: string[];
}

export const LAYOFF_DAYS = 8;

/**
 * The effort floor for a set. The raisers (red readiness, first session after
 * an 8+ day gap, recent pain on a loaded area) add +1 RIR once in total: they
 * all say "less margin today", and stacking them would push top sets to 4–5
 * RIR where they stop being heavy at all.
 */
export function effortFloor(inp: FloorInput): FloorResult {
  const d = DEFAULT_FLOORS[inp.role];
  const base = inp.baseFloor ?? d.floor;
  const lastBase = inp.role === 'top' ? base : Math.max(0, base - (d.floor - d.lastSet));
  if (inp.reentry && inp.role !== 'isolation') {
    const f = Math.max(base, REENTRY_FLOOR);
    return { floor: f, lastSetFloor: f, raised: false, reasons: ['re-entry session: every compound set at 3 RIR'] };
  }
  const reasons: string[] = [];
  if (inp.readiness === 'red') reasons.push('readiness red');
  // Isolation work is not raised for a gap: the table only lists readiness and pain for it.
  if (inp.role !== 'isolation' && inp.gapDays != null && inp.gapDays >= LAYOFF_DAYS) {
    reasons.push(`first session after a ${inp.gapDays}-day gap`);
  }
  reasons.push(...(inp.painReasons ?? []));
  const raise = reasons.length ? 1 : 0;
  return { floor: base + raise, lastSetFloor: lastBase + raise, raised: raise > 0, reasons };
}

// ---------------------------------------------------------------- load jump cap

export interface JumpContext {
  /** Load worked last session (the anchor). */
  lastWeight: number;
  increment: number;
  /** First session after an 8+ day gap: no jump at all. */
  firstSessionBack?: boolean;
  /** Later sessions in a re-entry period: jumps also capped at 5%. */
  afterLayoff?: boolean;
}

/**
 * Largest allowed increase over last session. Normally one increment. After a
 * layoff the spec allows "one increment, or 5%"; the smaller of the two is
 * used (safety wins), floored to whole increments so it can be loaded.
 */
export function maxLoadJump(ctx: JumpContext): number {
  if (ctx.firstSessionBack) return 0;
  if (!ctx.afterLayoff) return ctx.increment;
  const pct = ctx.lastWeight * 0.05;
  return Math.floor(Math.min(ctx.increment, pct) / ctx.increment + 1e-9) * ctx.increment;
}

export interface CapResult {
  weight: number;
  capped: boolean;
  /** Why the number was refused, in plain words; empty when not capped. */
  reason: string;
}

export function capLoad(proposed: number, ctx: JumpContext): CapResult {
  const jump = maxLoadJump(ctx);
  const limit = Math.round((ctx.lastWeight + jump) * 100) / 100;
  if (proposed <= limit + 1e-9) return { weight: proposed, capped: false, reason: '' };
  const why = ctx.firstSessionBack
    ? 'first session after a layoff: no jump'
    : ctx.afterLayoff
      ? `after a layoff jumps are capped at ${pyG(jump)}kg (5% or one increment)`
      : `jumps are capped at one increment (${pyG(ctx.increment)}kg)`;
  return { weight: limit, capped: true, reason: `${pyG(proposed)}kg refused — ${why}; capped at ${pyG(limit)}kg` };
}

/** The exercise's increment, or the slot's override. */
export function incrementFor(exercise: Exercise, override?: number): number {
  return override ?? exercise.increment;
}
