import { useEffect, useId, useRef, useState } from "react";
import { Bell, X } from "lucide-react";
import { api, getApiError } from "../services/api";
import { RATING_SUBMITTED_EVENT } from "../services/meeting-ratings";
import {
  meetingTime,
  type RatingNotification,
  type RatingNotificationPage,
} from "../types/meeting";
import MeetingRatingDialog from "./MeetingRatingDialog";

export default function RatingNotifications() {
  const id = useId();
  const container = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [result, setResult] = useState<RatingNotificationPage | null>(null);
  const [page, setPage] = useState(1);
  const [reload, setReload] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selected, setSelected] = useState<RatingNotification | null>(null);

  useEffect(() => {
    const refresh = () => setReload((value) => value + 1);
    const timer = window.setInterval(refresh, 60000);
    window.addEventListener("focus", refresh);
    window.addEventListener(RATING_SUBMITTED_EVENT, refresh);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", refresh);
      window.removeEventListener(RATING_SUBMITTED_EVENT, refresh);
    };
  }, []);

  useEffect(() => {
    let active = true;
    api
      .get<RatingNotificationPage>("/meetings/rating-notifications", {
        params: { page, limit: 5 },
      })
      .then(({ data }) => {
        if (!active) return;
        setResult(data);
        setError("");
        if (page > data.totalPages) setPage(data.totalPages);
      })
      .catch((error: unknown) => {
        if (active)
          setError(getApiError(error, "Unable to load rating reminders."));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [page, reload]);

  useEffect(() => {
    if (!open) return;
    const dismissOutside = (event: PointerEvent) => {
      if (
        event.target instanceof Node &&
        !container.current?.contains(event.target)
      )
        setOpen(false);
    };
    const dismissEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", dismissOutside);
    document.addEventListener("keydown", dismissEscape);
    return () => {
      document.removeEventListener("pointerdown", dismissOutside);
      document.removeEventListener("keydown", dismissEscape);
    };
  }, [open]);

  const count = result?.total ?? 0;
  return (
    <div className="relative self-end" ref={container}>
      <button
        type="button"
        className="button-secondary relative size-11 p-2"
        aria-label={
          error
            ? "Rating notifications unavailable. Open to retry."
            : `Rating notifications, ${count} pending`
        }
        aria-expanded={open}
        aria-controls={id}
        onClick={() => {
          setOpen((value) => !value);
          if (!open) {
            setLoading(true);
            setReload((value) => value + 1);
          }
        }}
      >
        <Bell className="size-5" aria-hidden="true" />
        {count > 0 && (
          <span
            aria-hidden="true"
            className="absolute -top-1.5 -right-1.5 flex min-w-5 items-center justify-center rounded-full bg-rose-600 px-1 text-[10px] leading-5 font-bold text-white"
          >
            {count > 99 ? "99+" : count}
          </span>
        )}
        {error && (
          <span
            aria-hidden="true"
            className="absolute -top-1 -right-1 rounded-full bg-amber-500 px-1.5 text-xs text-white"
          >
            !
          </span>
        )}
      </button>
      {open && (
        <div
          id={id}
          role="region"
          aria-label="Pending meeting ratings"
          className="fixed inset-x-4 top-44 z-40 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl sm:absolute sm:inset-x-auto sm:top-full sm:right-0 sm:mt-3 sm:w-96"
        >
          <div className="flex items-center justify-between gap-3 border-b border-slate-100 p-4">
            <div>
              <h2 className="m-0 text-base">Rating reminders</h2>
              <p className="m-0 text-xs">
                {count} meeting rating{count === 1 ? "" : "s"} pending
              </p>
            </div>
            <button
              type="button"
              className="button-secondary size-9 min-h-9 p-1"
              aria-label="Close notifications"
              onClick={() => setOpen(false)}
            >
              <X className="size-4" aria-hidden="true" />
            </button>
          </div>
          <div
            className="max-h-[55dvh] overflow-y-auto p-3"
            aria-busy={loading}
          >
            {loading && <p role="status">Loading rating reminders...</p>}
            {error && (
              <p role="alert">
                {error}{" "}
                <button
                  type="button"
                  className="button-secondary mt-2"
                  onClick={() => {
                    setLoading(true);
                    setReload((value) => value + 1);
                  }}
                >
                  Retry
                </button>
              </p>
            )}
            {!loading &&
              !error &&
              (result?.data.length ? (
                <ul className="space-y-2">
                  {result.data.map((notification) => (
                    <li key={`${notification.meetingId}-${notification.role}`}>
                      <button
                        type="button"
                        className="flex w-full flex-col items-start gap-1 rounded-lg border border-slate-200 bg-white p-3 text-left text-slate-700 hover:bg-slate-50"
                        onClick={() => {
                          setSelected(notification);
                          setOpen(false);
                        }}
                      >
                        <span className="text-xs font-semibold text-indigo-700">
                          Rate as{" "}
                          {notification.role === "vp" ? "VP" : "Panelist"}
                        </span>
                        <span className="w-full break-words font-semibold">
                          {notification.topic}
                        </span>
                        <span className="w-full break-words text-xs font-normal text-slate-500">
                          {notification.customerName} ·{" "}
                          {meetingTime(notification)}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="m-2">You have no pending meeting ratings.</p>
              ))}
          </div>
          {!loading && !error && result && result.totalPages > 1 && (
            <div className="flex items-center justify-between gap-2 border-t border-slate-100 p-3">
              <button
                type="button"
                className="button-secondary px-3 text-xs"
                disabled={page <= 1}
                onClick={() => {
                  setLoading(true);
                  setPage((value) => value - 1);
                }}
              >
                Previous
              </button>
              <span className="text-xs text-slate-500">
                {page} / {result.totalPages}
              </span>
              <button
                type="button"
                className="button-secondary px-3 text-xs"
                disabled={page >= result.totalPages}
                onClick={() => {
                  setLoading(true);
                  setPage((value) => value + 1);
                }}
              >
                Next
              </button>
            </div>
          )}
        </div>
      )}
      {selected && (
        <MeetingRatingDialog
          meeting={{
            _id: selected.meetingId,
            topic: selected.topic,
            customerName: selected.customerName,
            startTime: selected.startTime,
            timezone: selected.timezone,
          }}
          role={selected.role}
          onClose={() => setSelected(null)}
        />
      )}
    </div>
  );
}
