# Local attendance testing

This setup uses only the local Supabase project in `supabase/config.toml`. The seed contains synthetic users and attendance records; it does not copy production data. Keep it local.

## Start

Prerequisites: Supabase CLI and Docker Desktop with Docker Engine running.

From the repository root, run:

```powershell
.\supabase\start-local.ps1
npm.cmd run dev
```

The script runs `supabase start` and `supabase db reset --local`. That rebuilds the local database from every migration and loads `supabase/seed.sql`. It writes the local URL and anon key to `.env.development.local`, which Vite reads for its default development mode. It never changes `.env.local`. Until the stack starts, the local env file points at localhost with a placeholder key, so development requests fail locally instead of reaching production.

Open the app at `http://localhost:5173` and Supabase Studio at `http://127.0.0.1:54323`.

To stop the local Supabase services, run `supabase stop` from the repository root. To restore the seeded state later, rerun `.\supabase\start-local.ps1`; this resets the local database.

## Demo accounts

All accounts use the local-only password `LocalTest!2026`.

| Role | Email / username | Test focus |
|---|---|---|
| Admin | `admin@example.test` / `local-admin` | Review corrections and shift registrations |
| HR | `hr@example.test` / `local-hr` | Review corrections and shift registrations |
| Manager | `manager@example.test` / `local-manager` | Review attendance corrections |
| Sale employee | `sale@example.test` / `local-sale` | Nearest-shift calculation, multiple approved shifts, repeated punch pairs, submit a correction |
| Night employee | `night@example.test` / `local-night` | Overnight attendance and a pre-seeded pending correction |

The demo accounts are rows in `public.users` for the app's account/password login flow. They are not Supabase Auth users.

## Seeded scenarios

- A Sale attendance row with no row-specific shift and a 05:55 check-in for nearest configured-shift calculation.
- Two approved shifts for the Sale employee today, including one active open punch and one completed record with two in/out pairs.
- A pending shift registration for tomorrow for HR/admin approval.
- A completed overnight record from yesterday and a pending correction request visible to HR, admin, and manager.
- An approved night shift today for trying a fresh overnight check-in.

The seed uses the current date in `Asia/Ho_Chi_Minh`, so rerunning the local reset refreshes the scenarios around the current week.
