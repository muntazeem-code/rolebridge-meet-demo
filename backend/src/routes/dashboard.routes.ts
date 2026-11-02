import { Router } from "express";

import { authenticate } from "../middleware/authenticate.js";
import { authorize } from "../middleware/authorize.js";

const router = Router();

router.use(authenticate);

router.get("/vp", authorize("vp"), (_req, res) => {
  console.log("VP dashboard data requested");

  res.json({
    success: true,
    message: "Welcome to VP Dashboard",
  });
});

router.get("/panelist", authorize("panelist"), (_req, res) => {
  console.log("Panelist dashboard data requested");

  res.json({
    success: true,
    message: "Welcome to Panelist Dashboard",
  });
});

router.get("/reviewer", authorize("reviewer"), (_req, res) => {
  console.log("Reviewer dashboard data requested");

  res.json({
    success: true,
    message: "Welcome to Reviewer Dashboard",
  });
});

router.get("/customer", authorize("customer"), (_req, res) => {
  res.json({
    success: true,
    message: "Welcome to Customer Dashboard",
  });
});

export default router;
