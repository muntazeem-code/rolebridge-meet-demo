import { useState, type FormEvent } from "react";
import { api, getApiError } from "../services/api";
import type {
  AdminRole,
  AdminUser,
  MessageResponse,
  RoleName,
} from "../types/auth";

interface Props {
  user: AdminUser;
  availableRoles: AdminRole[];
  onSaved: (user: AdminUser) => void;
  onDeleted: (user: AdminUser) => void;
  onClose: () => void;
}

export default function UserEditor({
  user,
  availableRoles,
  onSaved,
  onDeleted,
  onClose,
}: Props) {
  const [roles, setRoles] = useState<RoleName[]>(
    user.roles.map((role) => role.name),
  );
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [error, setError] = useState("");

  async function saveRoles(event: FormEvent) {
    event.preventDefault();
    if (busy || confirmDelete) return;
    if (!roles.length) {
      setError("Select at least one role.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const { data } = await api.patch<MessageResponse & { data: AdminUser }>(
        `/admin/users/${user._id}`,
        { roles },
      );
      onSaved(data.data);
    } catch (error) {
      setError(getApiError(error, "Unable to update user roles."));
    } finally {
      setBusy(false);
    }
  }

  async function deleteUser() {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      await api.delete<MessageResponse>(`/admin/users/${user._id}`);
      onDeleted(user);
    } catch (error) {
      setError(getApiError(error, "Unable to delete user."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form
      className="user-editor"
      onSubmit={saveRoles}
      aria-labelledby="edit-user-heading"
    >
      <h3 id="edit-user-heading">Edit {user.fullName}</h3>
      <p>{user.email}</p>
      {confirmDelete ? (
        <>
          <p>
            Permanently delete {user.fullName} ({user.email})? Their account and
            invitations will be removed. This cannot be undone.
          </p>
          <div className="user-actions">
            <button
              type="button"
              className="danger"
              disabled={busy}
              onClick={deleteUser}
            >
              {busy ? "Deleting..." : "Confirm Delete"}
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                setConfirmDelete(false);
                setError("");
              }}
            >
              Cancel deletion
            </button>
          </div>
        </>
      ) : (
        <>
          <fieldset disabled={busy}>
            <legend>Assigned roles</legend>
            {availableRoles.map((role, index) => (
              <label className="choice" key={role.name}>
                <input
                  type="checkbox"
                  autoFocus={index === 0}
                  checked={roles.includes(role.name)}
                  onChange={() =>
                    setRoles((previous) =>
                      previous.includes(role.name)
                        ? previous.filter((name) => name !== role.name)
                        : [...previous, role.name],
                    )
                  }
                />
                {role.label}
              </label>
            ))}
          </fieldset>
          <div className="user-actions">
            <button type="submit" disabled={busy || !roles.length}>
              {busy ? "Saving..." : "Save Roles"}
            </button>
            <button type="button" disabled={busy} onClick={onClose}>
              Cancel
            </button>
            <button
              type="button"
              className="danger"
              disabled={busy}
              onClick={() => {
                setConfirmDelete(true);
                setError("");
              }}
            >
              Delete User
            </button>
          </div>
        </>
      )}
      {error && <p role="alert">{error}</p>}
    </form>
  );
}
