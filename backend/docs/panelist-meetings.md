# Panelist handoff and meeting history

This extends the company submission contract and existing meeting API. All endpoints require an active account, the indicated role, and completion of any mandatory password change.

## Review handoff

Finalizing reviewer feedback keeps `status: reviewed` and immediately makes the form and feedback available through `GET /api/company-submissions/panelist` to the panelist role. This is a shared queue of completed reviews, not an automatic assignment to an individual panelist. Pending reviews are excluded. `GET /api/company-submissions/vp` now also excludes pending reviews and still requires current customer-to-VP assignment. The admin continues to see every submission and reviewer attribution.

## Scheduling

- `GET /api/meetings/customers` (VP): active assigned customers whose company form is reviewed.
- `GET /api/meetings/panelists?customerId=<id>` (VP): active panelists eligible for this reviewed, assigned customer. Excludes the scheduling VP and customer. Invalid input returns 400; an unassigned customer returns 403; a missing/pending company review returns 409.
- `POST /api/meetings` (VP): the existing scheduling body now requires `panelistId` as well as `customerId`, `topic`, `date`, `time`, `timezone`, `duration`, and UUID `requestId`. Only active panelists can be selected; the VP, panelist, and customer must be different accounts. Invalid IDs return 400, an unassigned customer returns 403, and a pending review returns 409. Checks occur before any Zoom request.
- The meeting stores the chosen panelist ID/name/email and company submission ID alongside existing customer/VP identity snapshots. Older meetings without a panelist stay readable; no backfill is required. Retries with the same UUID and a different panelist return 409. Replaying an existing request never creates a second Zoom meeting.
- SMTP invites both the customer and selected panelist using the participant link. Accepted recipient addresses are recorded. A retry sends only to recipients not already accepted, without creating another Zoom meeting. A disabled/deleted/non-panelist selected account prevents a retry; admin and creator VP remain the only roles allowed to retry. SMTP acceptance does not establish inbox delivery.

Example scheduling body:

```json
{
  "customerId": "customer-object-id",
  "panelistId": "panelist-object-id",
  "topic": "Company support discussion",
  "date": "2030-05-20",
  "time": "14:30",
  "timezone": "Asia/Kolkata",
  "duration": 30,
  "requestId": "a8e946f1-6709-4d80-94c9-e49292685572"
}
```

## Upcoming and past meetings

All lists accept `page` (integer 1–100000, 25 items per page) and `view=upcoming|past`. Admin additionally accepts `view=all` (its default); other roles default to upcoming. Unknown parameters and invalid pagination/views return 400. Responses contain `success`, `data`, `page`, `total`, and `totalPages`.

Past means the scheduled start plus duration is at or before the server's current time. A meeting in progress stays in upcoming until that time. This is a time-based view, not a Zoom attendance or actual completion confirmation. Upcoming sorts earliest first; past sorts most recent start first. Failed/uncertain requests do not count as past meetings.

| Endpoint | Scope |
| --- | --- |
| `GET /api/admin/meetings` | Super Admin: all meetings and activity logs; all/upcoming/past filters. |
| `GET /api/meetings` | VP: meetings this VP created; non-scheduled recent requests are included separately in the upcoming view. |
| `GET /api/meetings/mine` | Customer: only this customer's scheduled meetings. |
| `GET /api/meetings/panelist` | Panelist: only meetings where this account is the selected panelist. |
| `GET /api/meetings/reviewer` | Reviewer: scheduled meetings for company forms assigned to this reviewer. This read-only oversight view excludes join links. |

Customer/panelist/reviewer responses exclude internal request IDs, email error details, recipient tracking, and logs. Panelist and customer responses include the participant link and VP/customer/panelist names. Ratings remain outside this update.
