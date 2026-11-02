import { useState, type FormEvent } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { api, getApiError } from "../services/api";
import { getDashboardPath, saveSession } from "../services/auth";
import type { AuthResponse } from "../types/auth";

export default function AcceptInvite() {
  const [params] = useSearchParams();
  const token = params.get("token");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const navigate = useNavigate();

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!token) return;
    setError("");
    setSubmitting(true);
    try {
      const { data } = await api.post<AuthResponse>("/auth/accept-invitation", {
        token,
        password,
      });
      saveSession(data);
      navigate(getDashboardPath(data.user), { replace: true });
    } catch (error) {
      setError(getApiError(error, "Unable to accept invitation."));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form className="auth-form" onSubmit={handleSubmit}>
      <h1>Set your password</h1>
      {!token && (
        <p role="alert">
          Missing invitation token. Open the complete link from your invitation.
        </p>
      )}
      <label>
        New password (8–128 characters)
        <input
          type="password"
          autoComplete="new-password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          minLength={8}
          maxLength={128}
          required
        />
      </label>
      <button type="submit" disabled={!token || submitting}>
        {submitting ? "Activating..." : "Activate Account"}
      </button>
      {error && <p role="alert">{error}</p>}
      <Link to="/login">Back to sign in</Link>
    </form>
  );
}
