import { Router } from "express";

import {
  login,
  acceptInvitation,
  getMe,
  changePassword,
} from "../controllers/auth.controller.js";

import { authenticate } from "../middleware/authenticate.js";

const router = Router();

router.post("/login", login);
router.post("/accept-invitation", acceptInvitation);

router.get("/me", authenticate, getMe);

router.patch("/change-password", authenticate, changePassword);

export default router;
