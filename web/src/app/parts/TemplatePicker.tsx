// Templates as spec-sheet blocks (sessions and slots in Space Mono), for
// Onboarding (pick one, the pinned button applies it) and the Program editor.
import type { ReactNode } from 'react';
import type { Exercise, ProgramSession } from '../../domain/types';
import { TEMPLATES, programFromTemplate } from '../../domain/templates';
import { PixelIcon } from '../../ui/kit';
import { describeSlot } from '../program';

/** "A · Squat + Bench" → "Squat + Bench" (the key has its own cell). */
export function sessionTitle(s: Pick<ProgramSession, 'key' | 'name'>): string {
  const esc = s.key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return s.name.replace(new RegExp(`^${esc}\\s*[·:\\-–]\\s*`), '').trim() || s.name;
}

/** '3 (min 2: A + B)' → '3/WK · MIN 2'; '4–5' → '4–5/WK'. */
function daysLabel(days: string): string {
  const min = /min (\d+)/.exec(days);
  return `${days.split(' ')[0]}/wk${min ? ` · min ${min[1]}` : ''}`;
}

export function TemplateSummary({ templateId, exercises }: { templateId: string; exercises: Exercise[] }) {
  const p = programFromTemplate(templateId);
  const names = new Map(exercises.map(e => [e.id, e.name]));
  return (
    <div className="tpl-sessions">
      {p.sessions.map(s => (
        <div key={s.key} className="tpl-session">
          <div className="tpl-session-hd"><span className="key-inv">{s.key}</span><span>{sessionTitle(s)}</span></div>
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
    <div className="tpl-list" role={onSelect ? 'radiogroup' : undefined} aria-label={onSelect ? 'Templates' : undefined}>
      {TEMPLATES.map(t => {
        const on = selected === t.id;
        const head = (
          <>
            <span className="tpl-hd">
              <span className="tpl-name">{t.name}</span>
              <span className="tpl-days">{daysLabel(t.days)}</span>
              {onSelect && <span className="tpl-mark" aria-hidden="true">{on ? <PixelIcon name="check" /> : null}</span>}
            </span>
            <span className="tpl-shape">{t.shape}</span>
            <span className="tpl-fits">Fits //{t.fitsGoal}</span>
          </>
        );
        return (
          <div key={t.id} className={`tpl${on ? ' on' : ''}`}>
            {onSelect
              ? <button type="button" role="radio" aria-checked={on} className="tpl-pick" data-press="dim" onClick={() => onSelect(t.id)}>{head}</button>
              : <div className="tpl-pick">{head}</div>}
            <TemplateSummary templateId={t.id} exercises={exercises} />
            {renderAction?.(t.id)}
          </div>
        );
      })}
    </div>
  );
}
