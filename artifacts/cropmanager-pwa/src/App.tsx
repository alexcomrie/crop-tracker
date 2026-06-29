import React, { useEffect } from 'react';
import { Routes, Route, useLocation, useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { Toaster } from '@/components/ui/sonner';
import { TopBar } from './components/layout/TopBar';
import { BottomNav } from './components/layout/BottomNav';
import { NavigationDrawer } from './components/layout/NavigationDrawer';
import { DashboardScreen } from './screens/DashboardScreen';
import { CropsScreen } from './screens/CropsScreen';
import { PropagationsScreen } from './screens/PropagationsScreen';
import { CalendarScreen } from './screens/CalendarScreen';
import { MoreScreen } from './screens/MoreScreen';
import { HerbicideScheduleScreen } from './screens/HerbicideScheduleScreen';
import { RemindersScreen } from './screens/RemindersScreen';
import { SettingsScreen } from './screens/SettingsScreen';
import { CropDatabaseScreen } from './components/CropDatabaseScreen';
import { FertilizerDatabaseScreen } from './components/FertilizerDatabaseScreen';
import { CropHistoryScreen } from './components/reports/CropHistory';
import { CHCalculatorScreen } from './components/ch/CHCalculatorScreen';
import { ActivityScreen } from './components/activity/ActivityScreen';
import { FarmLedgerScreen } from './components/ledger/FarmLedgerScreen';
import { TreatmentAppRatesScreen } from './components/treatment/TreatmentAppRatesScreen';
import { AreaMapperScreen } from './components/area/AreaMapperScreen';
import DiaryScreen from './components/diary/DiaryScreen';
import FarmCalculatorScreen from './components/calculator/FarmCalculatorScreen';
import POSScreen from './components/pos/POSScreen';
import { useAppStore } from './store/useAppStore';
import { useTelegramReminders } from './hooks/useTelegramReminders';
import type { CropDatabase, FertDatabase } from './types';
import { loadCropDatabase } from './lib/cropDb';
import { loadFertDatabase } from './lib/fertDb';
import db from './db/db';
import { ROUTES } from './lib/routes';

const pageVariants = {
  initial: { opacity: 0, x: 20 },
  in: { opacity: 1, x: 0 },
  out: { opacity: 0, x: -20 },
};

const pageTransition = {
  type: 'tween' as const,
  ease: 'easeInOut' as const,
  duration: 0.2,
};

function AnimatedPage({ children }: { children: React.ReactNode }) {
  return (
    <motion.div
      initial="initial"
      animate="in"
      exit="out"
      variants={pageVariants}
      transition={pageTransition}
    >
      {children}
    </motion.div>
  );
}

function PanelPage({ children }: { children: React.ReactNode }) {
  return (
    <motion.div
      initial={{ opacity: 0, x: 40 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 40 }}
      transition={{ type: 'tween', ease: 'easeInOut', duration: 0.2 }}
    >
      {children}
    </motion.div>
  );
}

function withOnClose(Component: React.ComponentType<{ onClose: () => void }>) {
  return function Wrapped() {
    const navigate = useNavigate();
    return <Component onClose={() => navigate(ROUTES.MORE)} />;
  };
}

const CropDatabaseRoute = withOnClose(CropDatabaseScreen);
const FertilizerDatabaseRoute = withOnClose(FertilizerDatabaseScreen);
const CropHistoryRoute = withOnClose(CropHistoryScreen);
const CHCalculatorRoute = withOnClose(CHCalculatorScreen);
const ActivityRoute = withOnClose(ActivityScreen);
const FarmLedgerRoute = withOnClose(FarmLedgerScreen);
const TreatmentAppRatesRoute = withOnClose(TreatmentAppRatesScreen);
const AreaMapperRoute = withOnClose(AreaMapperScreen);

function AppContent() {
  const location = useLocation();
  const { setCropDb, setFertDb } = useAppStore();

  useTelegramReminders();

  useEffect(() => {
    loadCropDatabase()
      .then((data: CropDatabase) => setCropDb(data))
      .catch(console.error);
    loadFertDatabase()
      .then((data: FertDatabase) => setFertDb(data))
      .catch(console.error);
  }, [setCropDb, setFertDb]);

  useEffect(() => {
    async function migrateCrops() {
      const crops = await db.crops.where('isContinuous').equals(1).toArray();
      for (const crop of crops) {
        if (!crop.harvestFrequency || !crop.batchOffset) {
          const numWeeks = 1;
          const batchOffset = 7;
          await db.crops.update(crop.id, {
            harvestFrequency: crop.harvestFrequency || 7,
            batchOffset: crop.batchOffset || batchOffset,
            updatedAt: Date.now(),
          });
        }
      }
    }
    migrateCrops().catch(console.error);
  }, []);

  useEffect(() => {
    if (navigator.storage && 'persist' in navigator.storage) {
      navigator.storage.persist?.().catch(() => {});
    }
  }, []);

  return (
    <div className="min-h-screen bg-gray-50 max-w-md mx-auto relative">
      <TopBar />
      <NavigationDrawer />
      <main className="pt-14 pb-16">
        <AnimatePresence mode="wait">
          <Routes location={location} key={location.pathname}>
            <Route path={ROUTES.DASHBOARD} element={<AnimatedPage><DashboardScreen /></AnimatedPage>} />
            <Route path={ROUTES.CROPS} element={<AnimatedPage><CropsScreen /></AnimatedPage>} />
            <Route path={ROUTES.PROPAGATIONS} element={<AnimatedPage><PropagationsScreen /></AnimatedPage>} />
            <Route path={ROUTES.CALENDAR} element={<AnimatedPage><CalendarScreen /></AnimatedPage>} />
            <Route path={ROUTES.MORE} element={<AnimatedPage><MoreScreen /></AnimatedPage>} />
            <Route path={ROUTES.HERB_SCHEDULE} element={<AnimatedPage><HerbicideScheduleScreen /></AnimatedPage>} />
            <Route path={ROUTES.REMINDERS} element={<AnimatedPage><RemindersScreen /></AnimatedPage>} />
            <Route path={ROUTES.SETTINGS} element={<AnimatedPage><SettingsScreen /></AnimatedPage>} />
            <Route path={ROUTES.MORE_CROP_DB} element={<PanelPage><CropDatabaseRoute /></PanelPage>} />
            <Route path={ROUTES.MORE_FERT_DB} element={<PanelPage><FertilizerDatabaseRoute /></PanelPage>} />
            <Route path={ROUTES.MORE_HISTORY} element={<PanelPage><CropHistoryRoute /></PanelPage>} />
            <Route path={ROUTES.MORE_CH_CALC} element={<PanelPage><CHCalculatorRoute /></PanelPage>} />
            <Route path={ROUTES.MORE_ACTIVITY} element={<PanelPage><ActivityRoute /></PanelPage>} />
            <Route path={ROUTES.MORE_LEDGER} element={<PanelPage><FarmLedgerRoute /></PanelPage>} />
            <Route path={ROUTES.MORE_TREATMENT_RATES} element={<PanelPage><TreatmentAppRatesRoute /></PanelPage>} />
            <Route path={ROUTES.MORE_AREA_MAPPER} element={<PanelPage><AreaMapperRoute /></PanelPage>} />
            <Route path={ROUTES.MORE_DIARY} element={<PanelPage><DiaryScreen /></PanelPage>} />
            <Route path={ROUTES.MORE_CALCULATOR} element={<PanelPage><FarmCalculatorScreen /></PanelPage>} />
            <Route path={ROUTES.MORE_POS} element={<PanelPage><POSScreen /></PanelPage>} />
          </Routes>
        </AnimatePresence>
      </main>
      <BottomNav />
      <Toaster position="bottom-center" />
    </div>
  );
}

function App() {
  return <AppContent />;
}

export default App;
