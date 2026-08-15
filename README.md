# Cafe Cursor — Credit Distribution

A simple internal tool for event day: import your Luma RSVP guest list and voucher
list (CSV/XLSX), look up a guest by email at the door, and send (or resend) their
Cursor credit voucher by email via Brevo — with a live send status.

## Stack

- **Backend**: Node.js + Express + TypeScript + Prisma ORM + PostgreSQL
- **Frontend**: React + Vite + TypeScript + Tailwind CSS
- **Database**: PostgreSQL in Docker (+ Adminer for a quick DB browser)
- **Email**: Brevo transactional email API (`api-key` header, no SDK dependency)

Monorepo layout:

```
docker-compose.yml          # Postgres + Adminer
packages/backend            # Express API, Prisma schema, Brevo integration
packages/frontend            # React app (Import / Check-In / Guests pages)
```

## 1. Prerequisites

- Node.js 18+ (already installed on this machine: run `node -v` to confirm)
- Docker Desktop, **with a working WSL2 backend**

> ⚠️ **Known issue on this machine:** Docker Desktop is installed but its engine
> currently fails (`500 Internal Server Error`) because **WSL2 is not installed**.
> Docker Desktop on Windows requires WSL2 to run Linux containers. To fix this,
> run the following in an **elevated (Administrator) PowerShell**, then **restart
> your computer**:
>
> ```powershell
> wsl --install
> ```
>
> After the restart, open Docker Desktop and wait until it shows "Engine running"
> in the bottom-left corner, then continue with the steps below.

## 2. Configure environment variables

```powershell
Copy-Item packages\backend\.env.example packages\backend\.env
```

Edit `packages/backend/.env` and fill in:

- `BREVO_API_KEY` — your Brevo API key
- `BREVO_SENDER_EMAIL` / `BREVO_SENDER_NAME` — the verified sender identity in Brevo

`DATABASE_URL` and `PORT` already match `docker-compose.yml` and don't need changes
for local use.

## 3. Start the database

```powershell
npm run db:up
```

This starts:
- **Postgres** on `localhost:5433` (user `cursor`, password `cursor_local_pw`, db `cursor_credit`)
- **Adminer** (DB browser) at http://localhost:8081 — server `db`, user `cursor`, password `cursor_local_pw`, database `cursor_credit`

Stop it later with `npm run db:down`.

## 4. Install dependencies & create tables

```powershell
npm install
cd packages\backend
npx prisma migrate dev --name init
cd ..\..
```

## 5. Run the app

In two terminals from the repo root:

```powershell
npm run dev:backend
```
```powershell
npm run dev:frontend
```

Open http://localhost:5173.

## How it works

1. **Import tab** — upload the Luma guest export (CSV/XLSX) and your voucher list
   (CSV/XLSX). Column names are matched flexibly (e.g. `email`, `Email Address`,
   `name`, `Full Name`, `code`, `Voucher Code`, `link`, `URL`). If a voucher row
   includes an email that matches an imported guest, it's auto-assigned to them.
   Manual "add one guest" / "add one voucher" forms are also available for last
   minute additions.
2. **Check-In tab** — on arrival, type the guest's email, find them, and press
   **Send Voucher**. If no voucher is assigned yet, the next available one is
   auto-assigned. Pressing the button again (**Resend Voucher**) resends the same
   assigned voucher. A live status badge shows Not sent / Sending / Sent / Failed,
   with the last error message if the send failed.
3. **Guests tab** — full guest list with search and inline send/resend + status,
   useful for reviewing who has/hasn't received their voucher.

Every send attempt is recorded in a `SendLog` table (guest, voucher, status,
Brevo message id or error) so you have an audit trail for the event.

## Security notes

- The vulnerable npm-registry build of `xlsx` (prototype pollution / ReDoS) is
  avoided — the backend uses the patched build distributed directly by SheetJS
  at `cdn.sheetjs.com`, per their own advisory guidance.
- No authentication is included since this is meant to run locally on staff
  laptops for the event only. Do not expose this app to the public internet
  as-is.
