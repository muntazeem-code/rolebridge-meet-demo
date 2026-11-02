# Company submission workflow

All paths are under `/api/company-submissions`, require a bearer token for an active user, and enforce the named role and completion of any mandatory password change. JSON responses contain `success` and either `data` or an error `message`.

## Customer

- `GET /mine` (customer): returns `data: CompanySubmission | null`. Reviewer comments and review timestamp are internal and excluded from this response.
- `POST /` (customer): submits one immutable company profile per customer. Required fields: `companyName` (2–200 trimmed characters), `description` (10–5000), `companyDetails` (10–15000), `supportNeeds` (1–6 distinct values from `strategy`, `finance`, `marketing_sales`, `operations`, `technology`, `people_hr`). Optional trimmed fields: `industry` (100), `website` (an HTTP/HTTPS URL, 500), `location` (200), `teamSize` (100), `foundedYear` (integer 1800–current year). Optional text fields may be empty. Unknown fields are rejected.
- Success: `201`, with the saved profile and `status: submitted`. The server derives the customer from the session and assigns an active reviewer other than the customer, choosing the fewest pending reviews, then oldest account and ID for ties. Concurrent submissions may select the same reviewer; the assignment is persisted with the profile. Reviewers cannot be supplied by the caller.
- `409`: this customer already submitted, including concurrent/retried submissions. `503`: no eligible active reviewer; nothing is saved and the customer can retry. `400`: invalid input.

## Review and visibility

- `GET /reviewer` (reviewer): only profiles assigned to this reviewer.
- `GET /admin` (super_admin): all profiles and submitted reviewer feedback.
- `GET /vp` (vp): only profiles for customers currently assigned to the requesting VP using the existing CustomerAccess records. Revoking access removes visibility on the next request.
- List endpoints accept `page` (default 1) and `limit` (default 10, maximum 50), returning `data: CompanySubmission[]`, `page`, `total`, and `totalPages` (at least 1). Profiles are sorted newest first. Invalid pagination returns `400`.
- `PATCH /:submissionId/feedback` (reviewer): body `{ "comments": "..." }`, 1–10000 trimmed characters, no unknown fields. Only the assigned reviewer may finalize feedback. The atomic update records `reviewerComments`, `reviewedAt`, and `status: reviewed` and returns `200` with the profile. `400` for invalid ID/body; `404` for unknown/unassigned profile; `409` if already reviewed. Submitted feedback is immutable.

`CompanySubmission` includes `_id`, `customer` and `reviewer` (populated `_id`, `fullName`, `email`, or null if the account was deleted), the company fields above, `status`, `createdAt`, `updatedAt`, and internal `reviewerComments`/`reviewedAt`. Historical forms survive account removal. Unauthenticated requests return `401`; inactive accounts, missing roles, and required password changes return `403`.

## Local verification

Run `npm run build` from `backend` to check TypeScript. The previously referenced `tests/company-submissions.test.mjs` is not included in this checkout. Until the integration suite is added, use the [manual workflow](../../README.md#6-try-the-complete-workflow) to verify customer submission, reviewer feedback, admin visibility, and VP assignment/revocation.
