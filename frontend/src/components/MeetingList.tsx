import { useEffect, useState } from "react";
import { api, getApiError } from "../services/api";
import { meetingTime, meetingPhase, type Meeting, type MeetingPage, type MeetingView } from "../types/meeting";

const statuses = {
  creating: "Creating",
  scheduled: "Scheduled",
  failed: "Failed",
  needs_review: "Needs admin review",
};
const emailStatuses = {
  not_sent: "Not sent",
  sending: "Sending",
  sent: "Accepted by mail server",
  failed: "Failed",
};
export default function MeetingList({
  admin = false,
  refreshKey = 0,
  scope = "vp",
}: {
  admin?: boolean;
  refreshKey?: number;
  scope?: "vp" | "customer" | "panelist" | "reviewer";
}) {
  const [result, setResult] = useState<MeetingPage | null>(null);
  const [page, setPage] = useState(1);
  const [view, setView] = useState<MeetingView>(admin ? "all" : "upcoming");
  const [reload, setReload] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [retrying, setRetrying] = useState("");
  const [checkedAt, setCheckedAt] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => {
      setCheckedAt(Date.now());
      setReload((value) => value + 1);
    }, 60000);
    return () => clearInterval(timer);
  }, []);
  useEffect(() => {
    let active = true;
    api
      .get<MeetingPage>(admin ? "/admin/meetings" : scope === "vp" ? "/meetings" : scope === "customer" ? "/meetings/mine" : `/meetings/${scope}`, {
        params: { page, view },
      })
      .then(({ data }) => {
        if (active) {
          setResult(data);
          setCheckedAt(Date.now());
          setError("");
          if (page > data.totalPages) setPage(data.totalPages);
        }
      })
      .catch((error: unknown) => {
        if (active) setError(getApiError(error, "Unable to load meetings."));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [admin, scope, page, view, reload, refreshKey]);

  async function retryEmail(meeting: { _id: string }) {
    setRetrying(meeting._id);
    setError("");
    setMessage("");
    try {
      const { data } = await api.post<{
        success: boolean;
        message: string;
        data: Meeting;
      }>(`/meetings/${meeting._id}/retry-email`, {}, { timeout: 60000 });
      setResult((previous) =>
        previous
          ? {
              ...previous,
              data: previous.data.map((item) =>
                item._id === data.data._id ? data.data : item,
              ),
            }
          : previous,
      );
      setMessage(data.message);
    } catch (error) {
      setError(getApiError(error, "Unable to retry invitation."));
    } finally {
      setRetrying("");
    }
  }
  const refresh = () => {
    setLoading(true);
    setReload((value) => value + 1);
  };
  const rows = result?.data ?? [];
  const readOnly = !admin && scope !== "vp";
  const showCreator = admin || scope !== "vp";
  const requests = !admin && scope === "vp" && view === "upcoming" ? (result?.requests ?? []) : [];
  return (
    <section>
      <div className="section-heading">
        <h2>{admin ? "Meetings and activity logs" : "Your meetings"}</h2>
        <button
          type="button"
          disabled={loading || !!retrying}
          onClick={refresh}
        >
          {loading ? "Loading..." : "Refresh meetings"}
        </button>
      </div>
      {admin && (
        <p>View the VP, customer, selected panelist, and each meeting's Zoom and email activity.</p>
      )}
      {scope === "reviewer" && !admin && <p>Meeting history for the company forms assigned to you. This is a read-only oversight view.</p>}
      <label className="mb-4 max-w-sm">
        Meeting view
        <select value={view} disabled={loading || !!retrying} onChange={(event) => {
          setLoading(true);
          setResult(null);
          setPage(1);
          setView(event.target.value as MeetingView);
        }}>
          {admin && <option value="all">All meetings and requests</option>}
          <option value="upcoming">Upcoming and current meetings</option>
          <option value="past">Past meetings</option>
        </select>
      </label>
      {loading && <p role="status">Loading meetings...</p>}
      {error && <p role="alert">{error}</p>}
      {message && <p role="status">{message}</p>}
      {!loading && !error && <>
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>Topic</th>
              <th>Customer</th>
              <th>Panelist</th>
              {showCreator && <th>Scheduled by</th>}
              <th>Meeting time</th>
              <th>Duration</th>
              <th>Status</th>
              {!readOnly && <th>Invitations</th>}
              <th>Actions</th>
              {admin && <th>Logs</th>}
            </tr>
          </thead>
          <tbody>
            {rows.map((meeting) => (
              <tr key={meeting._id}>
                <td>
                  {meeting.topic}
                  {meeting.zoomMeetingId && (
                    <small>Zoom ID: {meeting.zoomMeetingId}</small>
                  )}
                </td>
                <td>
                  {meeting.customerName}
                  <small>{meeting.customerEmail}</small>
                </td>
                <td>
                  {meeting.panelistName ?? "Not assigned (older meeting)"}
                  {meeting.panelistEmail && <small>{meeting.panelistEmail}</small>}
                </td>
                {showCreator && (
                  <td>
                    {meeting.creatorName}
                    <small>{meeting.creatorEmail}</small>
                    <small>
                      Created {new Date(meeting.createdAt).toLocaleString()}
                    </small>
                  </td>
                )}
                <td>
                  {meetingTime(meeting)}
                  <small>{meeting.timezone}</small>
                </td>
                <td>{meeting.duration} min</td>
                <td>{meetingPhase(meeting, checkedAt) ?? statuses[meeting.status]}</td>
                {!readOnly && <td>
                  {emailStatuses[meeting.emailStatus ?? "not_sent"]}
                  {meeting.emailError && (
                    <small className="error-text">{meeting.emailError}</small>
                  )}
                </td>}
                <td>
                  <div className="user-actions">
                    {meeting.status === "scheduled" && meeting.joinUrl && (
                      <a
                        href={meeting.joinUrl}
                        target="_blank"
                        rel="noreferrer"
                      >
                        {meetingPhase(meeting, checkedAt) === "Past" ? "Meeting link" : "Join meeting"}
                      </a>
                    )}
                    {!readOnly && meeting.status === "scheduled" &&
                      ["failed", "not_sent"].includes(meeting.emailStatus ?? "not_sent") &&
                      new Date(meeting.startTime).getTime() > checkedAt && (
                        <button
                          type="button"
                          disabled={!!retrying}
                          onClick={() => retryEmail(meeting)}
                        >
                          {retrying === meeting._id
                            ? "Sending..."
                            : "Retry Email"}
                        </button>
                      )}
                    {scope === "reviewer" && !admin && <span className="text-xs text-slate-500">Read-only</span>}
                  </div>
                </td>
                {admin && (
                  <td>
                    <details>
                      <summary>View logs ({meeting.logs?.length ?? 0})</summary>
                      <ol className="meeting-logs">
                        {meeting.logs?.map((entry) => (
                          <li key={entry._id}>
                            <strong>{entry.event.replaceAll("_", " ")}</strong>
                            <small>
                              {new Date(entry.at).toLocaleString()} ·{" "}
                              {entry.actorName} ({entry.actorEmail})
                            </small>
                            <p
                              className={
                                entry.level === "error" ? "error-text" : ""
                              }
                            >
                              {entry.message}
                            </p>
                          </li>
                        ))}
                      </ol>
                    </details>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!loading && !error && !rows.length && (
        <p>
          {view === "past" ? "No past meetings found." : view === "all" ? "No meetings have been requested." : "No upcoming or current meetings found."}
        </p>
      )}
      {!!requests.length && (
        <div className="scheduling-requests">
          <h3>Scheduling requests</h3>
          <ul>
            {requests.map((meeting) => (
              <li key={meeting._id}>
                {meeting.topic} · {meetingTime(meeting)} ({meeting.timezone}) ·{" "}
                {statuses[meeting.status]}
              </li>
            ))}
          </ul>
          {requests.some(
            (meeting) =>
              meeting.status === "needs_review" ||
              meeting.status === "creating",
          ) && (
            <p>
              For requests still creating or needing review, contact the super
              admin before creating another meeting.
            </p>
          )}
        </div>
      )}
      {result && (
        <div className="pagination">
          <button
            type="button"
            disabled={page <= 1 || loading || !!retrying}
            onClick={() => {
              setLoading(true);
              setPage((value) => value - 1);
            }}
          >
            Previous
          </button>
          <span>
            Page {result.page} of {result.totalPages} · {result.total} records
          </span>
          <button
            type="button"
            disabled={page >= result.totalPages || loading || !!retrying}
            onClick={() => {
              setLoading(true);
              setPage((value) => value + 1);
            }}
          >
            Next
          </button>
        </div>
      )}
      </>}
    </section>
  );
}
