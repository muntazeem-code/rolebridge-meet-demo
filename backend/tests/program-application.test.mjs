import "dotenv/config";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { once } from "node:events";
import test from "node:test";
import mongoose from "mongoose";
import app from "../dist/app.js";
import { Role } from "../dist/models/Role.js";
import { User } from "../dist/models/User.js";
import { CompanySubmission } from "../dist/models/CompanySubmission.js";
import { Invitation } from "../dist/models/Invitation.js";

test("Program Application and Direct Dashboard Onboarding Integration", { timeout: 60000 }, async (t) => {
  assert.ok(process.env.MONGO_URI, "MONGO_URI must be configured for tests");

  const dbName = `app_test_${Date.now()}`;
  const originalSecret = process.env.JWT_SECRET;
  process.env.JWT_SECRET = randomUUID();
  let server;

  try {
    await mongoose.connect(process.env.MONGO_URI, {
      dbName,
      serverSelectionTimeoutMS: 10000,
    });
    assert.equal(mongoose.connection.name, dbName);

    // Initialize required roles
    await Role.insertMany(
      ["super_admin", "vp", "panelist", "customer", "reviewer"].map((name) => ({
        name,
        label: name,
        dashboardPath: `/dashboard/${name}`,
      })),
    );

    const reviewerRole = await Role.findOne({ name: "reviewer" });
    const reviewer = await User.create({
      fullName: "Test Reviewer",
      email: "reviewer@test.com",
      passwordHash: "test_hash",
      status: "active",
      roles: [reviewerRole._id],
    });

    server = app.listen(0);
    await once(server, "listening");
    const port = server.address().port;
    const origin = `http://127.0.0.1:${port}`;

    let invitationToken = "";
    const applicantEmail = `applicant_${Date.now()}@example.com`;

    // 1. Submit public application
    await t.test("POST /api/company-submissions/apply creates customer, submission and invite", async () => {
      const payload = {
        fullName: "Jane Founder",
        email: applicantEmail,
        companyName: "Acme AI Corp",
        description: "Building next-generation generative enterprise intelligence tools.",
        supportNeeds: ["strategy", "finance"],
        companyDetails: "We have 10 enterprise pilot clients and are scaling to seed round.",
        industry: "Artificial Intelligence",
        location: "San Francisco, CA",
        teamSize: "1-10",
        foundedYear: 2024,
        website: "https://acmeai.example.com",
      };

      const res = await fetch(`${origin}/api/company-submissions/apply`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      assert.equal(res.status, 201);
      const body = await res.json();
      assert.equal(body.success, true);
      assert.ok(body.data.id);
      assert.equal(body.data.email, applicantEmail);
      assert.ok(body.data.invitationUrl);

      // Extract token from URL
      const url = new URL(body.data.invitationUrl);
      invitationToken = url.searchParams.get("token");
      assert.ok(invitationToken, "Invitation token must be in URL");

      // Verify user created
      const user = await User.findOne({ email: applicantEmail }).populate("roles");
      assert.ok(user);
      assert.equal(user.fullName, "Jane Founder");
      assert.equal(user.status, "pending");
      assert.ok(user.roles.some((r) => r.name === "customer"));

      // Verify submission created with reviewer assigned
      const sub = await CompanySubmission.findById(body.data.id);
      assert.ok(sub);
      assert.equal(sub.companyName, "Acme AI Corp");
      assert.equal(sub.status, "submitted");
      assert.equal(String(sub.reviewer), String(reviewer._id));
      assert.equal(String(sub.customer), String(user._id));
    });

    // 2. Reject duplicate email application
    await t.test("POST /api/company-submissions/apply rejects duplicate email with 409", async () => {
      const res = await fetch(`${origin}/api/company-submissions/apply`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fullName: "Duplicate User",
          email: applicantEmail,
          companyName: "Duplicate Corp",
          description: "Trying to submit again with same email.",
          supportNeeds: ["strategy"],
          companyDetails: "Additional details here.",
        }),
      });

      assert.equal(res.status, 409);
      const body = await res.json();
      assert.equal(body.success, false);
      assert.ok(body.message.includes("already been submitted"));
    });

    // 3. Reject invalid payload (missing supportNeeds)
    await t.test("POST /api/company-submissions/apply validates input", async () => {
      const res = await fetch(`${origin}/api/company-submissions/apply`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fullName: "Incomplete",
          email: "incomplete@example.com",
          companyName: "Incomplete Corp",
          description: "Missing required support needs",
          supportNeeds: [],
          companyDetails: "Details",
        }),
      });

      assert.equal(res.status, 400);
    });

    // 4. Accept invitation to set password
    let customerAuthToken = "";
    await t.test("POST /api/auth/accept-invitation sets password and logs in customer", async () => {
      const res = await fetch(`${origin}/api/auth/accept-invitation`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token: invitationToken,
          password: "SecurePassword123!",
        }),
      });

      assert.equal(res.status, 200);
      const body = await res.json();
      assert.equal(body.success, true);
      assert.ok(body.token);
      customerAuthToken = body.token;
      assert.equal(body.user.email, applicantEmail);
      assert.equal(body.user.status, "active");
    });

    // 5. In customer dashboard, the form is already submitted and immediately visible
    await t.test("GET /api/company-submissions/mine returns the pre-submitted application", async () => {
      const res = await fetch(`${origin}/api/company-submissions/mine`, {
        headers: { Authorization: `Bearer ${customerAuthToken}` },
      });

      assert.equal(res.status, 200);
      const body = await res.json();
      assert.equal(body.success, true);
      assert.ok(body.data);
      assert.equal(body.data.companyName, "Acme AI Corp");
      assert.equal(body.data.status, "submitted");
      assert.deepEqual(body.data.supportNeeds, ["strategy", "finance"]);
      assert.equal(body.data.industry, "Artificial Intelligence");
    });
  } finally {
    if (server?.listening) {
      server.close();
      await once(server, "close");
    }
    if (mongoose.connection.readyState === 1) {
      await mongoose.connection.dropDatabase();
      await mongoose.disconnect();
    }
    process.env.JWT_SECRET = originalSecret;
  }
});
