# Roles Dashboard frontend

React + TypeScript frontend for the Express backend in `../backend`.

## Run locally

Follow the [repository setup guide](../README.md) first to install Node/MongoDB,
configure the backend, and seed the initial admin account.

1. From this directory, run `npm ci`.
2. Copy `.env.example` to `.env` (`Copy-Item .env.example .env` in PowerShell,
   or `cp .env.example .env` in macOS/Linux/Git Bash).
3. Keep `VITE_API_URL=http://localhost:5001/api` for the default local backend.
   Frontend environment values are public; keep all secrets in the backend.
4. Start the backend on port **5001** using `npm run dev` in `backend`.
5. Run `npm run dev` here and open **http://localhost:5174**.
6. Sign in with the admin email and password used by `npm run seed`.

Vite uses port 5174 with `strictPort: true` to match the backend's
`CLIENT_URL=http://localhost:5174`. If that port is occupied, use the
existing frontend server or stop it before starting another.

The API defaults to `http://localhost:5001/api`. To target a different
backend or a local mock, set `VITE_API_URL` in `frontend/.env` before starting or
building Vite, including the `/api` suffix. The backend's `CLIENT_URL` must match
the frontend origin. Restart Vite after changing `.env`; rebuild for deployed changes.

## Backend contract

- Login: `POST /api/auth/login`; the response contains `token` and `user`.
- Session: `GET /api/auth/me`; the response contains `user`.
- Invitation links open `/set-password?token=...`; `/accept-invite` is also supported.
  Activation uses `POST /api/auth/accept-invitation`.
- Password change: `PATCH /api/auth/change-password`; on success the frontend
  fetches `/api/auth/me` to get the updated user.
- Workspaces use `user.roles[].dashboardPath`, `name`, and `label`.
- Admin users and assignable roles load from `GET /api/admin/users` and
  `GET /api/admin/roles`. User creation uses `POST /api/admin/users`.
- Each user row has an Edit action to update assigned roles with
  `PATCH /api/admin/users/:userId` and `{ roles: ["vp", "reviewer"] }`.
  At least one existing role is required; Super Admin assignment is excluded.
  The response includes the updated user in `data`.
- The editor also supports permanent deletion with `DELETE /api/admin/users/:userId`.
  This removes the user and their invitation records. Super Admin accounts are
  protected from editing and deletion in this workflow. Only Super Admin callers
  may use these endpoints; they return 400 for invalid input, 403 for forbidden
  operations, and 404 for missing users. Role changes apply to subsequent API requests.
- The VP dashboard schedules meetings through `POST /api/meetings` and lists
  upcoming meetings from `GET /api/meetings`. The form sends a stable request UUID
  to prevent duplicate Zoom meetings after a request is retried.
- Super Admin can assign customers to VPs under **Customer access for VPs**,
  view meetings and their creators, inspect activity logs, and retry failed invitations.
  Assign a customer before that VP can schedule a meeting. See
  [backend setup and meeting API contract](../backend/README.md) for Zoom/SMTP requirements.
- Customer dashboard uses `GET /api/meetings/mine` to show that customer's own
  upcoming/current meetings and past meetings, with participant links, topic,
  scheduling VP, date/time, timezone, and duration. Joining links remain visible
  when invitation email delivery fails.
- The customer company form submits through `POST /api/company-submissions` and
  loads its saved state through `GET /api/company-submissions/mine`.
- Reviewers load assigned forms through `GET /api/company-submissions/reviewer`
  and finalize comments through `PATCH /api/company-submissions/:submissionId/feedback`.
- Admin and VP submission lists use `GET /api/company-submissions/admin` and
  `GET /api/company-submissions/vp`. VP visibility follows current admin assignments.
- Panelist and Reviewer pages also load the welcome messages returned by
  `GET /api/dashboards/:role`. See the [company submission contract](../backend/docs/company-submissions.md).

Invitation onboarding is selected by default. Direct creation is for development:
the backend assigns `demo1234` and requires a password change. Passwords must
contain 8–128 characters. Email delivery depends on the backend's SMTP configuration.

## Checks

- `npm run build`: TypeScript checks and production bundle.
- `npm run lint`: ESLint checks.
- `npm run preview`: serve an existing production build locally on port 5174.
  Keep the backend running too; this is not a production hosting server.
- Backend test scripts reference `backend/tests/`, which is not included in this
  checkout. See the [root guide](../README.md#build-and-checks) for available checks.

