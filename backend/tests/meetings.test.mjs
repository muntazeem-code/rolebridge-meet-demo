import "dotenv/config";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { once } from "node:events";
import test from "node:test";
import mongoose from "mongoose";
import app from "../dist/app.js";
import { User } from "../dist/models/User.js";
import { Role } from "../dist/models/Role.js";
import { Meeting } from "../dist/models/Meeting.js";
import { CompanySubmission } from "../dist/models/CompanySubmission.js";
import { CustomerAccess } from "../dist/models/CustomerAccess.js";
import { generateToken } from "../dist/utils/jwt.js";
import { startMeetingProviders } from "./helpers/meeting-providers.mjs";

test("review handoff, panelist calls, scoped history and invitation retries", { timeout: 60000 }, async (t) => {
  assert.ok(process.env.MONGO_URI, "Set MONGO_URI for integration tests");
  const dbName = `roles_panelist_test_${randomUUID().replaceAll("-", "")}`;
  const originalEnv = { ...process.env };
  const providers = await startMeetingProviders();
  Object.assign(process.env, {
    JWT_SECRET: randomUUID(),
    ZOOM_ACCOUNT_ID: "local-account", ZOOM_CLIENT_ID: "local-client", ZOOM_CLIENT_SECRET: "local-secret",
    ZOOM_HOST_EMAIL: "host@example.invalid", ZOOM_TOKEN_URL: `${providers.zoomBase}/oauth/token`,
    ZOOM_API_BASE_URL: `${providers.zoomBase}/v2`, ZOOM_TIMEOUT_MS: "500",
    SMTP_HOST: "127.0.0.1", SMTP_PORT: String(providers.smtpPort),
    SMTP_USER: "local-user", SMTP_PASS: "local-password", MAIL_FROM: "sender@example.invalid",
  });
  let server;
  try {
    await mongoose.connect(process.env.MONGO_URI, { dbName, serverSelectionTimeoutMS: 10000 });
    assert.equal(mongoose.connection.name, dbName);
    await Promise.all([Meeting.init(), CompanySubmission.init(), CustomerAccess.init()]);
    const roles = await Role.insertMany(["super_admin", "vp", "customer", "reviewer", "panelist"].map((name) => ({ name, label: name, dashboardPath: `/dashboard/${name}` })));
    const byName = Object.fromEntries(roles.map((role) => [role.name, role._id]));
    async function fixture(name, role, status = "active", extra = {}) {
      return User.create({ fullName: name, email: `${name}@example.invalid`, roles: [byName[role]], status, mustChangePassword: false, ...extra });
    }
    const admin = await fixture("admin", "super_admin");
    const vp = await fixture("vp", "vp", "active", { roles: [byName.vp, byName.panelist] });
    const otherVp = await fixture("other-vp", "vp");
    const customer = await fixture("customer", "customer", "active", { roles: [byName.customer, byName.panelist] });
    const otherCustomer = await fixture("other-customer", "customer");
    const reviewer = await fixture("reviewer", "reviewer");
    const otherReviewer = await fixture("other-reviewer", "reviewer");
    const panelist = await fixture("panelist", "panelist");
    const otherPanelist = await fixture("other-panelist", "panelist");
    const inactivePanelist = await fixture("inactive-panelist", "panelist", "disabled");
    const pendingPanelist = await fixture("pending-panelist", "panelist", "pending");
    const passwordPanelist = await fixture("password-panelist", "panelist", "active", { mustChangePassword: true });
    server = app.listen(0, "127.0.0.1");
    await once(server, "listening");
    const base = `http://127.0.0.1:${server.address().port}/api`;
    async function request(path, method = "GET", body, actor = vp) {
      const response = await fetch(base + path, {
        method, headers: { "Content-Type": "application/json", ...(actor ? { Authorization: `Bearer ${generateToken(actor.id)}` } : {}) },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }), signal: AbortSignal.timeout(10000),
      });
      return { status: response.status, body: await response.json() };
    }
    const profile = {
      companyName: "Panelist Test Company", description: "A company needing expert business support.",
      companyDetails: "We want advice about our next phase of growth.", supportNeeds: ["strategy", "finance"],
    };
    const input = (changes = {}) => ({
      customerId: customer.id, panelistId: panelist.id, topic: "Company support call",
      date: new Date(Date.now() + 86400000).toISOString().slice(0, 10), time: "12:00", timezone: "UTC",
      duration: 30, requestId: randomUUID(), ...changes,
    });
    const creationCount = () => providers.calls.filter((call) => call.path.endsWith("/meetings")).length;
    let submission, scheduled, scheduledInput;

    await t.test("new panelist and reviewer endpoints enforce authentication and roles", async () => {
      assert.equal((await request("/company-submissions/panelist", "GET", undefined, null)).status, 401);
      assert.equal((await request("/company-submissions/panelist", "GET", undefined, otherCustomer)).status, 403);
      assert.equal((await request("/meetings/panelist", "GET", undefined, otherVp)).status, 403);
      assert.equal((await request("/meetings/reviewer", "GET", undefined, panelist)).status, 403);
      assert.equal((await request("/meetings/panelist", "GET", undefined, inactivePanelist)).status, 403);
      assert.equal((await request("/meetings/panelist", "GET", undefined, passwordPanelist)).status, 403);
      assert.equal((await request("/meetings", "POST", input(), panelist)).status, 403);
    });

    await t.test("pending reviews stay out of the panelist and VP queues and block scheduling", async () => {
      const submitted = await request("/company-submissions", "POST", profile, customer);
      assert.equal(submitted.status, 201);
      submission = submitted.body.data;
      assert.equal(submission.reviewer._id, reviewer.id);
      assert.equal((await request(`/admin/customer-access/${customer.id}`, "PATCH", { vpIds: [vp.id] }, admin)).status, 200);
      assert.equal((await request("/company-submissions/panelist", "GET", undefined, panelist)).body.total, 0);
      assert.equal((await request("/company-submissions/vp")).body.total, 0);
      assert.equal((await request("/meetings/customers")).body.data.length, 0);
      assert.equal((await request("/meetings", "POST", input())).status, 409);
      assert.equal((await request(`/meetings/panelists?customerId=${customer.id}`)).status, 409);
      assert.equal(creationCount(), 0);
    });

    await t.test("sending reviewer feedback hands the form to panelists and the assigned VP", async () => {
      const feedback = await request(`/company-submissions/${submission._id}/feedback`, "PATCH", { comments: "Focus on growth and financial planning." }, reviewer);
      assert.equal(feedback.status, 200);
      for (const actor of [panelist, otherPanelist]) {
        const list = await request("/company-submissions/panelist", "GET", undefined, actor);
        assert.equal(list.status, 200);
        assert.equal(list.body.total, 1);
        assert.equal(list.body.data[0].reviewerComments, "Focus on growth and financial planning.");
        assert.equal(list.body.data[0].reviewer._id, reviewer.id);
      }
      assert.equal((await request("/company-submissions/vp")).body.total, 1);
      assert.equal((await request("/company-submissions/vp", "GET", undefined, otherVp)).body.total, 0);
      const adminQueue = await request("/company-submissions/admin", "GET", undefined, admin);
      assert.equal(adminQueue.body.data[0].reviewerComments, "Focus on growth and financial planning.");
      assert.equal((await request("/meetings/customers")).body.data[0]._id, customer.id);
      assert.equal((await request(`/company-submissions/${submission._id}/feedback`, "PATCH", { comments: "Overwrite" }, panelist)).status, 403);
    });

    await t.test("panelist selection is scoped and invalid scheduling never calls Zoom", async () => {
      const options = await request(`/meetings/panelists?customerId=${customer.id}`);
      assert.equal(options.status, 200);
      const ids = options.body.data.map((entry) => entry._id);
      assert.ok(ids.includes(panelist.id) && ids.includes(otherPanelist.id));
      for (const excluded of [vp, customer, inactivePanelist, pendingPanelist]) assert.ok(!ids.includes(excluded.id));
      assert.equal((await request(`/meetings/panelists?customerId=${customer.id}`, "GET", undefined, otherVp)).status, 403);
      assert.equal((await request("/meetings/panelists?customerId=invalid")).status, 400);
      assert.equal((await request("/meetings", "POST", input({ panelistId: undefined }))).status, 400);
      for (const panelistId of ["invalid", otherCustomer.id, inactivePanelist.id, pendingPanelist.id, vp.id, customer.id]) {
        assert.equal((await request("/meetings", "POST", input({ panelistId }))).status, 400);
      }
      assert.equal((await request("/meetings", "POST", input(), otherVp)).status, 403);
      assert.equal(creationCount(), 0);
    });

    await t.test("scheduling saves attribution and invites both customer and panelist", async () => {
      scheduledInput = input();
      const response = await request("/meetings", "POST", scheduledInput);
      assert.equal(response.status, 201, JSON.stringify(response.body));
      scheduled = response.body.data;
      assert.equal(scheduled.status, "scheduled");
      assert.equal(scheduled.emailStatus, "sent");
      assert.equal(scheduled.panelistId, panelist.id);
      assert.equal(scheduled.panelistName, panelist.fullName);
      assert.equal(scheduled.panelistEmail, panelist.email);
      assert.equal(scheduled.companySubmissionId, submission._id);
      assert.equal(creationCount(), 1);
      assert.equal(providers.messages.length, 1);
      assert.deepEqual(providers.messages[0].recipients.sort(), [customer.email, panelist.email].sort());
      assert.ok(providers.messages[0].body.includes(scheduled.joinUrl));
      assert.ok(!JSON.stringify(response.body).includes("private-host-link"));
      assert.ok(!providers.messages[0].body.includes("private-host-link"));
      assert.equal("logs" in scheduled, false);
      assert.equal("invitedEmails" in scheduled, false);
      const replay = await request("/meetings", "POST", scheduledInput);
      assert.equal(replay.status, 200);
      assert.equal(replay.body.data._id, scheduled._id);
      assert.equal((await request("/meetings", "POST", { ...scheduledInput, panelistId: otherPanelist.id })).status, 409);
      assert.equal(creationCount(), 1);
      assert.equal(providers.messages.length, 1);
    });

    await t.test("meeting visibility and projections follow each workspace", async () => {
      for (const [path, actor, expected] of [
        ["/meetings", vp, 1], ["/meetings", otherVp, 0],
        ["/meetings/mine", customer, 1], ["/meetings/mine", otherCustomer, 0],
        ["/meetings/panelist", panelist, 1], ["/meetings/panelist", otherPanelist, 0],
        ["/meetings/reviewer", reviewer, 1], ["/meetings/reviewer", otherReviewer, 0],
        ["/admin/meetings", admin, 1],
      ]) {
        const response = await request(path, "GET", undefined, actor);
        assert.equal(response.status, 200);
        assert.equal(response.body.total, expected, path + " " + actor.email);
        if (!expected) continue;
        const data = response.body.data[0];
        assert.equal(data.panelistName, panelist.fullName);
        if (["/meetings/mine", "/meetings/panelist", "/meetings/reviewer"].includes(path)) {
          for (const field of ["logs", "requestId", "invitedEmails", "emailError"]) assert.equal(field in data, false);
          assert.equal("joinUrl" in data, path !== "/meetings/reviewer");
        }
        if (path === "/admin/meetings") assert.ok(data.logs.some((entry) => entry.event === "requested" && entry.message.includes(panelist.fullName)));
      }
    });

    await t.test("past and in-progress views use scheduled end time on every dashboard", async () => {
      const seed = {
        createdBy: vp._id, creatorName: vp.fullName, creatorEmail: vp.email,
        customerId: customer._id, customerName: customer.fullName, customerEmail: customer.email,
        panelistId: panelist._id, panelistName: panelist.fullName, panelistEmail: panelist.email,
        companySubmissionId: submission._id, timezone: "UTC", duration: 30,
        status: "scheduled", joinUrl: "https://zoom.us/j/123456", emailStatus: "sent",
      };
      const now = Date.now();
      await Meeting.create([
        { ...seed, requestId: randomUUID(), topic: "Past call", startTime: new Date(now - 7200000) },
        { ...seed, requestId: randomUUID(), topic: "In progress", startTime: new Date(now - 300000), duration: 60 },
        { ...seed, requestId: randomUUID(), topic: "Upcoming", startTime: new Date(now + 7200000) },
        { ...seed, requestId: randomUUID(), topic: "Failed request", startTime: new Date(now - 7200000), status: "failed" },
        { ...seed, panelistId: undefined, panelistName: undefined, panelistEmail: undefined, requestId: randomUUID(), topic: "Legacy past", startTime: new Date(now - 10800000) },
      ]);
      for (const [path, actor] of [["/meetings", vp], ["/meetings/mine", customer], ["/meetings/panelist", panelist], ["/meetings/reviewer", reviewer], ["/admin/meetings", admin]]) {
        const past = await request(`${path}?view=past`, "GET", undefined, actor);
        assert.equal(past.status, 200);
        assert.equal(past.body.total, actor === panelist ? 1 : 2);
        assert.equal(past.body.data[0].topic, "Past call");
        assert.ok(!past.body.data.some((entry) => entry.topic === "Failed request"));
        const upcoming = await request(`${path}?view=upcoming`, "GET", undefined, actor);
        assert.equal(upcoming.body.total, 3);
        assert.equal(upcoming.body.data[0].topic, "In progress");
        assert.ok(!upcoming.body.data.some((entry) => entry.topic === "Past call"));
      }
      assert.equal((await request("/admin/meetings?view=all", "GET", undefined, admin)).body.total, 6);
      assert.equal((await request("/meetings")).body.requests.length, 1);
      assert.equal((await request("/meetings?view=past")).body.requests.length, 0);
      const paged = await request("/meetings?view=past&page=2");
      assert.equal(paged.body.data.length, 0);
      assert.equal(paged.body.total, 2);
    });

    await t.test("invalid views and attempts to override a participant's scope are rejected", async () => {
      for (const [path, actor] of [["/meetings", vp], ["/meetings/mine", customer], ["/meetings/panelist", panelist], ["/meetings/reviewer", reviewer], ["/admin/meetings", admin]]) {
        for (const query of ["page=-1", "page=1.5", "page=wat", "view=unknown", `customerId=${otherCustomer.id}`]) {
          assert.equal((await request(`${path}?${query}`, "GET", undefined, actor)).status, 400);
        }
        if (actor !== admin) assert.equal((await request(`${path}?view=all`, "GET", undefined, actor)).status, 400);
      }
    });

    await t.test("partial SMTP rejection retries only the unsent participant without recreating Zoom", async () => {
      providers.controls.rejectPanelist = true;
      const response = await request("/meetings", "POST", input());
      assert.equal(response.status, 201);
      assert.equal(response.body.data.emailStatus, "failed");
      const saved = await Meeting.findById(response.body.data._id);
      assert.deepEqual([...saved.invitedEmails], [customer.email]);
      assert.deepEqual(providers.messages.at(-1).recipients, [customer.email]);
      const count = creationCount(), messageCount = providers.messages.length;
      providers.controls.rejectPanelist = false;
      const path = `/meetings/${saved.id}/retry-email`;
      assert.equal((await request(path, "POST", {}, panelist)).status, 403);
      const retries = await Promise.all([request(path, "POST", {}), request(path, "POST", {})]);
      assert.deepEqual(retries.map((entry) => entry.status).sort(), [200, 409]);
      assert.equal(retries.find((entry) => entry.status === 200).body.data.emailStatus, "sent");
      assert.equal(creationCount(), count);
      assert.equal(providers.messages.length, messageCount + 1);
      assert.deepEqual(providers.messages.at(-1).recipients, [panelist.email]);
      assert.equal((await request(path, "POST", {}, admin)).status, 409);
    });

    await t.test("Zoom permission failures and timeouts never produce participant invitations", async () => {
      let before = providers.messages.length;
      providers.controls.zoomFailure = true;
      const failed = await request("/meetings", "POST", input());
      assert.equal(failed.status, 502);
      assert.equal(failed.body.data.status, "failed");
      providers.controls.zoomFailure = false;
      providers.controls.zoomTimeout = true;
      const payload = input();
      const uncertain = await request("/meetings", "POST", payload);
      assert.equal(uncertain.status, 502);
      assert.equal(uncertain.body.data.status, "needs_review");
      const count = creationCount();
      assert.equal((await request("/meetings", "POST", payload)).status, 409);
      assert.equal(creationCount(), count);
      assert.equal(providers.messages.length, before);
      providers.controls.zoomTimeout = false;
    });

    await t.test("revoked customer assignment and disabled panelist block follow-up sends", async () => {
      const smtpPassword = process.env.SMTP_PASS;
      delete process.env.SMTP_PASS;
      const response = await request("/meetings", "POST", input());
      process.env.SMTP_PASS = smtpPassword;
      assert.equal(response.body.data.emailStatus, "failed");
      const path = `/meetings/${response.body.data._id}/retry-email`;
      const count = providers.messages.length;
      await User.updateOne({ _id: panelist._id }, { $set: { status: "disabled" } });
      assert.equal((await request(path, "POST", {}, admin)).status, 409);
      await User.updateOne({ _id: panelist._id }, { $set: { status: "active" } });
      assert.equal((await request(`/admin/customer-access/${customer.id}`, "PATCH", { vpIds: [] }, admin)).status, 200);
      assert.equal((await request(path, "POST", {})).status, 403);
      assert.equal((await request("/company-submissions/vp")).body.total, 0);
      assert.equal(providers.messages.length, count);
      // Completed meeting history remains attributable even after reassignment.
      assert.equal((await request("/meetings?view=past")).body.total, 2);
    });

    await t.test("panelist role changes apply to existing sessions while admin keeps history", async () => {
      await User.updateOne({ _id: panelist._id }, { $set: { roles: [byName.customer] } });
      assert.equal((await request("/meetings/panelist?view=past", "GET", undefined, panelist)).status, 403);
      assert.equal((await request("/company-submissions/panelist", "GET", undefined, panelist)).status, 403);
      assert.equal((await request(`/admin/users/${panelist.id}`, "DELETE", undefined, admin)).status, 200);
      const audit = await request("/admin/meetings?view=past", "GET", undefined, admin);
      assert.equal(audit.body.data[0].panelistName, "panelist");
      assert.ok(providers.calls.some((entry) => entry.path === "/oauth/token"));
    });
  } finally {
    if (server) await new Promise((resolve) => server.close(resolve));
    if (mongoose.connection.readyState === 1 && mongoose.connection.name === dbName) {
      await Promise.all([Meeting.deleteMany({}), CompanySubmission.deleteMany({}), CustomerAccess.deleteMany({}), User.deleteMany({}), Role.deleteMany({})]);
    }
    await mongoose.disconnect();
    await providers.close();
    for (const key of Object.keys(process.env)) if (!(key in originalEnv)) delete process.env[key];
    Object.assign(process.env, originalEnv);
  }
});
