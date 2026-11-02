import type { RatingSubmission } from "../types/meeting";

export const RATING_SUBMITTED_EVENT = "meeting-rating-submitted";

export function announceRating(submission: RatingSubmission) {
  window.dispatchEvent(
    new CustomEvent<RatingSubmission>(RATING_SUBMITTED_EVENT, {
      detail: submission,
    }),
  );
}
