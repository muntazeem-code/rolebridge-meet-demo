import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { CheckCircle2, ArrowRight } from "lucide-react";
import { api, getApiError } from "../services/api";
import { supportOptions, type CompanyProfile } from "../types/company";

interface ApplicationFormState extends CompanyProfile {
  fullName: string;
  email: string;
}

const initial: ApplicationFormState = {
  fullName: "",
  email: "",
  companyName: "",
  description: "",
  supportNeeds: [],
  companyDetails: "",
  industry: "",
  website: "",
  location: "",
  teamSize: "",
  foundedYear: undefined,
};

export default function ProgramApplicationForm({
  onCancel,
}: {
  onCancel?: () => void;
}) {
  const [form, setForm] = useState<ApplicationFormState>(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [submittedEmail, setSubmittedEmail] = useState("");
  const [invitationUrl, setInvitationUrl] = useState<string | undefined>(undefined);
  const [success, setSuccess] = useState(false);

  function change<K extends keyof ApplicationFormState>(
    field: K,
    value: ApplicationFormState[K],
  ) {
    setForm((previous) => ({ ...previous, [field]: value }));
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    setError("");

    if (!form.fullName.trim() || form.fullName.trim().length < 2) {
      setError("Please provide your full name (at least 2 characters).");
      return;
    }

    if (!form.email.trim()) {
      setError("Please provide a valid email address.");
      return;
    }

    if (!form.supportNeeds.length) {
      setError("Select at least one area where you need support.");
      return;
    }

    setBusy(true);
    try {
      const payload = {
        fullName: form.fullName.trim(),
        email: form.email.trim().toLowerCase(),
        companyName: form.companyName.trim(),
        description: form.description.trim(),
        supportNeeds: form.supportNeeds,
        companyDetails: form.companyDetails.trim(),
        industry: form.industry?.trim() || undefined,
        location: form.location?.trim() || undefined,
        teamSize: form.teamSize?.trim() || undefined,
        foundedYear: form.foundedYear ? Number(form.foundedYear) : undefined,
        website: form.website?.trim() || undefined,
      };

      const { data } = await api.post<{
        success: boolean;
        message: string;
        data: {
          id: string;
          email: string;
          invitationUrl?: string;
        };
      }>("/company-submissions/apply", payload);

      setSubmittedEmail(form.email.trim());
      setInvitationUrl(data.data?.invitationUrl);
      setSuccess(true);
    } catch (err) {
      setError(
        getApiError(
          err,
          "Unable to submit your application. Please check your details and try again.",
        ),
      );
    } finally {
      setBusy(false);
    }
  }

  if (success) {
    return (
      <section className="mx-auto max-w-2xl text-center">
        <div className="mx-auto mb-4 flex size-14 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
          <CheckCircle2 className="size-8" />
        </div>
        <h2>Application Submitted Successfully!</h2>
        <p className="text-base text-slate-700">
          Thank you for applying to the program. An invitation email has been
          sent to <strong>{submittedEmail}</strong>.
        </p>
        <p className="text-sm text-slate-500">
          Open the link in your email to set your password and access your
          customer dashboard. Your company details will be ready in your
          dashboard automatically.
        </p>

        {invitationUrl && (
          <div className="my-4 rounded-lg border border-indigo-200 bg-indigo-50/70 p-4 text-left text-xs text-indigo-900">
            <span className="font-semibold block mb-1">
              Development Quick Link:
            </span>
            <a
              href={invitationUrl}
              className="text-indigo-600 underline break-all font-mono"
            >
              {invitationUrl}
            </a>
          </div>
        )}

        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <Link
            to="/login"
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-indigo-600 px-6 py-2.5 text-sm font-medium text-white hover:bg-indigo-700"
          >
            Go to Login <ArrowRight className="size-4" />
          </Link>
          <button
            type="button"
            className="button-secondary"
            onClick={() => {
              setForm(initial);
              setSuccess(false);
              setInvitationUrl(undefined);
            }}
          >
            Submit Another Application
          </button>
        </div>
      </section>
    );
  }

  return (
    <section className="mx-auto max-w-3xl">
      <div className="section-heading border-b border-slate-100 pb-4">
        <div>
          <h2>Apply to Program</h2>
          <p className="m-0 text-slate-500">
            Fill in your details and company profile. After submitting, you will
            receive an invitation email to activate your account and access your
            dashboard.
          </p>
        </div>
        {onCancel && (
          <button
            type="button"
            className="button-secondary text-xs"
            onClick={onCancel}
          >
            &larr; Back
          </button>
        )}
      </div>

      {error && <p role="alert">{error}</p>}

      <form className="company-form" onSubmit={submit}>
        {/* Applicant Information */}
        <fieldset className="company-fields" disabled={busy}>
          <legend>Your Contact Information</legend>
          <div className="form-columns w-full">
            <label>
              Full name *
              <input
                required
                minLength={2}
                maxLength={100}
                placeholder="e.g. Jane Doe"
                value={form.fullName}
                onChange={(event) => change("fullName", event.target.value)}
              />
            </label>
            <label>
              Email address *
              <input
                type="email"
                required
                maxLength={150}
                placeholder="jane@company.com"
                value={form.email}
                onChange={(event) => change("email", event.target.value)}
              />
            </label>
          </div>
        </fieldset>

        {/* Company Information */}
        <fieldset className="company-fields" disabled={busy}>
          <legend>Company Information</legend>
          <label className="w-full">
            Company name *
            <input
              required
              minLength={2}
              maxLength={200}
              placeholder="e.g. Acme Innovations"
              value={form.companyName}
              onChange={(event) => change("companyName", event.target.value)}
            />
          </label>
          <label className="w-full">
            Company description *
            <textarea
              required
              rows={4}
              minLength={10}
              maxLength={5000}
              placeholder="What does your company do? Who do you serve?"
              value={form.description}
              onChange={(event) => change("description", event.target.value)}
            />
          </label>
          <div className="form-columns w-full">
            <label>
              Industry
              <input
                maxLength={100}
                placeholder="e.g. Fintech, Healthcare, AI"
                value={form.industry || ""}
                onChange={(event) => change("industry", event.target.value)}
              />
            </label>
            <label>
              Location
              <input
                maxLength={200}
                placeholder="e.g. San Francisco, CA"
                value={form.location || ""}
                onChange={(event) => change("location", event.target.value)}
              />
            </label>
            <label>
              Team size
              <input
                maxLength={100}
                placeholder="e.g. 11–50 employees"
                value={form.teamSize || ""}
                onChange={(event) => change("teamSize", event.target.value)}
              />
            </label>
            <label>
              Year founded
              <input
                type="number"
                min={1800}
                max={new Date().getFullYear()}
                placeholder="e.g. 2023"
                value={form.foundedYear ?? ""}
                onChange={(event) =>
                  change(
                    "foundedYear",
                    event.target.value ? Number(event.target.value) : undefined,
                  )
                }
              />
            </label>
          </div>
          <label className="w-full">
            Company website
            <input
              type="url"
              pattern="https?://.+"
              maxLength={500}
              placeholder="https://example.com"
              value={form.website || ""}
              onChange={(event) => change("website", event.target.value)}
            />
          </label>
        </fieldset>

        {/* Support Needs */}
        <fieldset disabled={busy} aria-describedby="support-needs-hint">
          <legend>Where do you need support? *</legend>
          <p id="support-needs-hint" className="basis-full">
            Select all areas where you are looking for assistance (at least one).
          </p>
          {supportOptions.map((option) => (
            <label className="choice" key={option.value}>
              <input
                type="checkbox"
                checked={form.supportNeeds.includes(option.value)}
                onChange={() =>
                  setForm((previous) => ({
                    ...previous,
                    supportNeeds: previous.supportNeeds.includes(option.value)
                      ? previous.supportNeeds.filter(
                          (val) => val !== option.value,
                        )
                      : [...previous.supportNeeds, option.value],
                  }))
                }
              />
              {option.label}
            </label>
          ))}
        </fieldset>

        {/* Additional Company Details */}
        <label>
          Additional company details *
          <textarea
            required
            disabled={busy}
            rows={6}
            minLength={10}
            maxLength={15000}
            placeholder="Share your products or services, company stage, customers, current challenges, goals, and the specific help you are looking for."
            value={form.companyDetails}
            onChange={(event) => change("companyDetails", event.target.value)}
          />
        </label>

        <div className="user-actions justify-end pt-2">
          {onCancel && (
            <button
              type="button"
              disabled={busy}
              className="button-secondary"
              onClick={onCancel}
            >
              Cancel
            </button>
          )}
          <button type="submit" disabled={busy}>
            {busy ? "Submitting Application..." : "Submit Application & Get Invitation"}
          </button>
        </div>
      </form>
    </section>
  );
}
