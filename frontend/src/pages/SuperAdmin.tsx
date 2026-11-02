import { useEffect, useState, type FormEvent } from "react";
import { api, getApiError } from "../services/api";
import UserEditor from "../components/UserEditor";
import MeetingList from "../components/MeetingList";
import CustomerAssignments from "../components/CustomerAssignments";
import CompanySubmissions from "../components/CompanySubmissions";
import type {
  AdminRole,
  AdminUser,
  MessageResponse,
  RoleName,
} from "../types/auth";

type Method = "direct" | "invite";
type AssignableRole = Exclude<RoleName, "super_admin">;

export default function SuperAdmin() {
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [roles, setRoles] = useState<AssignableRole[]>([]);
  const [availableRoles, setAvailableRoles] = useState<AdminRole[]>([]);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [method, setMethod] = useState<Method>("invite");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [loadError, setLoadError] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [editingUser, setEditingUser] = useState<AdminUser | null>(null);
  const [userMessage, setUserMessage] = useState("");
  const [dataVersion, setDataVersion] = useState(0);

  useEffect(() => {
    let active = true;
    Promise.all([
      api.get<{ success: boolean; data: AdminRole[] }>("/admin/roles"),
      api.get<{ success: boolean; data: AdminUser[] }>("/admin/users"),
    ])
      .then(([roleResponse, userResponse]) => {
        if (!active) return;
        setAvailableRoles(
          roleResponse.data.data.filter((role) => role.name !== "super_admin"),
        );
        setUsers(userResponse.data.data);
      })
      .catch((error: unknown) => {
        if (active)
          setLoadError(getApiError(error, "Unable to load users and roles."));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  function toggleRole(role: AssignableRole) {
    setRoles((previous) =>
      previous.includes(role)
        ? previous.filter((item) => item !== role)
        : [...previous, role],
    );
  }

  async function refreshUsers() {
    try {
      const { data } = await api.get<{ success: boolean; data: AdminUser[] }>(
        "/admin/users",
      );
      setUsers(data.data);
      setDataVersion((value) => value + 1);
      setLoadError("");
    } catch (error) {
      setLoadError(getApiError(error, "Unable to refresh users."));
    }
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setMessage("");
    setError("");
    if (!roles.length) {
      setError("Select at least one role.");
      return;
    }
    setSubmitting(true);
    try {
      const { data } = await api.post<MessageResponse>("/admin/users", {
        fullName: fullName.trim(),
        email: email.trim(),
        roles,
        method,
      });
      setMessage(data.message);
      setFullName("");
      setEmail("");
      setRoles([]);
    } catch (error) {
      setError(getApiError(error, "Unable to create user."));
    } finally {
      // An email failure can still leave a pending user in the backend.
      await refreshUsers();
      setSubmitting(false);
    }
  }

  return (
    <>
      <form onSubmit={handleSubmit}>
        <h1>Create user</h1>
        <label>
          Full name
          <input
            value={fullName}
            minLength={2}
            onChange={(event) => setFullName(event.target.value)}
            required
          />
        </label>
        <label>
          Email address
          <input
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            required
          />
        </label>
        <fieldset disabled={loading || submitting || !!loadError}>
          <legend>Assign roles</legend>
          {availableRoles.map(
            (role) =>
              role.name !== "super_admin" && (
                <label className="choice" key={role.name}>
                  <input
                    type="checkbox"
                    checked={roles.includes(role.name)}
                    onChange={() => toggleRole(role.name as AssignableRole)}
                  />
                  {role.label}
                </label>
              ),
          )}
          {!loading && !loadError && !availableRoles.length && (
            <p>No assignable roles are available.</p>
          )}
        </fieldset>
        <fieldset disabled={submitting}>
          <legend>Onboarding method</legend>
          <label className="choice">
            <input
              type="radio"
              name="method"
              checked={method === "direct"}
              onChange={() => setMethod("direct")}
            />
            Direct creation (temporary password)
          </label>
          <label className="choice">
            <input
              type="radio"
              name="method"
              checked={method === "invite"}
              onChange={() => setMethod("invite")}
            />
            Send invitation email
          </label>
          {method === "direct" && (
            <p>
              Development only. The temporary password is demo1234; the user
              must change it at first login.
            </p>
          )}
        </fieldset>
        <button
          type="submit"
          disabled={
            loading || submitting || !!loadError || !availableRoles.length
          }
        >
          {submitting
            ? "Please wait..."
            : method === "direct"
              ? "Create User"
              : "Send Invitation"}
        </button>
        {message && <p role="status">{message}</p>}
        {error && <p role="alert">{error}</p>}
      </form>
      <section>
        <h2>Users</h2>
        {userMessage && <p role="status">{userMessage}</p>}
        {loading && <p role="status">Loading users and roles...</p>}
        {loadError && (
          <p role="alert">
            {loadError}{" "}
            <button type="button" onClick={() => window.location.reload()}>
              Retry
            </button>
          </p>
        )}
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Name</th>
                <th>Email</th>
                <th>Roles</th>
                <th>Status</th>
                <th>Edit</th>
              </tr>
            </thead>
            <tbody>
              {users.map((user) => (
                <tr key={user._id}>
                  <td>{user.fullName}</td>
                  <td>{user.email}</td>
                  <td>{user.roles.map((role) => role.label).join(", ")}</td>
                  <td>
                    {user.status}
                    {user.mustChangePassword
                      ? " (password change required)"
                      : ""}
                  </td>
                  <td>
                    <button
                      type="button"
                      aria-label={`Edit ${user.fullName}`}
                      disabled={
                        loading ||
                        submitting ||
                        !!loadError ||
                        !!editingUser ||
                        user.roles.some((role) => role.name === "super_admin")
                      }
                      title={
                        user.roles.some((role) => role.name === "super_admin")
                          ? "Super Admin accounts are managed separately"
                          : undefined
                      }
                      onClick={() => {
                        setEditingUser(user);
                        setUserMessage("");
                      }}
                    >
                      Edit
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!loading && !loadError && !users.length && <p>No users found.</p>}
        {editingUser && (
          <UserEditor
            key={editingUser._id}
            user={editingUser}
            availableRoles={availableRoles}
            onClose={() => setEditingUser(null)}
            onSaved={(updatedUser) => {
              setUsers((previous) =>
                previous.map((user) =>
                  user._id === updatedUser._id ? updatedUser : user,
                ),
              );
              setEditingUser(null);
              setUserMessage(`Roles updated for ${updatedUser.fullName}.`);
              setDataVersion((value) => value + 1);
            }}
            onDeleted={(deletedUser) => {
              setUsers((previous) =>
                previous.filter((user) => user._id !== deletedUser._id),
              );
              setEditingUser(null);
              setUserMessage(
                `${deletedUser.fullName} was deleted permanently.`,
              );
              setDataVersion((value) => value + 1);
            }}
          />
        )}
      </section>
      <CustomerAssignments refreshKey={dataVersion} />
      <CompanySubmissions scope="admin" refreshKey={dataVersion} />
      <MeetingList admin />
    </>
  );
}
