import React from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAppStore } from '../../store/useAppStore';
import { CloudOff, Menu, ChevronLeft } from 'lucide-react';
import { ROUTES, ROUTE_TITLES, isSubRoute, getParentRoute } from '../../lib/routes';

function titleFor(pathname: string): string {
  const exact = ROUTE_TITLES[pathname];
  if (exact) return exact;
  // Dynamic routes never match the literal '/crops/:id' key — resolve by prefix
  if (pathname === ROUTES.CROPS_ARCHIVE) return 'Archive';
  if (pathname === ROUTES.CROP_CREATE) return 'New Crop';
  if (pathname.startsWith('/crops/')) return 'Crop Details';
  return 'CropManager';
}

export function TopBar() {
  const location = useLocation();
  const navigate = useNavigate();
  const { setDrawerOpen } = useAppStore();
  const isOnline = navigator.onLine;

  const title = titleFor(location.pathname);
  const showBack = isSubRoute(location.pathname);
  const showMenu = !showBack;

  return (
    <header className="fixed top-0 left-0 right-0 bg-green-700 text-white z-40 safe-top">
      <div className="flex items-center gap-2 px-4 h-14">
        {showMenu ? (
          <button
            onClick={() => setDrawerOpen(true)}
            aria-label="Open menu"
            className="p-1.5 -ml-1.5 rounded-lg hover:bg-green-600 transition-colors"
          >
            <Menu className="w-5 h-5" />
          </button>
        ) : (
          <button
            onClick={() => navigate(getParentRoute(location.pathname))}
            aria-label="Go back"
            className="p-1.5 -ml-1.5 rounded-lg hover:bg-green-600 transition-colors"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
        )}
        <h1 className="font-bold text-lg flex-1 truncate">{title}</h1>
        <div className="flex items-center gap-3">
          {!isOnline && <CloudOff className="w-4 h-4 text-orange-300" />}
        </div>
      </div>
    </header>
  );
}
