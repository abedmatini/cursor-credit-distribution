import { useState, type ChangeEvent, type FormEvent } from 'react';
import { api, type ImportResult } from '../api';

function FileUploadCard({
  title,
  description,
  onUpload,
}: {
  title: string;
  description: string;
  onUpload: (file: File) => Promise<ImportResult>;
}) {
  const [result, setResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const res = await onUpload(file);
      setResult(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Import failed');
    } finally {
      setLoading(false);
      e.target.value = '';
    }
  }

  return (
    <div className="border rounded-xl p-5">
      <h3 className="font-semibold mb-1">{title}</h3>
      <p className="text-sm text-gray-500 mb-3">{description}</p>
      <input type="file" accept=".csv,.xlsx,.xls" onChange={handleChange} disabled={loading} />
      {loading && <p className="text-sm text-gray-500 mt-2">Importing...</p>}
      {error && <p className="text-sm text-red-600 mt-2">{error}</p>}
      {result && (
        <p className="text-sm text-green-700 mt-2">
          Imported {result.total} rows — created {result.created}
          {result.updated !== undefined ? `, updated ${result.updated}` : ''}
          {result.matchedByEmail !== undefined ? `, matched ${result.matchedByEmail} by email` : ''}
          {result.available !== undefined ? `, ${result.available} added to the available pool` : ''}
          {result.skipped.length ? `, skipped ${result.skipped.length}` : ''}.
        </p>
      )}
    </div>
  );
}

function AddGuestForm() {
  const [form, setForm] = useState({ name: '', email: '', phone: '', rsvpStatus: '', qrCodeUrl: '' });
  const [status, setStatus] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setStatus(null);
    try {
      await api.addGuest(form);
      setStatus('Guest added.');
      setForm({ name: '', email: '', phone: '', rsvpStatus: '', qrCodeUrl: '' });
    } catch (err) {
      setStatus(err instanceof Error ? err.message : 'Failed to add guest');
    }
  }

  return (
    <form onSubmit={handleSubmit} className="border rounded-xl p-5 space-y-2">
      <h3 className="font-semibold mb-1">Manually Add Guest</h3>
      <input
        required
        placeholder="Name"
        value={form.name}
        onChange={(e) => setForm({ ...form, name: e.target.value })}
        className="w-full border rounded-lg px-3 py-2"
      />
      <input
        required
        type="email"
        placeholder="Email"
        value={form.email}
        onChange={(e) => setForm({ ...form, email: e.target.value })}
        className="w-full border rounded-lg px-3 py-2"
      />
      <input
        placeholder="Phone (optional)"
        value={form.phone}
        onChange={(e) => setForm({ ...form, phone: e.target.value })}
        className="w-full border rounded-lg px-3 py-2"
      />
      <input
        placeholder="RSVP status (optional)"
        value={form.rsvpStatus}
        onChange={(e) => setForm({ ...form, rsvpStatus: e.target.value })}
        className="w-full border rounded-lg px-3 py-2"
      />
      <input
        placeholder="QR check-in URL (optional)"
        value={form.qrCodeUrl}
        onChange={(e) => setForm({ ...form, qrCodeUrl: e.target.value })}
        className="w-full border rounded-lg px-3 py-2"
      />
      <button className="bg-gray-900 text-white px-4 py-2 rounded-lg">Add Guest</button>
      {status && <p className="text-sm text-gray-600">{status}</p>}
    </form>
  );
}

function AddVoucherForm() {
  const [form, setForm] = useState({ code: '', link: '', email: '' });
  const [status, setStatus] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setStatus(null);
    if (!form.code.trim() && !form.link.trim()) {
      setStatus('Enter a voucher code or a link.');
      return;
    }
    try {
      await api.addVoucher(form);
      setStatus('Voucher added.');
      setForm({ code: '', link: '', email: '' });
    } catch (err) {
      setStatus(err instanceof Error ? err.message : 'Failed to add voucher');
    }
  }

  return (
    <form onSubmit={handleSubmit} className="border rounded-xl p-5 space-y-2">
      <h3 className="font-semibold mb-1">Manually Add Voucher</h3>
      <p className="text-xs text-gray-500">Provide a voucher code, a link, or both.</p>
      <input
        placeholder="Voucher code (optional if link is set)"
        value={form.code}
        onChange={(e) => setForm({ ...form, code: e.target.value })}
        className="w-full border rounded-lg px-3 py-2"
      />
      <input
        placeholder="Voucher link (optional if code is set)"
        value={form.link}
        onChange={(e) => setForm({ ...form, link: e.target.value })}
        className="w-full border rounded-lg px-3 py-2"
      />
      <input
        type="email"
        placeholder="Assign to guest email (optional - leave blank to add it to the available pool)"
        value={form.email}
        onChange={(e) => setForm({ ...form, email: e.target.value })}
        className="w-full border rounded-lg px-3 py-2"
      />
      <button className="bg-gray-900 text-white px-4 py-2 rounded-lg">Add Voucher</button>
      {status && <p className="text-sm text-gray-600">{status}</p>}
    </form>
  );
}

export function ImportPage() {
  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <h2 className="text-xl font-semibold">Import Guests &amp; Vouchers</h2>
      <div className="grid md:grid-cols-2 gap-4">
        <FileUploadCard
          title="Import Luma RSVP Guests"
          description="Upload the guest list exported from Luma (CSV or XLSX). No vouchers are assigned yet - a guest only gets one from the pool once they actually check in."
          onUpload={api.importGuests}
        />
        <FileUploadCard
          title="Import Voucher List"
          description="Upload voucher codes and/or links (CSV or XLSX) - a link alone is fine. Rows with an email are assigned to that guest directly; everything else joins the shared available pool and gets handed out automatically as guests check in. Safe to upload more vouchers later - they're added to the existing pool."
          onUpload={api.importVouchers}
        />
      </div>
      <div className="grid md:grid-cols-2 gap-4">
        <AddGuestForm />
        <AddVoucherForm />
      </div>
    </div>
  );
}
