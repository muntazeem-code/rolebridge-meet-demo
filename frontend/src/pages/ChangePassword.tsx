import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { api, getApiError } from "../services/api";
import { getDashboardPath } from "../services/auth";
import type { CurrentUserResponse, MessageResponse } from "../types/auth";

export default function ChangePassword() {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [updated, setUpdated] = useState(false);
  const navigate = useNavigate();

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setMessage("");
    setSubmitting(true);
    try {
      // The PATCH response contains a message, so fetch the updated profile separately.
      if (!updated) {
        await api.patch<MessageResponse>("/auth/change-password", {
          currentPassword,
          newPassword,
        });
        setUpdated(true);
        setCurrentPassword("");
        setNewPassword("");
      }
      const { data } = await api.get<CurrentUserResponse>("/auth/me");
      navigate(getDashboardPath(data.user), { replace: true });
    } catch (error) {
      setMessage(getApiError(error, "Unable to change password."));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form className="auth-form" onSubmit={handleSubmit}>
      <h1>Change temporary password</h1>
      {updated ? (
        <p>Your password was updated. Continue to your workspace.</p>
      ) : (
        <>
          <label>
            Current password
            <input
              type="password"
              autoComplete="current-password"
              value={currentPassword}
              onChange={(event) => setCurrentPassword(event.target.value)}
              required
            />
          </label>
          <label>
            New password (8–128 characters)
            <input
              type="password"
              autoComplete="new-password"
              value={newPassword}
              onChange={(event) => setNewPassword(event.target.value)}
              minLength={8}
              maxLength={128}
              required
            />
          </label>
        </>
      )}
      <button type="submit" disabled={submitting}>
        {submitting
          ? "Please wait..."
          : updated
            ? "Continue to workspace"
            : "Update Password"}
      </button>
      {message && <p role="alert">{message}</p>}
    </form>
  );
}
