// One screen's tip slot: renders the tip for `id` only when it is the one
// picked for the screen (app/tips.ts pickTip). Got it stores it as seen.
import { getDb } from '../../db';
import { Tip, tipFooter } from '../../ui/kit';
import { useLive } from '../../ui/useLive';
import { GOAL_NUDGE_TEXT, TIP_IDS, TIP_TEXT, getTipsSeen, markTipSeen, pickTip, tipNumber, type CardId } from '../tips';

/** The tips already seen, live (null until startup has decided). */
export function useTipsSeen(): string[] | null {
  return useLive(db => getTipsSeen(db), []) ?? null;
}

/** The card this screen shows, given which of its candidates qualify now. */
export function useScreenTip(qualifying: Partial<Record<CardId, boolean>>): CardId | null {
  return pickTip(qualifying, useTipsSeen());
}

export function ScreenTip({ id, shown }: { id: CardId; shown: CardId | null }) {
  if (shown !== id) return null;
  const dismiss = () => { void markTipSeen(getDb(), id); };
  if (id === 'goalNudge') {
    return (
      <Tip text={GOAL_NUDGE_TEXT} onDismiss={dismiss}>
        <a className="link tip-link" href="#/profile/targets" onClick={dismiss}>Set a goal</a>
      </Tip>
    );
  }
  return <Tip text={TIP_TEXT[id]} footer={tipFooter(tipNumber(id), TIP_IDS.length)} onDismiss={dismiss} />;
}
