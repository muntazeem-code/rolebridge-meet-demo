import { useEffect, useState, type FormEvent } from "react";
import { api, getApiError } from "../services/api";
import type { CompanySubmission, CompanySubmissionPage } from "../types/company";
import CompanyDetails from "./CompanyDetails";

function FeedbackForm({ submission, onSaved }: { submission: CompanySubmission; onSaved: (submission: CompanySubmission) => void }) {
  const [comments, setComments] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function send(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    if (!comments.trim()) { setError("Enter your review comments."); return; }
    setBusy(true);
    setError("");
    try {
      const { data } = await api.patch<{ data: CompanySubmission }>(`/company-submissions/${submission._id}/feedback`, { comments });
      onSaved(data.data);
    } catch (error) {
      setError(getApiError(error, "Unable to send feedback. Refresh to check its status before retrying."));
    } finally { setBusy(false); }
  }

  return (
    <form className="feedback-form" onSubmit={send}>
      <label>Review comments *<textarea required rows={5} maxLength={10000} value={comments} disabled={busy} onChange={(event) => setComments(event.target.value)} placeholder="Review the company, its support needs, and your recommendations." /></label>
      <p>Sending finalizes your review and shares it with the admin and any VPs assigned to this customer.</p>
      <button type="submit" disabled={busy}>{busy ? "Sending..." : "Send feedback"}</button>
      {error && <p role="alert">{error}</p>}
    </form>
  );
}

export default function CompanySubmissions({ scope, refreshKey = 0 }: { scope: "reviewer" | "admin" | "vp"; refreshKey?: number }) {
  const [result, setResult] = useState<CompanySubmissionPage | null>(null);
  const [page, setPage] = useState(1);
  const [reload, setReload] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  useEffect(() => {
    let active = true;
    api.get<CompanySubmissionPage>(`/company-submissions/${scope}`, { params: { page } })
      .then(({ data }) => {
        if (!active) return;
        setResult(data);
        setError("");
        if (page > data.totalPages) setPage(data.totalPages);
      })
      .catch((error: unknown) => { if (active) setError(getApiError(error, "Unable to load company submissions.")); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [scope, page, reload, refreshKey]);

  return (
    <section>
      <div className="section-heading">
        <h2>{scope === "reviewer" ? "Assigned company reviews" : "Company forms & reviewer feedback"}</h2>
        <button type="button" disabled={loading} onClick={() => { setLoading(true); setReload((value) => value + 1); }}>Refresh submissions</button>
      </div>
      <p>{scope === "admin" ? "View submitted company details and reviewer feedback. Use customer assignments to give VPs access." : scope === "vp" ? "View company details and reviewer feedback for customers currently assigned to you." : "Review the company forms automatically assigned to you and send your feedback."}</p>
      {loading && <p role="status">Loading company submissions...</p>}
      {error && <p role="alert">{error}</p>}
      {message && <p role="status">{message}</p>}
      {!loading && !error && (
        <>
          {!result?.data.length && <p>{scope === "reviewer" ? "No company forms are assigned to you yet." : "No company submissions found."}</p>}
          {result?.data.map((submission) => (
            <article className="company-submission" key={submission._id}>
              <CompanyDetails submission={submission} />
              {submission.status === "submitted" && (scope === "reviewer" ? (
                <FeedbackForm submission={submission} onSaved={(saved) => {
                  setResult((previous) => previous ? { ...previous, data: previous.data.map((entry) => entry._id === saved._id ? saved : entry) } : previous);
                  setMessage(`Feedback sent for ${saved.companyName}. The admin and assigned VPs can now view it.`);
                }} />
              ) : <p>Reviewer feedback is pending.</p>)}
            </article>
          ))}
          {result && result.total > 0 && <div className="pagination">
            <button type="button" disabled={page <= 1} onClick={() => { setLoading(true); setPage((value) => value - 1); }}>Previous</button>
            <span>Page {page} of {result.totalPages} ({result.total} submissions)</span>
            <button type="button" disabled={page >= result.totalPages} onClick={() => { setLoading(true); setPage((value) => value + 1); }}>Next</button>
          </div>}
        </>
      )}
    </section>
  );
}
