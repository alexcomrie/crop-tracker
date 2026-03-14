import React, { useEffect } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from '@/components/ui/sonner';
import { TopBar } from './components/layout/TopBar';
import { BottomNav } from './components/layout/BottomNav';
import { DashboardScreen } from './screens/DashboardScreen';
import { CropsScreen } from './screens/CropsScreen';
import { PropagationsScreen } from './screens/PropagationsScreen';
import { CalendarScreen } from './screens/CalendarScreen';
import { MoreScreen } from './screens/MoreScreen';
import { HerbicideScheduleScreen } from './screens/HerbicideScheduleScreen';
import { RemindersScreen } from './screens/RemindersScreen';
import { SettingsScreen } from './screens/SettingsScreen';
import { useAppStore } from './store/useAppStore';
import { useTelegramReminders } from './hooks/useTelegramReminders';
import type { CropDatabase, FertDatabase } from './types';

const queryClient = new QueryClient();

function AppContent() {
  const { activeTab, setCropDb, setFertDb } = useAppStore();
  
  // Initialize Telegram notification service
  useTelegramReminders();

  // Load JSON databases on startup
  useEffect(() => {
    fetch('/data/crop_database.json')
      .then(r => r.json())
      .then((data: CropDatabase) => setCropDb(data))
      .catch(console.error);

    fetch('/data/fertilizer_schedule.json')
      .then(r => r.json())
      .then((data: FertDatabase) => setFertDb(data))
      .catch(console.error);
  }, [setCropDb, setFertDb]);

  return (
    <div className="min-h-screen bg-gray-50 max-w-md mx-auto relative">
      <TopBar />
      <main className="pt-14">
        {activeTab === 'dashboard' && <DashboardScreen />}
        {activeTab === 'crops' && <CropsScreen />}
        {activeTab === 'propagations' && <PropagationsScreen />}
        {activeTab === 'more' && <MoreScreen />}
        {activeTab === 'calendar' && <CalendarScreen />}
        {activeTab === 'herb-schedule' && <HerbicideScheduleScreen />}
        {activeTab === 'reminders' && <RemindersScreen />}
        {activeTab === 'settings' && <SettingsScreen />}
      </main>
      <BottomNav />
      <Toaster position="bottom-center" />
    </div>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AppContent />
    </QueryClientProvider>
  );
}

export default App;
