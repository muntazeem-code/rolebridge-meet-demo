import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api, getApiError } from "../services/api";
import { getDashboardPath, saveSession } from "../services/auth";
import type { AuthResponse } from "../types/auth";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const navigate = useNavigate();

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      const { data } = await api.post<AuthResponse>("/auth/login", {
        email: email.trim(),
        password,
      });
      saveSession(data);
      navigate(getDashboardPath(data.user), { replace: true });
    } catch (error) {
      setError(getApiError(error, "Unable to sign in."));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form className="auth-form" onSubmit={handleSubmit}>
      <div className="space-y-2">
        <h1 className="m-0">Sign in</h1>
        <p className="m-0">Access your workspace and manage your account.</p>
      </div>
      <label>
        Email
        <input
          type="email"
          value={email}
          autoComplete="username"
          onChange={(event) => setEmail(event.target.value)}
          required
        />
      </label>
      <label>
        Password
        <input
          type="password"
          value={password}
          autoComplete="current-password"
          onChange={(event) => setPassword(event.target.value)}
          required
        />
      </label>
      <button type="submit" disabled={submitting}>
        {submitting ? "Signing in..." : "Login"}
      </button>
      {error && <p role="alert">{error}</p>}
      <div className="flex flex-col gap-2 pt-3 border-t border-slate-100 text-center text-xs">
        <span className="text-slate-500">New venture or founder?</span>
        <Link
          to="/apply"
          className="font-semibold text-indigo-600 hover:text-indigo-800"
        >
          Apply to Program &rarr;
        </Link>
      </div>
    </form>
  );
}
