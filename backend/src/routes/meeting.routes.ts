import { Router } from "express";
import { authenticate } from "../middleware/authenticate.js";
import { authorize } from "../middleware/authorize.js";
import {
  getMeetingCustomers,
  getMeetings,
  getCustomerMeetings,
  retryMeetingEmail,
  scheduleMeeting,
} from "../controllers/meeting.controller.js";

const router = Router();
router.use(authenticate);
router.get("/customers", authorize("vp"), getMeetingCustomers);
router.get("/mine", authorize("customer"), getCustomerMeetings);
router.get("/", authorize("vp"), getMeetings);
router.post("/", authorize("vp"), scheduleMeeting);
router.post(
  "/:meetingId/retry-email",
  authorize("vp", "super_admin"),
  retryMeetingEmail,
);
export default router;
