import { useState } from 'react';
import { ImportPage } from './pages/ImportPage';
import { CheckInPage } from './pages/CheckInPage';
import { GuestsPage } from './pages/GuestsPage';
import { VouchersPage } from './pages/VouchersPage';

type Tab = 'checkin' | 'import' | 'guests' | 'vouchers';

const TABS: { id: Tab; label: string }[] = [
  { id: 'checkin', label: 'Check-In' },
  { id: 'import', label: 'Import' },
  { id: 'guests', label: 'Guests' },
  { id: 'vouchers', label: 'Vouchers' },
];

export default function App() {
  const [tab, setTab] = useState<Tab>('checkin');

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b">
        <div className="max-w-5xl mx-auto px-4 py-4 flex items-center justify-between">
          <h1 className="text-lg font-bold">Cafe Cursor — Credit Distribution</h1>
          <nav className="flex gap-2">
            {TABS.map((t) => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium ${
                  tab === t.id ? 'bg-gray-900 text-white' : 'text-gray-600 hover:bg-gray-100'
                }`}
              >
                {t.label}
              </button>
            ))}
          </nav>
        </div>
      </header>
      <main className="max-w-5xl mx-auto px-4 py-8">
        {tab === 'checkin' && <CheckInPage />}
        {tab === 'import' && <ImportPage />}
        {tab === 'guests' && <GuestsPage />}
        {tab === 'vouchers' && <VouchersPage />}
      </main>
    </div>
  );
}
