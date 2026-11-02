# Roles Dashboard backend

Express, MongoDB, JWT role access, Zoom meeting scheduling, and Nodemailer invitations.

## Local setup

Start with the [repository setup guide](../README.md) for prerequisites, cloning,
Windows/macOS/Linux environment-file commands, MongoDB setup, and first login.

From this directory, run `npm ci`, copy `.env.example` to `.env`, and fill in
`JWT_SECRET`, `SEED_ADMIN_EMAIL`, and `SEED_ADMIN_PASSWORD`. Keep the supplied
local `MONGO_URI`, `PORT`, and `CLIENT_URL` defaults, or set your own database URI.
Start MongoDB, run `npm run seed`, then `npm run dev`. The seed creates the five
roles and one admin; it does not create sample users or reset existing accounts.

The API uses port **5001**; the frontend and `CLIENT_URL` use **http://localhost:5174**.
Zoom and SMTP are optional for login and the company review workflow. In development
with SMTP blank, invitation URLs are printed to the backend terminal. Actual meeting
creation requires Zoom, and meeting invitation delivery requires SMTP.

Use `npm run build` to compile to `dist` and `npm start` to run the compiled server.
Run commands here so dotenv loads `backend/.env`. Restart the backend after changing it.

## Company review workflow

Create and activate a Reviewer and Customer from the admin dashboard. The customer
submits one company form with multiple support needs; the server assigns an active
reviewer with the fewest pending reviews. The assigned reviewer submits final feedback.
The admin sees all company forms and reviews. Completed reviews appear automatically
in a shared panelist queue. A VP sees only completed forms and feedback
for customers currently assigned through **Customer access for VPs**. Customers see
their own form and review status, without the internal comments.

See the [company submission contract](docs/company-submissions.md) for endpoint details.

## Meeting workflow

1. In the super-admin dashboard, create and activate Customer, VP, Reviewer, and Panelist accounts.
2. Under **Customer access for VPs**, assign each customer to one or more VPs.
   Existing customers start with no VP access until assigned.
3. Complete the customer's company review. In the VP dashboard, choose **Schedule Meeting**, a reviewed assigned customer, an active panelist, a topic,
   date, time, IANA timezone, and duration (1–1440 minutes).
4. The backend verifies the VP, customer assignment, completed review, and selected panelist. The VP, customer, and panelist must be different accounts.
5. It persists a scheduling request and VP/customer/panelist identity snapshots, creates
   the Zoom meeting, saves its participant link, and invites both customer and panelist.
6. Every dashboard has an upcoming/current and past meeting view scoped to that user.
   The super admin sees all requests, participants, Zoom IDs, email status, and activity logs.
7. If SMTP fails, the meeting stays scheduled. **Retry Email** reuses its Zoom link.
   Only recipients not already accepted by SMTP are retried. A completely sent invitation cannot be sent again through this action.

The full [panelist and meeting history contract](docs/panelist-meetings.md) describes
the shared review queue, panelist selection, time boundaries, and read-only reviewer history.

### Post-call ratings

The original VP and selected panelist each rate a scheduled call once after its
scheduled end. Three integer answers (overall call, venture preparedness, and next
steps clarity) from 1 to 10 produce a server-calculated 1–5 star score. Optional
suggestions are stored separately. Each participant has an independent rating;
missing ratings remain **Not rated**. The admin sees both questionnaires and comments.

`POST /api/meetings/:meetingId/ratings` atomically saves a participant's rating.
`GET /api/meetings/rating-notifications` lists that account's pending reminders.
No email or Zoom request is needed for rating. See the
[rating API contract](docs/meeting-ratings.md) for validation, scoring, and permissions.

### Zoom setup

Use an activated **Server-to-Server OAuth** app:
`ZOOM_ACCOUNT_ID`, `ZOOM_CLIENT_ID`, `ZOOM_CLIENT_SECRET`, and `ZOOM_HOST_EMAIL`.
The host must belong to that Zoom account. Meetings use this configured Zoom host;
the application separately records which VP requested each meeting.

Grant the account-level create-meeting scope `meeting:write:meeting:admin`
(or the applicable classic `meeting:write:admin` scope).
The backend obtains and caches an account-credentials access token and creates
a type-2 scheduled meeting. OAuth tokens and Zoom host `start_url` values are
never returned to the frontend or included in invitations or activity logs.

References:
[Server-to-Server OAuth](https://developers.zoom.us/docs/internal-apps/s2s-oauth/),
[Meetings API](https://developers.zoom.us/docs/api/meetings/).

### Email setup

The meeting invitation uses the same `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`,
`SMTP_PASS`, and `MAIL_FROM` settings as onboarding.
For Gmail, use `smtp.gmail.com`, port 465 (TLS) or 587 (STARTTLS), an app password,
and an authorized sender address. Keep credentials in the backend environment.

Meeting invitations do not report success when SMTP is absent or rejects authentication.
The log records safe error codes such as `EAUTH (SMTP 535)` for diagnosis.
“Accepted by mail server” confirms SMTP acceptance; it does not guarantee inbox delivery.
Fix the SMTP settings, restart the backend after environment changes, then use **Retry Email**.

## Meeting API contract

All endpoints require `Authorization: Bearer <token>` and an active account whose
initial password change has been completed.

| Endpoint                                     | Role                      | Behavior                                                                                                                                        |
| -------------------------------------------- | ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| GET /api/meetings/customers                  | VP                        | Active assigned customers with a completed company review. |
| GET /api/meetings/panelists?customerId=:id    | VP                        | Eligible active panelists for this reviewed, assigned customer. |
| POST /api/meetings                           | VP                        | Create a Zoom meeting for a reviewed assigned customer and selected active panelist. |
| GET /api/meetings?page=1&view=upcoming        | VP                        | Own upcoming/current meetings; view=past lists history. Recent unsuccessful requests accompany upcoming results. |
| GET /api/meetings/panelist?view=past         | Panelist                  | Scheduled calls where this account is the chosen panelist; also supports view=upcoming. |
| GET /api/meetings/reviewer?view=past         | Reviewer                  | Read-only meeting history for this reviewer's company forms, without join links; also supports view=upcoming. |
| GET /api/meetings/mine?page=1&view=upcoming  | Customer                  | Own upcoming/current scheduled meetings, participant links, topic, scheduling VP, timezone, date/time, and duration. Use view=past for history. |
| POST /api/meetings/:id/retry-email           | Creator VP or Super Admin | Retry a failed/unsent invitation for a future scheduled meeting. Current customer access is checked for VP callers.                             |
| GET /api/admin/meetings?page=1               | Super Admin               | All requests, including failed or uncertain requests, creator/customer snapshots, and activity logs.                                            |
| GET /api/admin/customer-access               | Super Admin               | Active customers, active VPs, and current assignments.                                                                                          |
| PATCH /api/admin/customer-access/:customerId | Super Admin               | Replace assignments using `{ "vpIds": ["user-object-id"] }`; use an empty array to revoke all access.                                           |

Meeting creation body:

```json
{
  "customerId": "customer-object-id",
  "panelistId": "panelist-object-id",
  "topic": "Project planning",
  "date": "2030-05-20",
  "time": "14:30",
  "timezone": "Asia/Kolkata",
  "duration": 30,
  "requestId": "a8e946f1-6709-4d80-94c9-e49292685572"
}
```

The date/time are interpreted in the chosen timezone. MongoDB stores a UTC instant
and the selected timezone. Invalid calendar dates, past times, and ambiguous or
nonexistent daylight-saving times are rejected.

Creation returns `201 { success, message, data }` after storing Zoom/email results.
An email failure still returns the stored scheduled meeting with `emailStatus: "failed"`.
List responses include `data`, `page`, `total`, and `totalPages` (25 records per page).
VP responses omit the audit log; admin responses include `logs`.
Customer responses include only meeting details and the participant link. The authenticated
account ID determines which meetings are returned; a customer cannot request another
customer's ID. SMTP errors, internal request IDs, and audit logs are excluded. Customers
can join a scheduled meeting from their dashboard even if its invitation email failed.
A meeting stays in the current view until its scheduled duration has elapsed.
A log entry stores its event, safe message, level, actor identity, and UTC timestamp.

Errors: 400 invalid input, 401 missing/invalid JWT, 403 forbidden access,
404 missing resource, 409 conflicting request/email state, 502 Zoom failure,
and 500/503 persistence or completion failure.

### Retries and audit history

- `requestId` is a client-generated UUID, unique per VP. Repeating the same request
  returns its stored result without creating another Zoom meeting or sending another email.
  A reused ID with different details returns 409. A request still being created returns 202.
- SMTP retries atomically claim the record so concurrent retries cannot send twice.
- A timeout or ambiguous upstream failure is marked **Needs admin review**. Inspect the
  configured host's Zoom account before creating another meeting; the backend deliberately
  does not repeat an uncertain creation request.
- If the process stops during a create/send operation, its persisted state and last log
  show where work stopped. There is no background reconciliation worker: an administrator
  must inspect Zoom/SMTP before resolving a stuck creating/sending record.
- User deletion removes the user, invitations, and customer assignments. Historical meeting
  identity snapshots and logs are retained for the requested administrative audit history.
  Deleting a user does not cancel their existing Zoom meetings.
- SMTP delivery and Zoom creation are external operations; MongoDB does not make these
  operations a single transaction.

## Verification

`npm run build` checks TypeScript and compiles the backend. `npm test` builds and
runs the panelist workflow and rating integration suites. `npm run test:meetings`
runs the scheduling workflow only. After a build, `node --test tests/meeting-ratings.test.mjs`
runs the rating suite without any Zoom/SMTP calls.
Set `MONGO_URI`; tests use a uniquely named database and remove their fixture records.
The real HTTP/authentication/model code, Zoom fetch client, and Nodemailer client
run against local Zoom HTTP and SMTP protocol stand-ins. Tests cover the review
handoff, permissions, panelist selection, attribution, role-scoped history,
in-progress/past boundaries, partial SMTP failures/retries, and Zoom denial/timeouts.
The rating suite additionally checks independent scores, rating boundaries and
validation, duplicate/concurrent writes, reminder pagination and role scope,
detailed feedback visibility, and historical participant eligibility.

The HTTP stand-in models the OAuth and meeting response shapes used by the existing
Zoom client. Postman CLI was unavailable, so these tests run the local stand-ins
directly. Live Zoom account permissions and actual inbox delivery are not verified.
`npm run test:admin` still references an admin-user suite absent from this checkout.

Test overrides `ZOOM_API_BASE_URL`, `ZOOM_TOKEN_URL`, and `ZOOM_TIMEOUT_MS` are backend
settings only. Normal deployments should use the default official Zoom URLs.
