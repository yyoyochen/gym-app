import { useRoute } from './ui/router';
import { TabBar } from './ui/TabBar';

export function App() {
  const [tab] = useRoute();
  return (
    <div className="app">
      <main className="screen">
        <h1 className="title">{tab[0].toUpperCase() + tab.slice(1)}</h1>
        <p className="mid">Scaffold — screens land in M3.</p>
      </main>
      <TabBar active={tab} />
    </div>
  );
}
