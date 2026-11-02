import { useEffect, useState, type FormEvent } from "react";
import { api, getApiError } from "../services/api";
import {
  supportOptions,
  type CompanyProfile,
  type CompanySubmission,
} from "../types/company";
import CompanyDetails from "./CompanyDetails";

const initial: CompanyProfile = {
  companyName: "",
  description: "",
  supportNeeds: [],
  companyDetails: "",
  industry: "",
  website: "",
  location: "",
  teamSize: "",
};

export default function CustomerCompanyForm() {
  const [profile, setProfile] = useState(initial);
  const [submission, setSubmission] = useState<CompanySubmission | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    let active = true;
    api
      .get<{ data: CompanySubmission | null }>("/company-submissions/mine")
      .then(({ data }) => {
        if (active) {
          setSubmission(data.data);
          setLoadError("");
        }
      })
      .catch((error: unknown) => {
        if (active)
          setLoadError(getApiError(error, "Unable to load your company form."));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [reload]);

  function change(
    field: keyof CompanyProfile,
    value: string | number | undefined,
  ) {
    setProfile((previous) => ({ ...previous, [field]: value }));
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    setError("");
    if (!profile.supportNeeds.length) {
      setError("Select at least one area where you need support.");
      return;
    }
    setBusy(true);
    try {
      const { data } = await api.post<{
        data: CompanySubmission;
        message: string;
      }>("/company-submissions", profile);
      setSubmission(data.data);
      setMessage(data.message);
    } catch (error) {
      setError(getApiError(error, "Unable to submit your company form."));
      // A timed-out or retried request may have saved successfully.
      setLoading(true);
      setReload((value) => value + 1);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section>
      <div className="section-heading">
        <h2>Your company profile</h2>
        <button
          type="button"
          disabled={loading || busy}
          onClick={() => {
            setLoading(true);
            setReload((value) => value + 1);
          }}
        >
          {loading ? "Loading..." : "Refresh company profile"}
        </button>
      </div>
      {message && <p role="status">{message}</p>}
      {loading && <p role="status">Loading your company form...</p>}
      {loadError && <p role="alert">{loadError} Refresh to try again.</p>}
      {error && <p role="alert">{error}</p>}
      {!loading &&
        !loadError &&
        (submission ? (
          <>
            <p>
              Your form has been submitted.{" "}
              {submission.status === "reviewed"
                ? "Your reviewer has completed the review."
                : "Your assigned reviewer will review your company details."}
            </p>
            <CompanyDetails submission={submission} />
          </>
        ) : (
          <form className="company-form" onSubmit={submit}>
            <p>Tell us about your company and the support you need.</p>
            <fieldset className="company-fields" disabled={busy}>
              <legend>Company information</legend>
              <label>
                Company name *
                <input
                  required
                  minLength={2}
                  maxLength={200}
                  value={profile.companyName}
                  onChange={(event) =>
                    change("companyName", event.target.value)
                  }
                />
              </label>
              <label>
                Company description *
                <textarea
                  required
                  rows={4}
                  minLength={10}
                  maxLength={5000}
                  value={profile.description}
                  placeholder="What does your company do? Who do you serve?"
                  onChange={(event) =>
                    change("description", event.target.value)
                  }
                />
              </label>
              <div className="form-columns">
                <label>
                  Industry
                  <input
                    maxLength={100}
                    value={profile.industry}
                    onChange={(event) => change("industry", event.target.value)}
                  />
                </label>
                <label>
                  Location
                  <input
                    maxLength={200}
                    value={profile.location}
                    onChange={(event) => change("location", event.target.value)}
                  />
                </label>
                <label>
                  Team size
                  <input
                    maxLength={100}
                    value={profile.teamSize}
                    placeholder="e.g. 11–50 employees"
                    onChange={(event) => change("teamSize", event.target.value)}
                  />
                </label>
                <label>
                  Year founded
                  <input
                    type="number"
                    min={1800}
                    max={new Date().getFullYear()}
                    value={profile.foundedYear ?? ""}
                    onChange={(event) =>
                      change(
                        "foundedYear",
                        event.target.value
                          ? Number(event.target.value)
                          : undefined,
                      )
                    }
                  />
                </label>
              </div>
              <label>
                Company website
                <input
                  type="url"
                  pattern="https?://.+"
                  maxLength={500}
                  value={profile.website}
                  placeholder="https://example.com"
                  onChange={(event) => change("website", event.target.value)}
                />
              </label>
            </fieldset>
            <fieldset disabled={busy} aria-describedby="support-hint">
              <legend>Where do you need support? *</legend>
              <p id="support-hint">Select all that apply (at least one).</p>
              {supportOptions.map((option) => (
                <label className="choice" key={option.value}>
                  <input
                    type="checkbox"
                    checked={profile.supportNeeds.includes(option.value)}
                    onChange={() =>
                      setProfile((previous) => ({
                        ...previous,
                        supportNeeds: previous.supportNeeds.includes(
                          option.value,
                        )
                          ? previous.supportNeeds.filter(
                              (value) => value !== option.value,
                            )
                          : [...previous.supportNeeds, option.value],
                      }))
                    }
                  />
                  {option.label}
                </label>
              ))}
            </fieldset>
            <label>
              Additional company details *
              <textarea
                required
                disabled={busy}
                rows={7}
                minLength={10}
                maxLength={15000}
                value={profile.companyDetails}
                placeholder="Share your products or services, company stage, customers, current challenges, goals, and the specific help you are looking for."
                onChange={(event) =>
                  change("companyDetails", event.target.value)
                }
              />
            </label>
            <button type="submit" disabled={busy}>
              {busy ? "Submitting..." : "Submit for review"}
            </button>
          </form>
        ))}
    </section>
  );
}
