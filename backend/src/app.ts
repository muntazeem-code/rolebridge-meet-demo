import express from "express";
import cors from "cors";

import authRoutes from "./routes/auth.routes.js";
import adminRoutes from "./routes/admin.routes.js";
import dashboardRoutes from "./routes/dashboard.routes.js";
import meetingRoutes from "./routes/meeting.routes.js";
import companySubmissionRoutes from "./routes/company-submission.routes.js";

const app = express();

app.use(
  cors({
    origin: process.env.CLIENT_URL || "http://localhost:5174",
    methods: ["GET", "POST", "PATCH", "DELETE"],
    allowedHeaders: ["Content-Type", "Authorization"],
  }),
);

app.use(express.json());

app.use((req, _res, next) => {
  console.log(`[API] ${req.method} ${req.path}`);
  next();
});

app.get("/", (req, res) => {
  console.log("Health check API called");

  res.status(200).json({
    success: true,
    message: "Multi Dashboard Backend Running",
    port: 5001,
  });
});

app.use("/api/auth", authRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/dashboards", dashboardRoutes);
app.use("/api/meetings", meetingRoutes);
app.use("/api/company-submissions", companySubmissionRoutes);

app.use((req, res, next) => {
  console.log("===================-------------------------------");
  console.log("METHOD:", req.method);
  console.log("URL:", req.originalUrl);
  console.log("BODY:", {
    ...req.body,
    password: req.body?.password ? "[REDACTED]" : undefined,
    currentPassword: req.body?.currentPassword ? "[REDACTED]" : undefined,
    newPassword: req.body?.newPassword ? "[REDACTED]" : undefined,
  });
  console.log("===================-------------------------------");
  next();
});

export default app;
