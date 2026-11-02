import { Router } from "express";
import { authenticate } from "../middleware/authenticate.js";
import { authorize } from "../middleware/authorize.js";
import {
  getMySubmission,
  submitCompany,
  listSubmissions,
  submitFeedback,
} from "../controllers/company-submission.controller.js";

const router = Router();
router.use(authenticate);
router.get("/mine", authorize("customer"), getMySubmission);
router.post("/", authorize("customer"), submitCompany);
router.get("/reviewer", authorize("reviewer"), listSubmissions("reviewer"));
router.get("/admin", authorize("super_admin"), listSubmissions("admin"));
router.get("/vp", authorize("vp"), listSubmissions("vp"));
router.patch("/:submissionId/feedback", authorize("reviewer"), submitFeedback);
export default router;
