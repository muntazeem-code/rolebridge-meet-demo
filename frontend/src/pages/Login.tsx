import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
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
      <h1>Sign in</h1>
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
    </form>
  );
}
