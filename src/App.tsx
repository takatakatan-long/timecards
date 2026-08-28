import { useState } from 'react';
import { HomeScreen } from './screens/HomeScreen';
import { SettingsScreen } from './screens/SettingsScreen';

type Screen = 'home' | 'settings';

/**
 * 画面の切り替え。
 * 画面数が少ないうちはルーティングのライブラリを入れず、状態で持ち替えるだけにしておく。
 */
function App() {
  const [screen, setScreen] = useState<Screen>('home');

  if (screen === 'settings') {
    return <SettingsScreen onBack={() => setScreen('home')} />;
  }
  return <HomeScreen onNavigate={setScreen} />;
}

export default App;
