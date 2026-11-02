import { useState } from "react";
import {
  meetingPhase,
  type MeetingDetails,
  type MeetingRating,
  type RatingRole,
} from "../types/meeting";
import MeetingRatingDialog from "./MeetingRatingDialog";
import StarRating from "./StarRating";

function RatingSummary({
  label,
  rating,
}: {
  label: string;
  rating?: MeetingRating;
}) {
  return (
    <div className="min-w-0 rounded-lg border border-slate-200 bg-white p-3">
      <h3 className="mb-2 text-xs font-semibold text-slate-600">
        {label} rating
      </h3>
      {rating ? (
        <>
          <StarRating value={rating.stars} />
          <small>Rated {new Date(rating.submittedAt).toLocaleString()}</small>
          {rating.overallCall !== undefined && (
            <details className="mt-2">
              <summary className="text-xs">View feedback</summary>
              <dl className="mt-3 grid grid-cols-1 gap-2 text-xs leading-5">
                <div>
                  <dt className="text-slate-500">Overall call</dt>
                  <dd>{rating.overallCall}/10</dd>
                </div>
                <div>
                  <dt className="text-slate-500">Venture preparedness</dt>
                  <dd>{rating.venturePreparedness}/10</dd>
                </div>
                <div>
                  <dt className="text-slate-500">Next steps clarity</dt>
                  <dd>{rating.nextStepsClarity}/10</dd>
                </div>
                {rating.improvement && (
                  <div>
                    <dt className="text-slate-500">
                      Suggestions for next meeting
                    </dt>
                    <dd className="whitespace-pre-wrap break-words">
                      {rating.improvement}
                    </dd>
                  </div>
                )}
              </dl>
            </details>
          )}
        </>
      ) : (
        <span className="text-sm text-slate-500">Not rated</span>
      )}
    </div>
  );
}

export default function MeetingRatings({
  meeting,
  role,
  now,
}: {
  meeting: MeetingDetails;
  role?: RatingRole;
  now: number;
}) {
  const [open, setOpen] = useState(false);
  const past = meetingPhase(meeting, now) === "Past";
  const rated =
    role === "vp"
      ? meeting.vpRating
      : role === "panelist"
        ? meeting.panelistRating
        : undefined;
  return (
    <div
      className="min-w-0 space-y-3"
      aria-label={`Ratings for ${meeting.topic}`}
    >
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <RatingSummary label="VP" rating={meeting.vpRating} />
        <RatingSummary label="Panelist" rating={meeting.panelistRating} />
      </div>
      {role && past && !rated && (
        <button type="button" onClick={() => setOpen(true)}>
          Rate meeting
        </button>
      )}
      {role && past && rated && (
        <span className="text-xs font-medium text-emerald-700">
          Your {role === "vp" ? "VP" : "panelist"} rating has been submitted.
        </span>
      )}
      {!past && (
        <span className="text-xs text-slate-500">
          Ratings become available after the scheduled call ends.
        </span>
      )}
      {open && role && (
        <MeetingRatingDialog
          meeting={meeting}
          role={role}
          onClose={() => setOpen(false)}
        />
      )}
    </div>
  );
}
