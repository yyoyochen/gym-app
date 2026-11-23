// Templates as spec-sheet blocks (sessions and slots in the mono font), for
// Onboarding (pick one, the pinned button applies it) and the Program editor.
import type { ReactNode } from 'react';
import type { Exercise, ProgramSession } from '../../domain/types';
import { TEMPLATES, programFromTemplate } from '../../domain/templates';
import { PixelIcon } from '../../ui/kit';
import { describeSlot } from '../program';
import { t, tn } from '../../i18n';
import { displayName } from '../labels';

/** "A: Squat + Bench" (or an older stored dot form) → "Squat + Bench" (the key has its own cell). Translated when a built-in name. */
export function sessionTitle(s: Pick<ProgramSession, 'key' | 'name'>): string {
  const name = tn(displayName(s.name));
  const esc = s.key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return name.replace(new RegExp(`^${esc}\\s*[·:：\\-–]\\s*`), '').trim() || name;
}

/** '3 (min 2: A + B)' → '3/WK · MIN 2'; '4–5' → '4–5/WK'. */
function daysLabel(days: string): string {
  const min = /min (\d+)/.exec(days);
  const n = days.split(' ')[0];
  return min ? t('{n}/wk, min {min}', { n, min: min[1] }) : t('{n}/wk', { n });
}

export function TemplateSummary({ templateId, exercises }: { templateId: string; exercises: Exercise[] }) {
  const p = programFromTemplate(templateId);
  const names = new Map(exercises.map(e => [e.id, tn(e.name)]));
  return (
    <div className="tpl-sessions">
      {p.sessions.map(s => (
        <div key={s.key} className="tpl-session">
          <div className="tpl-session-hd"><span className="key-inv">{tn(s.key)}</span><span>{sessionTitle(s)}</span></div>
          <dl className="tpl-slots">
            {s.slots.map(sl => (
              <div key={sl.id} className="tpl-slot">
                <dt>{names.get(sl.exerciseId) ?? sl.exerciseId}</dt>
                <dd>{describeSlot(sl)}</dd>
              </div>
            ))}
          </dl>
        </div>
      ))}
    </div>
  );
}

/**
 * Every template as a spec sheet. With `onSelect` the blocks are a radio
 * group (Onboarding); `renderAction` adds a button under each (Program editor).
 */
export function TemplateList({ exercises, selected, onSelect, renderAction }: {
  exercises: Exercise[]; selected?: string; onSelect?: (templateId: string) => void; renderAction?: (templateId: string) => ReactNode;
}) {
  return (
    <div className="tpl-list" role={onSelect ? 'radiogroup' : undefined} aria-label={onSelect ? t('Templates') : undefined}>
      {TEMPLATES.map(tpl => {
        const on = selected === tpl.id;
        const head = (
          <>
            <span className="tpl-hd">
              <span className="tpl-name">{tn(tpl.name)}</span>
              <span className="tpl-days">{daysLabel(tpl.days)}</span>
              {onSelect && <span className="tpl-mark" aria-hidden="true">{on ? <PixelIcon name="check" /> : null}</span>}
            </span>
            <span className="tpl-shape">{tpl.shape}</span>
            <span className="tpl-fits">{t('Fits // {goal}', { goal: tpl.fitsGoal })}</span>
          </>
        );
        return (
          <div key={tpl.id} className={`tpl${on ? ' on' : ''}`}>
            {onSelect
              ? <button type="button" role="radio" aria-checked={on} className="tpl-pick" data-press="dim" onClick={() => onSelect(tpl.id)}>{head}</button>
              : <div className="tpl-pick">{head}</div>}
            <TemplateSummary templateId={tpl.id} exercises={exercises} />
            {renderAction?.(tpl.id)}
          </div>
        );
      })}
    </div>
  );
}
