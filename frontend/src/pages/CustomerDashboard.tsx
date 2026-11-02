import { useEffect, useState } from "react";
import { api, getApiError } from "../services/api";
import { meetingTime, type CustomerMeeting } from "../types/meeting";
import CustomerCompanyForm from "../components/CustomerCompanyForm";

interface CustomerMeetingPage {
  data: CustomerMeeting[];
  page: number;
  total: number;
  totalPages: number;
}

export default function CustomerDashboard() {
  const [view, setView] = useState<"upcoming" | "past">("upcoming");
  const [page, setPage] = useState(1);
  const [reload, setReload] = useState(0);
  const [result, setResult] = useState<CustomerMeetingPage | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    api
      .get<CustomerMeetingPage>("/meetings/mine", { params: { page, view } })
      .then(({ data }) => {
        if (active) {
          setResult(data);
          setError("");
        }
      })
      .catch((error: unknown) => {
        if (active)
          setError(getApiError(error, "Unable to load your meetings."));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [page, view, reload]);

  return (
    <>
      <h1>Customer dashboard</h1>
      <CustomerCompanyForm />
      <section>
        <div className="section-heading">
          <h2>Your meetings</h2>
          <button
            type="button"
            disabled={loading}
            onClick={() => {
              setLoading(true);
              setReload((value) => value + 1);
            }}
          >
            {loading ? "Loading..." : "Refresh meetings"}
          </button>
        </div>
        <label>
          Meeting view
          <select
            value={view}
            disabled={loading}
            onChange={(event) => {
              setLoading(true);
              setResult(null);
              setPage(1);
              setView(event.target.value as "upcoming" | "past");
            }}
          >
            <option value="upcoming">Upcoming and current meetings</option>
            <option value="past">Past meetings</option>
          </select>
        </label>
        {loading && <p role="status">Loading your meetings...</p>}
        {error && <p role="alert">{error}</p>}
        {!loading && !error && (
          <>
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Topic</th>
                    <th>Scheduled by</th>
                    <th>Date and time</th>
                    <th>Duration</th>
                    <th>Meeting link</th>
                  </tr>
                </thead>
                <tbody>
                  {result?.data.map((meeting) => (
                    <tr key={meeting._id}>
                      <td>
                        {meeting.topic}
                        {meeting.zoomMeetingId && (
                          <small>Zoom ID: {meeting.zoomMeetingId}</small>
                        )}
                      </td>
                      <td>
                        {meeting.creatorName}
                        <small>{meeting.creatorEmail}</small>
                      </td>
                      <td>
                        {meetingTime(meeting)}
                        <small>{meeting.timezone}</small>
                      </td>
                      <td>{meeting.duration} minutes</td>
                      <td>
                        {meeting.joinUrl ? (
                          <>
                            <a
                              href={meeting.joinUrl}
                              target="_blank"
                              rel="noreferrer"
                            >
                              {view === "past"
                                ? "Meeting link"
                                : "Join meeting"}
                            </a>
                            <small>{meeting.joinUrl}</small>
                          </>
                        ) : (
                          "Joining link unavailable"
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {!result?.data.length && (
              <p>
                {view === "past"
                  ? "No past meetings found."
                  : "No upcoming or current meetings scheduled for you."}
              </p>
            )}
            {result && (
              <div className="pagination">
                <button
                  type="button"
                  disabled={page <= 1}
                  onClick={() => {
                    setLoading(true);
                    setPage((value) => value - 1);
                  }}
                >
                  Previous
                </button>
                <span>
                  Page {result.page} of {result.totalPages} · {result.total}{" "}
                  meetings
                </span>
                <button
                  type="button"
                  disabled={page >= result.totalPages}
                  onClick={() => {
                    setLoading(true);
                    setPage((value) => value + 1);
                  }}
                >
                  Next
                </button>
              </div>
            )}
          </>
        )}
      </section>
    </>
  );
}
