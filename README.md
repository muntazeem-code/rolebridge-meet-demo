# RoleBridge - Roles Dashboard

A role-based company support and meeting dashboard built with React, TypeScript, Express, MongoDB, and JWT authentication.

- **Super Admin:** create users, assign roles and customers to VPs, and view company submissions, reviewer feedback, and meeting history.
- **Customer:** submit a company profile with multiple support needs and view meeting links.
- **Reviewer:** review automatically assigned company forms and send feedback.
- **VP:** view assigned customers' forms and feedback, and schedule Zoom meetings.
- **Panelist:** access the panelist workspace.

## Prerequisites

Install these before continuing:

| Tool | Requirement |
| --- | --- |
| [Git](https://git-scm.com/downloads) | Used to clone the repository. |
| [Node.js](https://nodejs.org/en/download) | Use **24.x**, with npm included. The current dependencies require Node 20.19+ on the 20.x line, or 22.12+ on newer lines; older versions can fail during install or build. |
| [MongoDB Community Server](https://www.mongodb.com/try/download/community) or [MongoDB Atlas](https://www.mongodb.com/atlas) | A running database is required. MongoDB Compass is an optional client, not the database server. |

Check Git and Node in a new terminal after installation:

```sh
git --version
node --version
npm --version
```

SMTP credentials are optional for a local demo. Zoom credentials are required only for scheduling real meetings. You can try login, company submission, reviews, and VP assignments without either integration.

## 1. Clone the repository

```sh
git clone https://github.com/muntazeem-code/rolebridge-meet-demo.git
cd rolebridge-meet-demo
```

The backend and frontend are separate npm projects. There is no root `npm install` or `npm run dev` command.

```text
rolebridge-meet-demo/
  backend/                 Express API, MongoDB models, and seed script
    .env.example           Backend configuration template
    docs/                  Company submission API documentation
  frontend/                React application built with Vite
    .env.example           Public API URL configuration
  README.md                Start here
```

## 2. Install dependencies

Run from the cloned repository root:

```sh
cd backend
npm ci
cd ../frontend
npm ci
cd ..
```

`npm ci` installs the versions recorded in each committed `package-lock.json`. Install development dependencies too: TypeScript, tsx, and Vite are needed to run or build the project. If you intentionally change a dependency, use `npm install` in that package and commit its updated lockfile.

## 3. Create the environment files

From the repository root, copy both templates using the commands for your terminal.

**Windows PowerShell:**

```powershell
Copy-Item backend/.env.example backend/.env
Copy-Item frontend/.env.example frontend/.env
```

**macOS / Linux / Git Bash:**

```sh
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env
```

Do this once on a fresh clone. Copying again replaces your existing local configuration. Edit the resulting `.env` files in your editor; do not rename or edit only the examples.

### Backend configuration

In `backend/.env`, keep the local defaults and fill in the required credentials:

| Variable | Local value or purpose |
| --- | --- |
| `NODE_ENV` | `development` for a local demo. |
| `PORT` | `5001`, the backend port. |
| `MONGO_URI` | `mongodb://127.0.0.1:27017/roles_dashboard`, or your own Atlas connection string with a database name. |
| `JWT_SECRET` | Required. Generate your own random secret using the command below. |
| `CLIENT_URL` | `http://localhost:5174`, the exact frontend origin, without a trailing slash. Also used in invitation links. |
| `SEED_ADMIN_EMAIL` | The email you will use for the first admin login, for example `admin@example.com`. |
| `SEED_ADMIN_PASSWORD` | Required for seeding. Choose your own password, between 8 and 128 characters. |

Generate a JWT secret and paste the output as the value of `JWT_SECRET`:

```sh
node -e "console.log(require('node:crypto').randomBytes(48).toString('hex'))"
```

Do not include the variable name twice. For example, the line should be `JWT_SECRET=<generated-value>`. Quote environment values containing spaces or `#`, such as `SEED_ADMIN_PASSWORD="your chosen password"`.

### Frontend configuration

`frontend/.env` needs only:

```dotenv
VITE_API_URL=http://localhost:5001/api
```

Keep the `/api` suffix. Variables prefixed with `VITE_` are included in the browser bundle: never put MongoDB credentials, JWT secrets, SMTP passwords, or Zoom secrets here. The application does not read a shared `.env` in the repository root.

## 4. Start MongoDB and seed the admin

For a local database, start MongoDB Community Server. If installed as a Windows service, check that the **MongoDB** service is running. For Atlas, create a database user, allow your development machine's IP in network access, and set `MONGO_URI` to that connection string. Replace all placeholders and URL-encode special characters in its username/password.

Run from the repository root:

```sh
cd backend
npm run seed
```

Expected output includes `MongoDB connected`, `Roles seeded successfully`, and `Initial Super Admin created` on the first run. This creates the five roles and the admin account from your seed environment values. MongoDB creates the database/collections as data is written; no SQL migrations or manual tables are required.

You can rerun the seed to update the role definitions. If an account with the seed email already exists, the script leaves it unchanged; changing `SEED_ADMIN_PASSWORD` and rerunning does **not** reset that account's password or change its roles. The seed creates only the initial admin, not sample customers, reviewers, or VPs.

## 5. Start the backend and frontend

Keep two terminals running. Commands below start from the repository root in each terminal.

**Terminal 1 - backend:**

```sh
cd backend
npm run dev
```

The backend should report `MongoDB connected` and `Server running on port 5001`. Open [http://localhost:5001](http://localhost:5001) to check for a JSON response with `success: true`.

**Terminal 2 - frontend:**

```sh
cd frontend
npm run dev
```

Open [http://localhost:5174](http://localhost:5174) and sign in using your `SEED_ADMIN_EMAIL` and `SEED_ADMIN_PASSWORD`. Keep both terminals open; use `Ctrl+C` in each to stop the servers. Restart a server after editing its `.env` file.

## 6. Try the complete workflow

1. Sign in as the seeded Super Admin. Create separate **Reviewer**, **Customer**, and **VP** accounts, each with a unique email. An account can also have multiple roles.
2. For a quick local demo, choose **Direct creation (temporary password)**. These users initially sign in with `demo1234` and must change their password before using their dashboards. Direct creation is disabled when `NODE_ENV=production`.
3. Alternatively, use **Send invitation email**. With SMTP configured, the user receives a link to set a password. In development with SMTP left blank, the backend prints `DEV invitation URL:` in Terminal 1; open that link to activate the test account. Links expire after 24 hours and work once.
4. Make sure the reviewer account is active, then sign in as the customer and submit the company profile. Select one or more of the six support options. Each customer can submit one form; submitted details cannot be edited. The form is automatically assigned to an active reviewer with the fewest pending reviews. If no reviewer is available, nothing is submitted and the customer can retry after one is activated.
5. Sign in as the assigned reviewer, open the assigned company form, add comments, and choose **Send feedback**. Sending finalizes the review.
6. Return to the admin dashboard and refresh submissions to see the form and feedback. Under **Customer access for VPs**, assign that customer to the VP and save.
7. Sign in as the VP and refresh submissions. The VP can now see that customer's company form and feedback. Revoking the assignment removes access on subsequent requests.

Use separate browser profiles/private windows to check several accounts at once, or sign out between accounts. Use each section's **Refresh** button to pick up changes made in another session. Customers see their submission and review status; reviewer comments are visible to the admin, assigned reviewer, and assigned VPs.

## Optional: email and Zoom meetings

### SMTP email

Set `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, and `MAIL_FROM` in `backend/.env`, then restart the backend. Use the SMTP details supplied by your email provider. This implementation requires authenticated SMTP. Port `465` selects TLS; port `587` uses the normal STARTTLS setup. The sender must be authorized by your provider.

Development invitation links can be used without SMTP as described above. **Meeting invitation emails require SMTP even in development**; they do not use the console-link fallback. If delivery fails after a Zoom meeting was created, fix the SMTP settings and use **Retry Email** on that meeting.

### Zoom

Scheduling real meetings requires an activated Zoom Server-to-Server OAuth app with permission to create meetings for the configured host. Set `ZOOM_ACCOUNT_ID`, `ZOOM_CLIENT_ID`, `ZOOM_CLIENT_SECRET`, and `ZOOM_HOST_EMAIL` in `backend/.env`, then restart the backend. The host must belong to the configured Zoom account.

See [backend integration notes](backend/README.md#zoom-setup) for the existing scope and API details. Normal use does not require changing the optional Zoom endpoint overrides in the template. Assign the customer to the VP before attempting to schedule a meeting. The customer can join from their dashboard even if email delivery fails.

## Build and checks

Run these from the repository root to check both packages:

```sh
cd backend
npm run build
cd ../frontend
npm run build
npm run lint
```

The backend build goes to `backend/dist`; the frontend build goes to `frontend/dist`. To run the compiled backend, use `npm start` from `backend`. To preview the frontend build locally, use `npm run preview` from `frontend` and open port 5174. `preview` is a local check, not a production hosting server. The backend still needs MongoDB and its environment configuration.

**Test availability:** `backend/package.json` defines `test`, `test:admin`, and `test:meetings`, but the corresponding `backend/tests/` files are not included in this checkout. Those commands cannot run the integration suites until the test files are added. Use the builds and frontend lint above for the checks currently available.

## Troubleshooting

| Problem | What to check |
| --- | --- |
| `node` / `npm` is not recognized | Install Node.js with npm, then reopen the terminal so PATH is refreshed. |
| PowerShell blocks `npm.ps1` | Use `npm.cmd` in place of `npm`, or run the commands in Command Prompt. |
| Unsupported engine or Vite build error | Check `node --version`; use Node 24.x and reinstall dependencies with `npm ci` in each package. |
| `npm ci` reports a lockfile mismatch | Check that `package.json` and `package-lock.json` are from the same revision. For an intentional dependency change, regenerate the lockfile with `npm install` and commit both files. |
| `mongo URI is missing` / seed credentials missing | Create `backend/.env`, fill the required values, and run backend commands from the `backend` directory. |
| MongoDB connection refused / server selection timeout | Start the database server, check the host/port in `MONGO_URI`, or verify Atlas IP access and database-user credentials. |
| Login fails | Run the seed against the same database used by the backend, then use the seed email/password. An existing seed user is not reset by reseeding. |
| Account inactive / password change required | Complete invitation activation or change the temporary password before opening a workspace. |
| Frontend cannot reach the API / CORS error | Check that the backend is running, `VITE_API_URL` ends in `/api`, and `CLIENT_URL` exactly matches the frontend origin. Use `localhost` consistently rather than mixing it with `127.0.0.1`. Restart both servers after changes. |
| Port 5001 or 5174 is already in use | Stop the other server. Vite uses `strictPort`, so it will not silently select a different port. If you change the API port, update `VITE_API_URL`; if you change Vite's port, also update `CLIENT_URL`. |
| No active reviewer available | Create/activate a reviewer account before submitting a company profile. |
| VP sees no customer form | Save the customer-to-VP assignment in the admin dashboard, ensure the customer has submitted a form, then refresh the VP section. |
| Invitation not received | With SMTP blank in development, use the terminal's `DEV invitation URL`. With SMTP configured, check the credentials/sender and delivery logs; there is no console fallback after a configured SMTP send fails. |
| Zoom is not configured / authorization fails | Fill all four Zoom credentials and check app activation, host membership, and create-meeting permissions. |

## Configuration and sharing

Commit the `.env.example` templates so other developers can create their own environment files. Actual `.env` files, `node_modules`, and `dist` are ignored by Git. Each developer should use their own database and credentials. Never commit or paste real secrets into the README or frontend variables.

For a hosted deployment, set the real frontend origin in `CLIENT_URL`, build the frontend with the deployed API URL in `VITE_API_URL`, configure SPA fallback routing to `index.html`, and run the backend with `NODE_ENV=production` and real SMTP settings for invitations. Configure HTTPS and secrets through the hosting environment. There is no deployment automation included in this repository.

More details: [backend notes](backend/README.md), [frontend notes](frontend/README.md), and [company submission API contract](backend/docs/company-submissions.md).
