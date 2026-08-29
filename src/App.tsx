import { useState } from 'react';
import { HomeScreen } from './screens/HomeScreen';
import { PlanScreen } from './screens/PlanScreen';
import { PrintScreen } from './screens/PrintScreen';
import { RecordListScreen } from './screens/RecordListScreen';
import { SettingsScreen } from './screens/SettingsScreen';

/**
 * 表示中の画面。明細だけは対象（期・スタッフ）を伴うので、名前と一緒に持つ。
 */
export type Screen =
  | { name: 'home' }
  | { name: 'records' }
  | { name: 'plans' }
  | { name: 'settings' }
  | { name: 'print'; termId: string; staffId: string };

/**
 * 画面の切り替え。
 * 画面数が少ないうちはルーティングのライブラリを入れず、状態で持ち替えるだけにしておく。
 */
function App() {
  const [screen, setScreen] = useState<Screen>({ name: 'home' });
  const goHome = () => setScreen({ name: 'home' });

  switch (screen.name) {
    case 'settings':
      return <SettingsScreen onBack={goHome} />;
    case 'plans':
      return <PlanScreen onBack={goHome} />;
    case 'records':
      return (
        <RecordListScreen
          onBack={goHome}
          onPrint={(termId, staffId) => setScreen({ name: 'print', termId, staffId })}
        />
      );
    case 'print':
      return (
        <PrintScreen
          termId={screen.termId}
          staffId={screen.staffId}
          onBack={() => setScreen({ name: 'records' })}
        />
      );
    default:
      return <HomeScreen onNavigate={(next) => setScreen(next)} />;
  }
}

export default App;
