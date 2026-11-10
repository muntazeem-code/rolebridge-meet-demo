import { Router } from "express";
import { authenticate } from "../middleware/authenticate.js";
import { authorize } from "../middleware/authorize.js";
import {
  getRatingNotifications,
  submitMeetingRating,
} from "../controllers/meeting-rating.controller.js";
import {
  getMeetingCustomers,
  getMeetingPanelists,
  getParticipantMeetings,
  getMeetings,
  getCustomerMeetings,
  retryMeetingEmail,
  scheduleMeeting,
} from "../controllers/meeting.controller.js";
import { getMeetingTranscription } from "../controllers/transcription.controller.js";

const router = Router();
router.use(authenticate);
router.get(
  "/rating-notifications",
  authorize("vp", "panelist"),
  getRatingNotifications,
);
router.post(
  "/:meetingId/ratings",
  authorize("vp", "panelist"),
  submitMeetingRating,
);
router.get("/customers", authorize("vp"), getMeetingCustomers);
router.get("/panelists", authorize("vp"), getMeetingPanelists);
router.get(
  "/panelist",
  authorize("panelist"),
  getParticipantMeetings("panelist"),
);
router.get(
  "/reviewer",
  authorize("reviewer"),
  getParticipantMeetings("reviewer"),
);
router.get("/mine", authorize("customer"), getCustomerMeetings);
router.get("/", authorize("vp"), getMeetings);
router.post("/", authorize("vp"), scheduleMeeting);
router.get("/:meetingId/transcription", getMeetingTranscription);
router.post(
  "/:meetingId/retry-email",
  authorize("vp", "super_admin"),
  retryMeetingEmail,
);
export default router;
