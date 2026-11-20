// GymBro coaching engine: pure functions only — no storage, no clock, no DOM.
// The app passes in history, profile and today's date (spec §5.1).
export * from './models';
export * from './effort';
export * from './nudge';
export * from './pain';
export * from './remind';
export * from './progress';
export * from './readiness';
export { addDays, daysBetween, isoWeek, isoWeekKey } from './dates';
