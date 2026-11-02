import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { X } from "lucide-react";
import { api, getApiError } from "../services/api";
import { announceRating } from "../services/meeting-ratings";
import {
  meetingTime,
  type MeetingDetails,
  type RatingRole,
  type RatingSubmission,
} from "../types/meeting";
import StarRating from "./StarRating";

const questions = [
  { key: "overallCall", label: "1. How would you rate the overall call?" },
  {
    key: "venturePreparedness",
    label: "2. How prepared was the venture for the call?",
  },
  {
    key: "nextStepsClarity",
    label: "3. How clear are the next steps before the next call?",
  },
] as const;
type Scores = Record<(typeof questions)[number]["key"], number | null>;
type RatingMeeting = Pick<
  MeetingDetails,
  "_id" | "topic" | "customerName" | "startTime" | "timezone"
>;

export default function MeetingRatingDialog({
  meeting,
  role,
  onClose,
}: {
  meeting: RatingMeeting;
  role: RatingRole;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const id = useId();
  const [scores, setScores] = useState<Scores>({
    overallCall: null,
    venturePreparedness: null,
    nextStepsClarity: null,
  });
  const [improvement, setImprovement] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const complete = Object.values(scores).every((score) => score !== null);
  const stars = complete
    ? Math.round(
        Math.max(
          1,
          ((scores.overallCall ?? 0) +
            (scores.venturePreparedness ?? 0) +
            (scores.nextStepsClarity ?? 0)) /
            6,
        ) * 10,
      ) / 10
    : null;

  useEffect(() => {
    const element = dialog.current;
    element?.showModal();
    return () => element?.close();
  }, []);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    if (!complete) {
      setError("Select a score for each of the three questions.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const { data } = await api.post<{ data: RatingSubmission }>(
        `/meetings/${meeting._id}/ratings`,
        {
          role,
          ...scores,
          improvement,
        },
      );
      announceRating(data.data);
      onClose();
    } catch (error) {
      setError(
        getApiError(
          error,
          "Unable to save your rating. Refresh the meeting before trying again.",
        ),
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <dialog
      ref={dialog}
      aria-labelledby={`${id}-title`}
      aria-describedby={`${id}-description`}
      onCancel={(event) => {
        event.preventDefault();
        if (!busy) onClose();
      }}
      className="fixed inset-0 m-auto max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-2xl overflow-y-auto rounded-2xl border border-slate-200 bg-white p-0 text-slate-900 shadow-xl backdrop:bg-slate-900/50"
    >
      <form
        onSubmit={submit}
        className="m-0 gap-6 rounded-none border-0 p-5 shadow-none sm:p-7"
      >
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <h2 id={`${id}-title`} className="m-0">
              Rate meeting as {role === "vp" ? "VP" : "Panelist"}
            </h2>
            <p id={`${id}-description`} className="mb-0 break-words">
              {meeting.topic} · {meeting.customerName}
            </p>
            <small>
              {meetingTime(meeting)} ({meeting.timezone})
            </small>
          </div>
          <button
            type="button"
            className="button-secondary size-10 min-h-10 shrink-0 p-2"
            aria-label="Close rating form"
            disabled={busy}
            onClick={onClose}
          >
            <X className="size-5" aria-hidden="true" />
          </button>
        </div>
        <p className="m-0 text-xs text-slate-500">
          Select one number for each question. 1 is lowest and 10 is highest.
        </p>
        {questions.map((question) => (
          <fieldset
            key={question.key}
            disabled={busy}
            className="block space-y-3 border-0 p-0"
          >
            <legend className="mb-3 p-0">
              {question.label} <span aria-hidden="true">*</span>
            </legend>
            <div className="grid grid-cols-5 gap-2 sm:grid-cols-10">
              {Array.from({ length: 10 }, (_, index) => index + 1).map(
                (score) => (
                  <label key={score} className="relative cursor-pointer">
                    <input
                      type="radio"
                      className="peer sr-only"
                      required
                      name={`${id}-${question.key}`}
                      value={score}
                      checked={scores[question.key] === score}
                      onChange={() =>
                        setScores((previous) => ({
                          ...previous,
                          [question.key]: score,
                        }))
                      }
                    />
                    <span className="flex min-h-11 items-center justify-center rounded-lg border border-slate-300 bg-white text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50 peer-checked:border-indigo-600 peer-checked:bg-indigo-600 peer-checked:text-white peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-indigo-500 peer-disabled:opacity-60">
                      {score}
                    </span>
                  </label>
                ),
              )}
            </div>
          </fieldset>
        ))}
        <label>
          What would make your next meeting better? (Optional)
          <textarea
            rows={4}
            maxLength={5000}
            value={improvement}
            disabled={busy}
            onChange={(event) => setImprovement(event.target.value)}
            placeholder="Share suggestions for the next call."
          />
        </label>
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
          <h3 className="mb-2 text-sm">Overall call rating</h3>
          {stars === null ? (
            <span className="text-sm text-slate-500">
              Answer all three questions to see your star rating.
            </span>
          ) : (
            <StarRating value={stars} />
          )}
          <p className="mb-0 text-xs">
            The average of your three scores is divided by 2, with a minimum of
            1 and maximum of 5 stars. Submitted ratings are final.
          </p>
        </div>
        {error && <p role="alert">{error}</p>}
        <div className="user-actions">
          <button type="submit" disabled={busy || !complete}>
            {busy ? "Submitting..." : "Submit rating"}
          </button>
          <button
            type="button"
            className="button-secondary"
            disabled={busy}
            onClick={onClose}
          >
            Cancel
          </button>
        </div>
      </form>
    </dialog>
  );
}
