import { Router } from "express";
import { authenticate } from "../middleware/authenticate.js";
import {
  getTranscriptionById,
  downloadTranscriptionFormat,
} from "../controllers/transcription.controller.js";

const router = Router();

router.use(authenticate);

router.get("/:transcriptionId", getTranscriptionById);
router.get("/:transcriptionId/download/:format", downloadTranscriptionFormat);

export default router;
