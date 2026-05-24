import { Component, useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { supabaseClient, isAdminEmail, isLiffAuthed, authUserId, type Session } from './lib/auth';
import { setLineUserId } from './lib/liff';
import LoginPage from './pages/LoginPage';
import AdminPage from './pages/AdminPage';

class AppErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null };
  static getDerivedStateFromError(error: Error) { return { error }; }
  render() {
    if (this.state.error) {
      return (
        <div className="min-h-svh flex flex-col items-center justify-center gap-4 px-8 bg-[#FAFAF7] dark:bg-[#18181A]">
          <div className="w-14 h-14 rounded-full bg-red-50 dark:bg-[#3D1F1F] flex items-center justify-center text-2xl">⚠️</div>
          <p className="text-gray-800 dark:text-gray-200 font-medium text-center">เกิดข้อผิดพลาดที่ไม่คาดคิด</p>
          <p className="text-xs text-gray-400 text-center">{(this.state.error as Error).message}</p>
          <button
            onClick={() => this.setState({ error: null })}
            className="mt-2 px-5 py-2.5 rounded-xl bg-[#E24B4A] text-white text-sm font-medium"
          >
            ลองใหม่
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

function useDarkMode() {
  const [dark, setDark] = useState(() => {
    const saved = localStorage.getItem('tannote_dark');
    if (saved !== null) return saved === 'true';
    return window.matchMedia('(prefers-color-scheme: dark)').matches;
  });
  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark);
    localStorage.setItem('tannote_dark', String(dark));
  }, [dark]);
  return [dark, () => setDark((d) => !d)] as const;
}
import { initLiff } from './lib/liff';
import type { Message } from './pages/AskPage';
import RecordPage from './pages/RecordPage';
import RecordingsPage from './pages/RecordingsPage';
import GraphViewPage from './pages/GraphViewPage';
import AskPage from './pages/AskPage';
import SettingsPage from './pages/SettingsPage';
import PricingPage from './pages/PricingPage';
import RemindersPage from './pages/RemindersPage';

type Tab = 'record' | 'recordings' | 'graph' | 'ask' | 'reminders' | 'settings' | 'pricing' | 'admin';

function renderToggle(dark: boolean, toggleDark: () => void) {
  return (
    <button
      onClick={toggleDark}
      aria-label={dark ? 'โหมดสว่าง' : 'โหมดมืด'}
      className="fixed top-3 right-3 z-50 w-9 h-9 rounded-full bg-white dark:bg-[#252527] border border-gray-200 dark:border-[#444448] shadow-sm flex items-center justify-center text-gray-500 dark:text-gray-400 hover:border-gray-300 dark:hover:border-gray-500 transition-colors"
    >
      {dark ? (
        <svg className="w-[18px] h-[18px]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v2.25m6.364.386l-1.591 1.591M21 12h-2.25m-.386 6.364l-1.591-1.591M12 18.75V21m-4.773-4.227l-1.591 1.591M5.25 12H3m4.227-4.773L5.636 5.636M15.75 12a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0z" />
        </svg>
      ) : (
        <svg className="w-[18px] h-[18px]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M21.752 15.002A9.718 9.718 0 0118 15.75c-5.385 0-9.75-4.365-9.75-9.75 0-1.33.266-2.597.748-3.752A9.753 9.753 0 003 11.25C3 16.635 7.365 21 12.75 21a9.753 9.753 0 009.002-5.998z" />
        </svg>
      )}
    </button>
  );
}

// ─── Nav icon helpers ─────────────────────────────────────────────────────────

const NAV_ITEMS = [
  {
    id: 'record' as Tab,
    label: 'บันทึก',
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 18.75a6 6 0 006-6v-1.5m-6 7.5a6 6 0 01-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 01-3-3V4.5a3 3 0 116 0v8.25a3 3 0 01-3 3z" />
      </svg>
    ),
  },
  {
    id: 'recordings' as Tab,
    label: 'รายการ',
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 002.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 00-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 00.75-.75 2.25 2.25 0 00-.1-.664m-5.8 0A2.251 2.251 0 0113.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25zM6.75 12h.008v.008H6.75V12zm0 3h.008v.008H6.75V15zm0 3h.008v.008H6.75V18z" />
      </svg>
    ),
  },
  {
    id: 'graph' as Tab,
    label: 'กราฟ',
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <circle cx="5"  cy="12" r="2" fill="currentColor" stroke="none" />
        <circle cx="19" cy="5"  r="2" fill="currentColor" stroke="none" />
        <circle cx="19" cy="19" r="2" fill="currentColor" stroke="none" />
        <line x1="7"  y1="11.3" x2="17" y2="6"  strokeLinecap="round" />
        <line x1="7"  y1="12.7" x2="17" y2="18" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    id: 'ask' as Tab,
    label: 'ถาม AI',
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M8.625 12a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H8.25m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H12m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0h-.375M21 12c0 4.556-4.03 8.25-9 8.25a9.764 9.764 0 01-2.555-.337A5.972 5.972 0 015.41 20.97a5.969 5.969 0 01-.474-.065 4.48 4.48 0 00.978-2.025c.09-.457-.133-.901-.467-1.226C3.93 16.178 3 14.189 3 12c0-4.556 4.03-8.25 9-8.25s9 3.694 9 8.25z" />
      </svg>
    ),
  },
  {
    id: 'reminders' as Tab,
    label: 'นัดหมาย',
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M14.857 17.082a23.848 23.848 0 005.454-1.31A8.967 8.967 0 0118 9.75v-.7V9A6 6 0 006 9v.75a8.967 8.967 0 01-2.312 6.022c1.733.64 3.56 1.085 5.455 1.31m5.714 0a24.255 24.255 0 01-5.714 0m5.714 0a3 3 0 11-5.714 0" />
      </svg>
    ),
  },
  {
    id: 'settings' as Tab,
    label: 'ตั้งค่า',
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.324.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.24-.438.613-.431.992a6.759 6.759 0 010 .255c-.007.378.138.75.43.99l1.005.828c.424.35.534.954.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.57 6.57 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.28c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.02-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.992a6.932 6.932 0 010-.255c.007-.378-.138-.75-.43-.99l-1.004-.828a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.087.22-.128.332-.183.582-.495.644-.869l.214-1.281z" />
        <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
      </svg>
    ),
  },
];

const ADMIN_NAV = {
  id: 'admin' as Tab,
  label: 'Admin',
  icon: (
    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
    </svg>
  ),
};

// ─── App ──────────────────────────────────────────────────────────────────────

export default function App() {
  const [tab, setTab]                   = useState<Tab>('record');
  const [focusNoteId, setFocusNoteId]   = useState<string | null>(null);
  const [chatMessages, setChatMessages] = useState<Message[]>([]);
  const [dark, toggleDark]              = useDarkMode();
  const [session, setSession]           = useState<Session | null>(null);
  const [authLoading, setAuthLoading]   = useState(true);

  useEffect(() => {
    Promise.all([
      supabaseClient.auth.getSession().then(({ data }) => {
        const s = data.session;
        setSession(s);
        if (s?.user.id) setLineUserId(authUserId(s.user.id));
      }),
      initLiff(),
    ]).finally(() => setAuthLoading(false));

    const { data: { subscription } } = supabaseClient.auth.onAuthStateChange((event, s) => {
      setSession(s);
      if (s?.user.id) setLineUserId(authUserId(s.user.id));
      else if (event === 'SIGNED_OUT') setLineUserId('');
    });
    return () => subscription.unsubscribe();
  }, []);

  function handleOpenNote(noteId: string) {
    setFocusNoteId(noteId);
    setTab('recordings');
  }

  if (authLoading) {
    return (
      <div className="min-h-svh flex items-center justify-center bg-[#FAFAF7] dark:bg-[#18181A]">
        <div className="w-8 h-8 rounded-full border-2 border-[#E24B4A] border-t-transparent animate-spin" />
      </div>
    );
  }

  if (!isLiffAuthed() && !session) return <LoginPage />;

  const isAdmin = isAdminEmail(session?.user.email);

  if (tab === ('admin' as Tab) && isAdmin && session) {
    return (
      <div className="flex min-h-svh bg-[#FAFAF7] dark:bg-[#18181A]">
        <DesktopSidebar tab={tab} setTab={setTab} dark={dark} toggleDark={toggleDark} isAdmin={isAdmin} />
        <main className="flex-1 md:ml-56 overflow-auto min-h-svh">
          <AdminPage session={session} />
        </main>
        <MobileBottomNav tab={tab} setTab={setTab} isAdmin={isAdmin} />
      </div>
    );
  }

  const navItems = [...NAV_ITEMS, ...(isAdmin ? [ADMIN_NAV] : [])];

  return (
    <div className="flex min-h-svh bg-[#FAFAF7] dark:bg-[#18181A]">
      {/* Desktop sidebar */}
      <DesktopSidebar tab={tab} setTab={setTab} dark={dark} toggleDark={toggleDark} isAdmin={isAdmin} navItems={navItems} />

      {/* Content area */}
      <main className="flex-1 md:ml-56 min-h-svh flex flex-col">
        <AppErrorBoundary>
          <div className="flex-1 pb-20 md:pb-6">
            {tab === 'record'     && <RecordPage />}
            {tab === 'recordings' && <RecordingsPage focusNoteId={focusNoteId} onFocusConsumed={() => setFocusNoteId(null)} />}
            {tab === 'graph'      && <GraphViewPage onNavigateToNote={handleOpenNote} />}
            {tab === 'ask'        && <AskPage onOpenNote={handleOpenNote} messages={chatMessages} setMessages={setChatMessages} />}
            {tab === 'reminders'  && <RemindersPage />}
            {tab === 'settings'   && <SettingsPage onOpenPricing={() => setTab('pricing')} />}
            {tab === 'pricing'    && <PricingPage  onBack={() => setTab('settings')} />}
          </div>
        </AppErrorBoundary>
      </main>

      {/* Mobile bottom nav */}
      <MobileBottomNav tab={tab} setTab={setTab} isAdmin={isAdmin} navItems={navItems} />

      {/* Dark toggle — mobile only (desktop has it in sidebar) */}
      <div className="md:hidden">
        {renderToggle(dark, toggleDark)}
      </div>
    </div>
  );
}

// ─── DesktopSidebar ───────────────────────────────────────────────────────────

function DesktopSidebar({
  tab, setTab, dark, toggleDark, isAdmin,
  navItems = [...NAV_ITEMS, ...(isAdmin ? [ADMIN_NAV] : [])],
}: {
  tab: Tab;
  setTab: (t: Tab) => void;
  dark: boolean;
  toggleDark: () => void;
  isAdmin: boolean;
  navItems?: typeof NAV_ITEMS;
}) {
  return (
    <aside className="hidden md:flex flex-col fixed h-full w-56 bg-white dark:bg-[#1A1A1C] border-r border-gray-100 dark:border-[#2A2A2C] z-40">
      {/* Brand */}
      <div className="px-5 pt-6 pb-5 border-b border-gray-100 dark:border-[#2A2A2C]">
        <p className="text-xl font-bold text-[#E24B4A] tracking-tight">ทันโน้ต</p>
        <p className="text-[11px] text-gray-400 dark:text-gray-600 mt-0.5">AI Voice Note</p>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-4 flex flex-col gap-1 overflow-y-auto">
        {navItems.map((item) => (
          <SidebarItem
            key={item.id}
            active={tab === item.id || (item.id === 'settings' && tab === 'pricing')}
            onClick={() => setTab(item.id)}
            icon={item.icon}
            label={item.label}
          />
        ))}
      </nav>

      {/* Bottom: dark toggle + version */}
      <div className="px-3 pb-5 pt-3 border-t border-gray-100 dark:border-[#2A2A2C] flex flex-col gap-2">
        <button
          onClick={toggleDark}
          className="flex items-center gap-2.5 w-full px-3 py-2 rounded-xl text-sm text-gray-500 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-[#333336] transition-colors"
        >
          {dark ? (
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v2.25m6.364.386l-1.591 1.591M21 12h-2.25m-.386 6.364l-1.591-1.591M12 18.75V21m-4.773-4.227l-1.591 1.591M5.25 12H3m4.227-4.773L5.636 5.636M15.75 12a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0z" />
            </svg>
          ) : (
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M21.752 15.002A9.718 9.718 0 0118 15.75c-5.385 0-9.75-4.365-9.75-9.75 0-1.33.266-2.597.748-3.752A9.753 9.753 0 003 11.25C3 16.635 7.365 21 12.75 21a9.753 9.753 0 009.002-5.998z" />
            </svg>
          )}
          {dark ? 'โหมดสว่าง' : 'โหมดมืด'}
        </button>
      </div>
    </aside>
  );
}

function SidebarItem({
  active, onClick, icon, label,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-3 w-full px-3 py-2.5 rounded-xl text-sm font-medium transition-colors text-left ${
        active
          ? 'bg-[#E24B4A]/10 text-[#E24B4A]'
          : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-[#333336] hover:text-gray-900 dark:hover:text-gray-200'
      }`}
    >
      {icon}
      {label}
    </button>
  );
}

// ─── MobileBottomNav ──────────────────────────────────────────────────────────

function MobileBottomNav({
  tab, setTab, isAdmin,
  navItems = [...NAV_ITEMS, ...(isAdmin ? [ADMIN_NAV] : [])],
}: {
  tab: Tab;
  setTab: (t: Tab) => void;
  isAdmin: boolean;
  navItems?: typeof NAV_ITEMS;
}) {
  return (
    <nav className="fixed bottom-0 inset-x-0 bg-white dark:bg-[#1A1A1C] border-t border-gray-100 dark:border-[#333336] flex justify-around items-stretch z-50 safe-area-pb md:hidden">
      {navItems.map((item) => (
        <BottomNavItem
          key={item.id}
          active={tab === item.id || (item.id === 'settings' && tab === 'pricing')}
          onClick={() => setTab(item.id)}
          icon={item.icon}
          label={item.label}
        />
      ))}
    </nav>
  );
}

function BottomNavItem({
  active, onClick, icon, label,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex flex-col items-center justify-center gap-0.5 flex-1 py-3 text-xs font-medium transition-colors ${
        active ? 'text-[#E24B4A]' : 'text-gray-400 dark:text-gray-600 hover:text-gray-600 dark:hover:text-gray-400'
      }`}
    >
      {icon}
      {label}
    </button>
  );
}
