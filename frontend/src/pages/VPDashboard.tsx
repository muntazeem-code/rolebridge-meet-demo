import { useEffect, useState, type FormEvent } from "react";
import { isAxiosError } from "axios";
import { api, getApiError } from "../services/api";
import MeetingList from "../components/MeetingList";
import CompanySubmissions from "../components/CompanySubmissions";
import type { CustomerOption, Meeting } from "../types/meeting";

const localZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
const timezones = [
  ...new Set([
    "Asia/Kolkata",
    "UTC",
    localZone,
    ...Intl.supportedValuesOf("timeZone"),
  ]),
];
export default function VPDashboard() {
  const [customers, setCustomers] = useState<CustomerOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [customerError, setCustomerError] = useState("");
  const [open, setOpen] = useState(false);
  const [customerId, setCustomerId] = useState("");
  const [panelistId, setPanelistId] = useState("");
  const [panelists, setPanelists] = useState<CustomerOption[]>([]);
  const [panelistError, setPanelistError] = useState("");
  const [panelistsLoading, setPanelistsLoading] = useState(false);
  const [topic, setTopic] = useState("");
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [timezone, setTimezone] = useState(localZone || "Asia/Kolkata");
  const [duration, setDuration] = useState(30);
  const [requestId, setRequestId] = useState(() => crypto.randomUUID());
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);
  useEffect(() => {
    let active = true;
    api
      .get<{ data: CustomerOption[] }>("/meetings/customers")
      .then(({ data }) => {
        if (active) {
          setCustomers(data.data);
          setCustomerError("");
        }
      })
      .catch((error: unknown) => {
        if (active)
          setCustomerError(
            getApiError(error, "Unable to load assigned customers."),
          );
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [refreshKey]);
  useEffect(() => {
    if (!customerId) return;
    let active = true;
    api.get<{ data: CustomerOption[] }>("/meetings/panelists", { params: { customerId } })
      .then(({ data }) => { if (active) { setPanelists(data.data); setPanelistError(""); } })
      .catch((error: unknown) => {
        if (active) { setPanelists([]); setPanelistError(getApiError(error, "Unable to load active panelists.")); }
      })
      .finally(() => { if (active) setPanelistsLoading(false); });
    return () => { active = false; };
  }, [customerId, refreshKey]);
  async function schedule(event: FormEvent) {
    event.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    setError("");
    setMessage("");
    try {
      const { data } = await api.post<{
        success: boolean;
        message: string;
        data: Meeting;
      }>(
        "/meetings",
        {
          customerId,
          panelistId,
          topic: topic.trim(),
          date,
          time,
          timezone,
          duration,
          requestId,
        },
        { timeout: 60000 },
      );
      setMessage(data.message);
      setRefreshKey((value) => value + 1);
      if (data.data.status === "scheduled") {
        setOpen(false);
        setTopic("");
        setDate("");
        setTime("");
        setPanelistId("");
        setRequestId(crypto.randomUUID());
      }
    } catch (error) {
      setError(
        getApiError(
          error,
          "Unable to schedule. Refresh meetings before trying again.",
        ),
      );
      setRefreshKey((value) => value + 1);
      if (
        isAxiosError(error) &&
        error.response?.data?.data?.status === "failed"
      )
        setRequestId(crypto.randomUUID());
    } finally {
      setSubmitting(false);
    }
  }
  return (
    <>
      <section>
        <div className="section-heading">
          <h1>VP dashboard</h1>
          <button
            type="button"
            disabled={
              loading || submitting || !!customerError || !customers.length
            }
            onClick={() => setOpen((value) => !value)}
          >
            Schedule Meeting
          </button>
        </div>
        {loading && <p role="status">Loading assigned customers...</p>}
        {customerError && <p role="alert">{customerError}</p>}
        {!loading && !customerError && !customers.length && (
          <p>
            No reviewed customers are ready for scheduling. The admin must assign
            the customer to you, and the reviewer must complete the company review first.
          </p>
        )}
        <button
          type="button"
          disabled={submitting}
          onClick={() => setRefreshKey((value) => value + 1)}
        >
          Refresh customers
        </button>
        {message && <p role="status">{message}</p>}
        {error && <p role="alert">{error}</p>}
        {open && (
          <form className="meeting-form" onSubmit={schedule}>
          <h2>Schedule a customer and panelist call</h2>
            <label>
              Customer
              <select
                value={customerId}
                disabled={submitting}
                onChange={(event) => {
                  setCustomerId(event.target.value);
                  setPanelistId("");
                  setPanelists([]);
                  setPanelistError("");
                  setPanelistsLoading(true);
                }}
                required
              >
                <option value="" disabled>
                  Select a reviewed, assigned customer
                </option>
                {customers.map((customer) => (
                  <option key={customer._id} value={customer._id}>
                    {customer.fullName} ({customer.email})
                  </option>
                ))}
              </select>
            </label>
            <label>
              Panelist
              <select value={panelistId} disabled={submitting || !customerId || panelistsLoading || !!panelistError} required onChange={(event) => setPanelistId(event.target.value)}>
                <option value="" disabled>{panelistsLoading ? "Loading panelists..." : "Select an active panelist"}</option>
                {panelists.map((panelist) => <option key={panelist._id} value={panelist._id}>{panelist.fullName} ({panelist.email})</option>)}
              </select>
            </label>
            {panelistError && <p role="alert">{panelistError}</p>}
            {customerId && !panelistsLoading && !panelistError && !panelists.length && <p>No active panelists are available. Ask the admin to create or activate a panelist.</p>}
            <label>
              Topic
              <input
                value={topic}
                minLength={2}
                maxLength={200}
                disabled={submitting}
                onChange={(event) => setTopic(event.target.value)}
                required
              />
            </label>
            <div className="form-columns">
              <label>
                Date
                <input
                  type="date"
                  value={date}
                  disabled={submitting}
                  onChange={(event) => setDate(event.target.value)}
                  required
                />
              </label>
              <label>
                Time
                <input
                  type="time"
                  value={time}
                  disabled={submitting}
                  onChange={(event) => setTime(event.target.value)}
                  required
                />
              </label>
            </div>
            <label>
              Timezone
              <select
                value={timezone}
                disabled={submitting}
                onChange={(event) => setTimezone(event.target.value)}
                required
              >
                {timezones.map((zone) => (
                  <option key={zone} value={zone}>
                    {zone}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Duration (minutes)
              <input
                type="number"
                min={1}
                max={1440}
                value={duration}
                disabled={submitting}
                onChange={(event) => setDuration(Number(event.target.value))}
                required
              />
            </label>
            <div className="user-actions">
              <button type="submit" disabled={submitting || panelistsLoading || !customers.some((customer) => customer._id === customerId) || !panelists.some((panelist) => panelist._id === panelistId)}>
                {submitting ? "Scheduling..." : "Create Zoom Meeting"}
              </button>
              <button
                type="button"
                disabled={submitting}
                onClick={() => setOpen(false)}
              >
                Cancel
              </button>
            </div>
          </form>
        )}
      </section>
      <MeetingList refreshKey={refreshKey} />
      <CompanySubmissions scope="vp" refreshKey={refreshKey} />
    </>
  );
}
