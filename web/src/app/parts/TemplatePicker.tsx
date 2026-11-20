// Template cards with each session's slots, for Onboarding and the Program editor.
import type { Exercise } from '../../domain/types';
import { TEMPLATES, programFromTemplate } from '../../domain/templates';
import { describeSlot } from '../program';

export function TemplateSummary({ templateId, exercises }: { templateId: string; exercises: Exercise[] }) {
  const p = programFromTemplate(templateId);
  const names = new Map(exercises.map(e => [e.id, e.name]));
  return (
    <div className="stack tight">
      {p.sessions.map(s => (
        <div key={s.key} className="tpl-session">
          <span className="heading">{s.name}</span>
          <ul className="plain">
            {s.slots.map(sl => (
              <li key={sl.id} className="spread">
                <span className="mid">{names.get(sl.exerciseId) ?? sl.exerciseId}</span>
                <span className="mono num-sm">{describeSlot(sl)}</span>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

export function TemplateList({ exercises, renderAction }: {
  exercises: Exercise[]; renderAction: (templateId: string) => JSX.Element;
}) {
  return (
    <div className="stack">
      {TEMPLATES.map(t => (
        <div key={t.id} className="card stack">
          <span className="spread"><span className="heading">{t.name}</span><span className="mono num-sm">{t.days}</span></span>
          <span className="mid">{t.shape}</span>
          <span className="mid">Fits: {t.fitsGoal}</span>
          <details className="tpl">
            <summary className="label">Sessions and slots</summary>
            <TemplateSummary templateId={t.id} exercises={exercises} />
          </details>
          {renderAction(t.id)}
        </div>
      ))}
    </div>
  );
}
