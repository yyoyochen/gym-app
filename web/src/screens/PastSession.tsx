// Log a past session (#/session/past): pick the day, then the logger opens on
// an ungraded session pinned to it (programSessionKey 'adhoc', no commit).
// The logger offers "Add a lift" only, so what you log is recorded, not graded.
import { useState } from 'react';
import type { ISODate } from '../domain/types';
import { getDb, startSession } from '../db';
import { DateField } from '../ui/common';
import { Button, NavBar, go } from '../ui/kit';
import { addDays, formatDate, todayISO } from '../app/dates';

export const PAST_SESSION_NAME = 'Past session';

export function PastSession(_props: { params: string[] }) {
  const today = todayISO();
  const [date, setDate] = useState<ISODate | ''>(addDays(today, -1));
  const [busy, setBusy] = useState(false);
  const valid = date !== '' && date <= today;
  const start = async () => {
    if (!valid || busy) return;
    setBusy(true);
    try {
      const s = await startSession(getDb(), { programSessionKey: 'adhoc', nameSnapshot: PAST_SESSION_NAME, date: date as ISODate });
      go(`session/${s.id}`, { replace: true });
    } finally { setBusy(false); }
  };
  return (
    <section className="screen setup">
      <NavBar title="Log past session" backLabel="Calendar" fallback="history" />
      <DateField label="Day trained" value={date} max={today} confirmLabel="Use this day" onChange={setDate} />
      <p className="note">//Note: Past sessions are logged ungraded: add each lift and its sets. No plan is set for them.</p>
      <Button variant="primary" block iconEnd="chevron" disabled={!valid || busy} onClick={start}>
        {valid ? `Start logging: ${formatDate(date as ISODate)}` : 'Pick a day'}
      </Button>
    </section>
  );
}
