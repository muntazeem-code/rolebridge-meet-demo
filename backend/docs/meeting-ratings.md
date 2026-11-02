# Post-call ratings and reminders

The VP who scheduled a call and its selected panelist each submit one independent rating. Eligibility starts when a scheduled meeting's start time plus duration is at or before the server's current time, consistent with the past-meeting view. This is scheduled-time eligibility, not Zoom attendance confirmation. Historical ownership remains valid after customer reassignment. A current active VP/panelist role and completion of mandatory password changes are still required.

## Submit a rating

`POST /api/meetings/:meetingId/ratings`, bearer authentication, role VP or Panelist.

```json
{
  "role": "vp",
  "overallCall": 8,
  "venturePreparedness": 6,
  "nextStepsClarity": 10,
  "improvement": "Share an agenda before the next call."
}
```

`role` is `vp` or `panelist` and must match a current role of the caller. The account must be the meeting's creator for VP or selected panelist for Panelist. All three answers are required integers 1–10. `improvement` is optional, trimmed, at most 5000 characters. Extra fields, including caller-supplied stars or identity, are rejected.

Stars are calculated by the server: `round(max(1, (overallCall + venturePreparedness + nextStepsClarity) / 6) * 10) / 10`. Thus 8/6/10 yields 4.0/5, all tens yield 5.0/5, and all ones yield 1.0/5. The optional comment does not affect stars.

Success: `201 { success: true, message, data: { meetingId, role, rating } }`. `rating` contains the three answers, trimmed optional `improvement`, `stars`, `submittedBy`, and `submittedAt`. The record is persisted as `vpRating` or `panelistRating` on the meeting. Missing values represent **Not rated** independently; no migration is needed. Submission also appends an admin audit log. Ratings are final and atomic: concurrent submissions for one role produce one success and one 409; independent VP and panelist submissions do not overwrite each other.

Errors: 400 invalid ID/body; 401 unauthenticated; 403 inactive account, missing/currently removed role, or required password change; 404 unknown meeting or caller is not that role's participant; 409 already rated, call not over, or meeting is not scheduled. Admin status alone does not permit rating on someone's behalf.

## Rating reminders

`GET /api/meetings/rating-notifications?page=1&limit=10`, VP/Panelist only. Page is integer 1–100000; limit is integer 1–25. Unknown parameters return 400.

Returns `{ success, data, page, total, totalPages }`. Entries contain `meetingId`, `role`, `topic`, `customerName`, `startTime`, `timezone`, and `duration`. A reminder exists only for an ended scheduled meeting that this account participated in under a current role and has not rated for that role. Dual-role users see all their outstanding roles together, ordered by most recent meeting first. Counts include all pages. Legacy meetings without a selected panelist create no panelist reminder. Reminders are derived from persisted ratings, survive refresh/sign-in, and disappear after the corresponding submission; reading a reminder does not dismiss it.

The frontend bell beside Sign out polls every minute and refreshes on focus, opening, and rating submission. It opens the same questionnaire as the **Rate meeting** button below a past meeting. Notifications do not send email or invoke Zoom.

## Visibility

All existing role-scoped meeting lists return separate VP and panelist rating summaries, displaying stars or **Not rated**. Admin, creator VP, and selected panelist can also see questionnaire answers and comments on the meetings they can already access. Customer and reviewer lists include only each rating's stars and submission timestamp. No new access to other users' meetings is granted.

## Verify locally

From `backend`, `npm test` builds and runs the suites. `node --test tests/meeting-ratings.test.mjs` runs only the rating suite after a build, with `MONGO_URI` configured. It uses an isolated database with fixture users and real HTTP/authentication/MongoDB, without Zoom or SMTP calls.
