export interface Voucher {
  id: string;
  code: string;
  link: string | null;
  status: 'AVAILABLE' | 'ASSIGNED';
  assignedEmail: string | null;
  guestId: string | null;
  createdAt: string;
  guest?: { id: string; name: string; email: string } | null;
}

export interface Guest {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  rsvpStatus: string | null;
  source: string;
  checkedInAt: string | null;
  qrCodeUrl: string | null;
  sendStatus: 'NOT_SENT' | 'SENDING' | 'SENT' | 'FAILED';
  lastSentAt: string | null;
  lastError: string | null;
  voucher: Voucher | null;
  createdAt: string;
}

export interface ImportResult {
  total: number;
  created: number;
  updated?: number;
  matchedByEmail?: number;
  available?: number;
  skipped: { row: number; reason: string }[];
}

const BASE = '/api';

async function handle<T>(res: Response): Promise<T> {
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error((data as { error?: string }).error || `Request failed with status ${res.status}`);
  }
  return data as T;
}

async function handleNoContent(res: Response): Promise<void> {
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error((data as { error?: string }).error || `Request failed with status ${res.status}`);
  }
}

export const api = {
  listGuests: (search = '') =>
    fetch(`${BASE}/guests${search ? `?search=${encodeURIComponent(search)}` : ''}`).then((r) => handle<Guest[]>(r)),

  lookupGuestsByEmail: (email: string) =>
    fetch(`${BASE}/guests/lookup?email=${encodeURIComponent(email)}`).then((r) => handle<Guest[]>(r)),

  lookupGuestByQr: (url: string) =>
    fetch(`${BASE}/guests/lookup-by-qr?url=${encodeURIComponent(url)}`).then((r) => handle<Guest>(r)),

  getGuest: (id: string) => fetch(`${BASE}/guests/${id}`).then((r) => handle<Guest>(r)),

  deleteGuest: (id: string) => fetch(`${BASE}/guests/${id}`, { method: 'DELETE' }).then((r) => handleNoContent(r)),

  deleteAllGuests: () => fetch(`${BASE}/guests`, { method: 'DELETE' }).then((r) => handleNoContent(r)),

  addGuest: (payload: { name: string; email: string; phone?: string; rsvpStatus?: string; qrCodeUrl?: string }) =>
    fetch(`${BASE}/guests`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }).then((r) => handle<Guest>(r)),

  importGuests: (file: File) => {
    const form = new FormData();
    form.append('file', file);
    return fetch(`${BASE}/guests/import`, { method: 'POST', body: form }).then((r) => handle<ImportResult>(r));
  },

  addVoucher: (payload: { code: string; link?: string; email?: string }) =>
    fetch(`${BASE}/vouchers`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }).then((r) => handle<Voucher>(r)),

  importVouchers: (file: File) => {
    const form = new FormData();
    form.append('file', file);
    return fetch(`${BASE}/vouchers/import`, { method: 'POST', body: form }).then((r) => handle<ImportResult>(r));
  },

  listVouchers: () => fetch(`${BASE}/vouchers`).then((r) => handle<Voucher[]>(r)),

  deleteVoucher: (id: string) => fetch(`${BASE}/vouchers/${id}`, { method: 'DELETE' }).then((r) => handleNoContent(r)),

  deleteAllVouchers: () => fetch(`${BASE}/vouchers`, { method: 'DELETE' }).then((r) => handleNoContent(r)),

  sendVoucher: (guestId: string) =>
    fetch(`${BASE}/guests/${guestId}/send-voucher`, { method: 'POST' }).then((r) => handle<Guest>(r)),

  assignVoucher: (guestId: string, payload: { voucherId?: string; code?: string }) =>
    fetch(`${BASE}/guests/${guestId}/assign-voucher`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }).then((r) => handle<Voucher>(r)),
};
