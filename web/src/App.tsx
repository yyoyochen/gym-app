import { useRoute } from './ui/router';
import { TabBar } from './ui/TabBar';
import { Today } from './screens/Today';
import { Session } from './screens/Session';
import { Review } from './screens/Review';
import { Progress } from './screens/Progress';
import { LiftDetail } from './screens/LiftDetail';
import { History } from './screens/History';
import { SessionDetail } from './screens/SessionDetail';
import { Profile } from './screens/Profile';
import { ProgramEditor } from './screens/ProgramEditor';
import { Settings } from './screens/Settings';
import { Onboarding } from './screens/Onboarding';

// Route table. Each screen owns its file; App only maps paths to screens.
//   #/today                     Today (coach + remind)
//   #/session/<id>              active session logger (full screen, no tab bar)
//   #/review/<id>               verdict ledger after finishing
//   #/progress                  heatmap, goal board, benchmarks, lifts
//   #/lift/<exerciseId>         per-lift page
//   #/history                   calendar + session list
//   #/history/<sessionId>       session detail (ledger, edit)
//   #/profile                   where I am, goals, targets
//   #/profile/program           program editor
//   #/profile/settings          settings + data
//   #/onboarding                first run
const ROUTES: Record<string, { tab: string | null; render: (p: string[]) => JSX.Element }> = {
  today: { tab: 'today', render: p => <Today params={p} /> },
  session: { tab: null, render: p => <Session params={p} /> },
  review: { tab: null, render: p => <Review params={p} /> },
  progress: { tab: 'progress', render: p => <Progress params={p} /> },
  lift: { tab: 'progress', render: p => <LiftDetail params={p} /> },
  history: { tab: 'history', render: p => (p[0] ? <SessionDetail params={p} /> : <History params={p} />) },
  profile: {
    tab: 'profile',
    render: p => (p[0] === 'program' ? <ProgramEditor params={p.slice(1)} /> : p[0] === 'settings' ? <Settings params={p.slice(1)} /> : <Profile params={p} />),
  },
  onboarding: { tab: null, render: p => <Onboarding params={p} /> },
};

export function App() {
  const [head, ...rest] = useRoute();
  const route = ROUTES[head] ?? ROUTES.today;
  return (
    <div className="app">
      {route.render(rest)}
      {route.tab && <TabBar active={route.tab} />}
    </div>
  );
}
