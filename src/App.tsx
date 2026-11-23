import React, { useEffect, useState } from 'react';
import {
  Building2,
  CalendarDays,
  CheckCircle2,
  ChefHat,
  ChevronDown,
  ClipboardCheck,
  Clock,
  History,
  Home,
  LayoutDashboard,
  LogOut,
  PackageOpen,
  Users,
} from 'lucide-react';
import { ErrorBoundary } from './components/ErrorBoundary';
import { CleanlinessDetailPage } from './pages/CleanlinessDetailPage';
import { HistoryPage } from './pages/HistoryPage';
import { ItemReportsPage } from './pages/ItemReportsPage';
import { LoginPage } from './pages/LoginPage';
import { SchedulePage } from './pages/SchedulePage';
import { SupervisorDashboardPage } from './pages/SupervisorDashboardPage';
import { TeamManagementPage } from './pages/TeamManagementPage';
import { TodayPage } from './pages/TodayPage';
import { useKitchen } from './storage/kitchenContext';
import { AppView, ShiftType } from './types/kitchen';
import { resolveKitchenTheme } from './utils/kitchenTheme';
import { formatDateIndo, formatTimeDotWib } from './utils/wibTime';

interface NavItem {
  id: AppView;
  label: string;
  mobileLabel: string;
  icon: React.ComponentType<{ className?: string }>;
  mobileVisible?: boolean;
}

function KitchenShell() {
  const {
    state,
    workspaces,
    activeWorkspaceId,
    firebaseUser,
    authReady,
    workspaceLoading,
    workspaceAccessStatus,
    currentUser,
    nowWib,
    toastMessage,
    signOutGoogle,
    switchWorkspace,
  } = useKitchen();

  const [view, setView] = useState<AppView>('today');
  const [cleanlinessTarget, setCleanlinessTarget] = useState<{
    date: string;
    shift: ShiftType;
  }>({
    date: nowWib.date,
    shift: 'opening',
  });

  const activeTheme =
    workspaceAccessStatus === 'ready'
      ? resolveKitchenTheme(activeWorkspaceId, state.kitchenName)
      : resolveKitchenTheme(null, null);

  useEffect(() => {
    document.documentElement.setAttribute('data-kitchen-theme', activeTheme.key);
  }, [activeTheme.key]);

  useEffect(() => {
    if (!currentUser) return;
    setView((prev) => {
      if (currentUser.role === 'supervisor') {
        return prev === 'login' || prev === 'today' ? 'supervisor_dashboard' : prev;
      }
      if (
        prev === 'supervisor_dashboard' ||
        prev === 'schedule' ||
        prev === 'team' ||
        prev === 'history' ||
        prev === 'login'
      ) {
        return 'today';
      }
      return prev;
    });
  }, [currentUser?.id, currentUser?.role]);

  const openCleanlinessDetail = (date: string, shift: ShiftType) => {
    setCleanlinessTarget({ date, shift });
    setView('cleanliness_detail');
  };

  const navItems: NavItem[] =
    currentUser?.role === 'supervisor'
      ? [
          {
            id: 'supervisor_dashboard',
            label: 'Dashboard',
            mobileLabel: 'Ringkasan',
            icon: LayoutDashboard,
            mobileVisible: true,
          },
          {
            id: 'today',
            label: 'Shift Saya',
            mobileLabel: 'Shift Saya',
            icon: Home,
            mobileVisible: false,
          },
          {
            id: 'schedule',
            label: 'Jadwal Shift',
            mobileLabel: 'Jadwal',
            icon: CalendarDays,
            mobileVisible: true,
          },
          {
            id: 'team',
            label: 'Tim & Akses',
            mobileLabel: 'Tim',
            icon: Users,
            mobileVisible: true,
          },
          {
            id: 'cleanliness_detail',
            label: 'Laporan Kebersihan',
            mobileLabel: 'Kebersihan',
            icon: ClipboardCheck,
            mobileVisible: true,
          },
          {
            id: 'item_reports',
            label: 'Laporan Barang',
            mobileLabel: 'Barang',
            icon: PackageOpen,
            mobileVisible: true,
          },
          {
            id: 'history',
            label: 'Riwayat',
            mobileLabel: 'Riwayat',
            icon: History,
            mobileVisible: false,
          },
        ]
      : [
          {
            id: 'today',
            label: 'Hari Ini',
            mobileLabel: 'Hari Ini',
            icon: Home,
            mobileVisible: true,
          },
          {
            id: 'cleanliness_detail',
            label: 'Laporan Kebersihan',
            mobileLabel: 'Kebersihan',
            icon: ClipboardCheck,
            mobileVisible: true,
          },
          {
            id: 'item_reports',
            label: 'Laporan Barang',
            mobileLabel: 'Barang',
            icon: PackageOpen,
            mobileVisible: true,
          },
        ];

  const mobileNavItems = navItems.filter((item) => item.mobileVisible !== false);

  return (
    <div className="min-h-screen bg-[var(--kl-bg)] text-[var(--kl-ink)] flex flex-col transition-colors duration-200">
      {!authReady || workspaceLoading ? (
        <main className="flex-1 flex items-center justify-center p-6">
          <div className="rounded-2xl border border-[var(--kl-border)] bg-white px-6 py-5 text-sm text-[var(--kl-ink-muted)]">
            Memuat sesi autentikasi &amp; data KitchenLog…
          </div>
        </main>
      ) : !firebaseUser || workspaceAccessStatus !== 'ready' || !currentUser ? (
        <main className="flex-1">
          <LoginPage />
        </main>
      ) : (
        <div className="flex-1 flex flex-col lg:flex-row max-w-[1440px] w-full mx-auto">
          {/* Header HP (< lg) */}
          <header className="lg:hidden sticky top-0 z-30 border-b border-[var(--kl-border)] bg-white/95 backdrop-blur-md">
            <div className="h-1.5 w-full bg-[var(--kl-accent)] transition-colors duration-200" />
            <div className="px-4 py-2.5 space-y-2">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="w-8 h-8 rounded-lg bg-[var(--kl-accent)] text-white flex items-center justify-center shrink-0 transition-colors duration-200">
                    <ChefHat className="w-4 h-4" aria-hidden="true" />
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span
                        className="w-2 h-2 rounded-full bg-[var(--kl-accent)] shrink-0"
                        aria-hidden="true"
                      />
                      <p className="text-sm font-bold text-[var(--kl-ink)] truncate">
                        {state.kitchenName}
                      </p>
                    </div>
                    <p className="text-[11px] text-[var(--kl-ink-muted)] truncate">
                      {currentUser.name} · {currentUser.jobTitle} ·{' '}
                      <span className="font-mono tabular-nums">
                        {formatTimeDotWib(nowWib.timeHHMM)}
                      </span>
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={signOutGoogle}
                  className="min-h-[38px] px-2.5 py-1.5 rounded-lg border border-[var(--kl-border-strong)] bg-[var(--kl-bg)] text-xs font-semibold text-[var(--kl-ink-sub)] hover:bg-[var(--kl-soft)] inline-flex items-center gap-1 shrink-0"
                  aria-label="Keluar akun"
                >
                  <LogOut className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>Keluar</span>
                </button>
              </div>

              {workspaces.length > 1 && (
                <div className="relative">
                  <Building2
                    className="w-3.5 h-3.5 text-[var(--kl-accent)] pointer-events-none absolute left-3 top-1/2 -translate-y-1/2"
                    aria-hidden="true"
                  />
                  <select
                    aria-label="Pilih lokasi dapur"
                    value={activeWorkspaceId ?? ''}
                    onChange={(e) => switchWorkspace(e.target.value)}
                    className="w-full min-h-[38px] pl-8 pr-8 py-1.5 rounded-xl border border-[var(--kl-tint-border)] bg-[var(--kl-tint)] text-xs font-semibold text-[var(--kl-accent-deep)] appearance-none focus:bg-white focus:outline-none focus:ring-2 focus:ring-[var(--kl-accent)]"
                  >
                    {workspaces.map((ws) => (
                      <option key={ws.id} value={ws.id}>
                        {ws.kitchenName}
                      </option>
                    ))}
                  </select>
                  <ChevronDown
                    className="w-4 h-4 text-[var(--kl-accent-deep)] pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2"
                    aria-hidden="true"
                  />
                </div>
              )}
            </div>
          </header>

          {/* Sidebar Kiri Tetap untuk Laptop / Desktop */}
          <aside className="hidden lg:flex lg:flex-col lg:w-64 lg:shrink-0 border-r border-[var(--kl-border)] bg-white transition-colors duration-200">
            <div className="h-1.5 w-full bg-[var(--kl-accent)] transition-colors duration-200" />
            <div className="p-5 border-b border-[var(--kl-border)] space-y-3">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-[var(--kl-accent)] text-white flex items-center justify-center shrink-0 transition-colors duration-200">
                  <ChefHat className="w-5 h-5" aria-hidden="true" />
                </div>
                <div className="min-w-0">
                  <span className="text-base font-bold tracking-tight text-[var(--kl-ink)] block truncate">
                    KitchenLog
                  </span>
                  <span className="text-xs font-semibold text-[var(--kl-accent)] flex items-center gap-1.5 truncate">
                    <span
                      className="w-2 h-2 rounded-full bg-[var(--kl-accent)] shrink-0"
                      aria-hidden="true"
                    />
                    <span className="truncate">{state.kitchenName}</span>
                  </span>
                </div>
              </div>

              {workspaces.length > 1 && (
                <div className="relative">
                  <Building2
                    className="w-3.5 h-3.5 text-[var(--kl-accent)] pointer-events-none absolute left-3 top-1/2 -translate-y-1/2"
                    aria-hidden="true"
                  />
                  <select
                    aria-label="Pilih lokasi dapur"
                    value={activeWorkspaceId ?? ''}
                    onChange={(e) => switchWorkspace(e.target.value)}
                    className="w-full min-h-[40px] pl-8 pr-8 py-1.5 rounded-xl border border-[var(--kl-tint-border)] bg-[var(--kl-tint)] text-xs font-semibold text-[var(--kl-accent-deep)] appearance-none cursor-pointer hover:brightness-95 focus:bg-white focus:outline-none focus:ring-2 focus:ring-[var(--kl-accent)] transition-colors"
                  >
                    {workspaces.map((ws) => (
                      <option key={ws.id} value={ws.id}>
                        {ws.kitchenName}
                      </option>
                    ))}
                  </select>
                  <ChevronDown
                    className="w-4 h-4 text-[var(--kl-accent-deep)] pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2"
                    aria-hidden="true"
                  />
                </div>
              )}

              <div className="rounded-xl bg-[var(--kl-bg)] border border-[var(--kl-border)] p-3 space-y-1">
                <p className="text-sm font-bold text-[var(--kl-ink)] truncate">
                  {currentUser.name}
                </p>
                <p className="text-xs font-semibold text-[var(--kl-accent)] truncate">
                  {currentUser.role === 'supervisor' ? 'Admin' : 'Staf Dapur'} ·{' '}
                  {currentUser.jobTitle}
                </p>
                <p className="text-[11px] text-[var(--kl-ink-muted)] truncate">
                  {currentUser.email}
                </p>
              </div>

              <div className="flex items-center gap-1.5 text-xs text-[var(--kl-ink-muted)] font-mono tabular-nums px-0.5">
                <Clock
                  className="w-3.5 h-3.5 text-[var(--kl-accent)] shrink-0"
                  aria-hidden="true"
                />
                <span>
                  {formatDateIndo(nowWib.date, false)} · {formatTimeDotWib(nowWib.timeHHMM)}
                </span>
              </div>
            </div>

            <nav className="flex-1 p-3 space-y-1" aria-label="Navigasi utama">
              {navItems.map((item) => {
                const Icon = item.icon;
                const active = view === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setView(item.id)}
                    className={`w-full min-h-[44px] px-3.5 py-2.5 rounded-xl text-sm font-semibold flex items-center gap-3 transition-colors whitespace-nowrap ${
                      active
                        ? 'bg-[var(--kl-accent)] text-white'
                        : 'text-[var(--kl-ink-sub)] hover:bg-[var(--kl-soft)]'
                    }`}
                  >
                    <Icon className="w-4 h-4 shrink-0" aria-hidden="true" />
                    <span className="truncate">{item.label}</span>
                  </button>
                );
              })}
            </nav>

            <div className="p-3 border-t border-[var(--kl-border)]">
              <button
                type="button"
                onClick={signOutGoogle}
                className="w-full min-h-[44px] px-3.5 py-2 rounded-xl border border-[var(--kl-border)] bg-[var(--kl-bg)] text-xs font-semibold text-[var(--kl-ink-sub)] hover:bg-[var(--kl-soft)] flex items-center gap-2.5 whitespace-nowrap"
              >
                <LogOut className="w-4 h-4 shrink-0" aria-hidden="true" />
                <span>Keluar Google</span>
              </button>
            </div>
          </aside>

          {/* Konten Utama */}
          <main className="flex-1 min-w-0 px-4 sm:px-6 lg:px-8 py-5 pb-24 lg:pb-10">
            <div className="max-w-5xl mx-auto">
              {view === 'today' && (
                <TodayPage
                  onNavigateCleanlinessDetail={openCleanlinessDetail}
                  onNavigateItemReports={() => setView('item_reports')}
                />
              )}

              {view === 'supervisor_dashboard' && currentUser.role === 'supervisor' && (
                <SupervisorDashboardPage
                  onNavigateCleanlinessDetail={openCleanlinessDetail}
                  onNavigateItemReports={() => setView('item_reports')}
                  onNavigateSchedule={() => setView('schedule')}
                  onNavigateTeam={() => setView('team')}
                  onNavigateHistory={() => setView('history')}
                  onNavigateMyShift={() => setView('today')}
                />
              )}

              {view === 'schedule' && currentUser.role === 'supervisor' && <SchedulePage />}

              {view === 'team' && currentUser.role === 'supervisor' && <TeamManagementPage />}

              {view === 'cleanliness_detail' && (
                <CleanlinessDetailPage
                  targetDate={cleanlinessTarget.date}
                  targetShift={cleanlinessTarget.shift}
                  onBack={() =>
                    setView(
                      currentUser.role === 'supervisor'
                        ? 'supervisor_dashboard'
                        : 'today'
                    )
                  }
                />
              )}

              {view === 'item_reports' && <ItemReportsPage />}

              {view === 'history' && currentUser.role === 'supervisor' && (
                <HistoryPage onNavigateCleanlinessDetail={openCleanlinessDetail} />
              )}
            </div>
          </main>

          {/* Navigasi Bawah untuk HP (< lg) */}
          <nav
            className="lg:hidden fixed bottom-0 left-0 right-0 z-40 border-t border-[var(--kl-border)] bg-white/95 backdrop-blur-md pb-safe"
            aria-label="Navigasi bawah HP"
          >
            <div
              className="grid items-center h-16 max-w-xl mx-auto px-1"
              style={{ gridTemplateColumns: `repeat(${mobileNavItems.length}, minmax(0, 1fr))` }}
            >
              {mobileNavItems.map((item) => {
                const Icon = item.icon;
                const active = view === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setView(item.id)}
                    className={`min-h-[44px] flex flex-col items-center justify-center gap-0.5 px-1 rounded-lg transition-colors ${
                      active
                        ? 'text-[var(--kl-accent)] font-bold bg-[var(--kl-tint)]/55'
                        : 'text-[var(--kl-ink-muted)] font-medium'
                    }`}
                  >
                    <Icon className="w-5 h-5 shrink-0" aria-hidden="true" />
                    <span className="text-[11px] leading-tight truncate max-w-full">
                      {item.mobileLabel}
                    </span>
                  </button>
                );
              })}
            </div>
          </nav>
        </div>
      )}

      {/* Konfirmasi Toast setelah data disimpan */}
      {toastMessage && (
        <div
          role="status"
          aria-live="polite"
          className="fixed bottom-20 lg:bottom-6 right-4 left-4 sm:left-auto sm:max-w-md z-50 rounded-xl border border-[var(--kl-accent)] bg-[var(--kl-accent-deep)] text-white px-4 py-3 shadow-lg flex items-center gap-2.5 text-sm font-medium"
        >
          <CheckCircle2
            className="w-4 h-4 text-[var(--kl-toast-icon)] shrink-0"
            aria-hidden="true"
          />
          <span>{toastMessage}</span>
        </div>
      )}
    </div>
  );
}

export default function App() {
  // Provider (Firebase atau demo) dipasang di titik masuk: src/main.tsx / src/main-demo.tsx
  return (
    <ErrorBoundary>
      <KitchenShell />
    </ErrorBoundary>
  );
}
