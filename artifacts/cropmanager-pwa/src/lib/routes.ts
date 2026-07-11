export const ROUTES = {
  DASHBOARD: '/',
  CROPS: '/crops',
  PROPAGATIONS: '/propagations',
  CALENDAR: '/calendar',
  MORE: '/more',
  MORE_CROP_DB: '/more/crop-db',
  MORE_FERT_DB: '/more/fert-db',
  MORE_HISTORY: '/more/history',
  MORE_CH_CALC: '/more/ch-calc',
  MORE_ACTIVITY: '/more/activity',
  MORE_LEDGER: '/more/ledger',
  MORE_TREATMENT_RATES: '/more/treatment-rates',
  MORE_AREA_MAPPER: '/more/area-mapper',
  MORE_DIARY: '/more/diary',
  MORE_CALCULATOR: '/more/calculator',
  MORE_POS: '/more/pos',
  HERB_SCHEDULE: '/herb-schedule',
  REMINDERS: '/reminders',
  SETTINGS: '/settings',
} as const;

export const ROUTE_TITLES: Record<string, string> = {
  [ROUTES.DASHBOARD]: 'CropManager',
  [ROUTES.CROPS]: 'Crops',
  [ROUTES.PROPAGATIONS]: 'Propagations',
  [ROUTES.CALENDAR]: 'Calendar',
  [ROUTES.MORE]: 'More',
  [ROUTES.MORE_CROP_DB]: 'Crop Database',
  [ROUTES.MORE_FERT_DB]: 'Fertilizer Database',
  [ROUTES.MORE_HISTORY]: 'Crop Analysis',
  [ROUTES.MORE_CH_CALC]: 'C-H Calculator',
  [ROUTES.MORE_ACTIVITY]: 'Activity Log',
  [ROUTES.MORE_LEDGER]: 'Farm Ledger',
  [ROUTES.MORE_TREATMENT_RATES]: 'Treatment App Rates',
  [ROUTES.MORE_AREA_MAPPER]: 'Area Mapper',
  [ROUTES.MORE_DIARY]: 'Diary',
  [ROUTES.MORE_CALCULATOR]: 'Calculator',
  [ROUTES.MORE_POS]: 'Point of Sale',
  [ROUTES.HERB_SCHEDULE]: 'Herbicide Schedule',
  [ROUTES.REMINDERS]: 'Reminders',
  [ROUTES.SETTINGS]: 'Settings',
};

const ROOT_ROUTES = new Set<string>([
  ROUTES.DASHBOARD,
  ROUTES.CROPS,
  ROUTES.PROPAGATIONS,
  ROUTES.CALENDAR,
  ROUTES.MORE,
  ROUTES.SETTINGS,
  ROUTES.REMINDERS,
  ROUTES.HERB_SCHEDULE,
]);

export function isRootRoute(pathname: string): boolean {
  return ROOT_ROUTES.has(pathname);
}

const BOTTOM_NAV_ROUTES = new Set<string>([
  ROUTES.DASHBOARD,
  ROUTES.CROPS,
  ROUTES.PROPAGATIONS,
  ROUTES.MORE,
  ROUTES.SETTINGS,
]);

export function showBottomNav(pathname: string): boolean {
  return BOTTOM_NAV_ROUTES.has(pathname);
}

/**
 * Returns true if the route is a sub-page that should show a back button in the TopBar.
 */
export function isSubRoute(pathname: string): boolean {
  return pathname.startsWith('/more/') || pathname === ROUTES.REMINDERS || pathname === ROUTES.HERB_SCHEDULE;
}

/**
 * Returns the parent route to navigate back to for sub-routes.
 */
export function getParentRoute(pathname: string): string {
  if (pathname.startsWith('/more/')) return ROUTES.MORE;
  if (pathname === ROUTES.REMINDERS) return ROUTES.MORE;
  if (pathname === ROUTES.HERB_SCHEDULE) return ROUTES.MORE;
  return ROUTES.DASHBOARD;
}
