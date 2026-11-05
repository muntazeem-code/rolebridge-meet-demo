import "dotenv/config";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { once } from "node:events";
import test from "node:test";
import mongoose from "mongoose";
import app from "../dist/app.js";
import { Meeting } from "../dist/models/Meeting.js";
import { User } from "../dist/models/User.js";
import { Role } from "../dist/models/Role.js";
import { CompanySubmission } from "../dist/models/CompanySubmission.js";
import { CustomerAccess } from "../dist/models/CustomerAccess.js";
import { generateToken } from "../dist/utils/jwt.js";

test(
  "independent post-call ratings, star calculation and persistent reminders",
  { timeout: 60000 },
  async (t) => {
    assert.ok(
      process.env.MONGO_URI,
      "MONGO_URI must be configured for integration tests",
    );
    const dbName = `roles_rating_test_${randomUUID().replaceAll("-", "")}`;
    const originalSecret = process.env.JWT_SECRET;
    process.env.JWT_SECRET = randomUUID();
    let server;
    try {
      await mongoose.connect(process.env.MONGO_URI, {
        dbName,
        serverSelectionTimeoutMS: 10000,
      });
      assert.equal(mongoose.connection.name, dbName);
      await Promise.all([
        Meeting.init(),
        CompanySubmission.init(),
        CustomerAccess.init(),
      ]);
      const roles = await Role.insertMany(
        ["super_admin", "vp", "panelist", "customer", "reviewer"].map(
          (name) => ({
            name,
            label: name,
            dashboardPath: `/dashboard/${name}`,
          }),
        ),
      );
      const byName = Object.fromEntries(
        roles.map((role) => [role.name, role._id]),
      );
      async function fixture(name, roleNames, extra = {}) {
        return User.create({
          fullName: name,
          email: `${name}@example.invalid`,
          status: "active",
          mustChangePassword: false,
          roles: roleNames.map((role) => byName[role]),
          ...extra,
        });
      }
      const admin = await fixture("admin", ["super_admin"]);
      const vp = await fixture("vp", ["vp", "panelist"]);
      const otherVp = await fixture("other-vp", ["vp"]);
      const panelist = await fixture("panelist", ["panelist"]);
      const otherPanelist = await fixture("other-panelist", ["panelist"]);
      const outsider = await fixture("unassigned-dual-role", ["vp", "panelist"]);
      const customer = await fixture("customer", ["customer"]);
      const reviewer = await fixture("reviewer", ["reviewer"]);
      const disabled = await fixture("disabled", ["vp"], {
        status: "disabled",
      });
      const mustChange = await fixture("must-change", ["panelist"], {
        mustChangePassword: true,
      });
      await CompanySubmission.create({
        customer: customer._id,
        reviewer: reviewer._id,
        companyName: "Rating Test",
        description: "A test venture for call ratings.",
        companyDetails: "We need support for company growth.",
        supportNeeds: ["strategy"],
        status: "reviewed",
        reviewerComments: "Ready for call.",
      });
      async function meeting(
        topic,
        creator = vp,
        participant = panelist,
        changes = {},
      ) {
        return Meeting.create({
          createdBy: creator._id,
          creatorName: creator.fullName,
          creatorEmail: creator.email,
          customerId: customer._id,
          customerName: customer.fullName,
          customerEmail: customer.email,
          ...(participant
            ? {
                panelistId: participant._id,
                panelistName: participant.fullName,
                panelistEmail: participant.email,
              }
            : {}),
          topic,
          requestId: randomUUID(),
          startTime: new Date(Date.now() - 7200000),
          timezone: "UTC",
          duration: 30,
          status: "scheduled",
          joinUrl: "https://zoom.us/j/123456",
          emailStatus: "sent",
          ...changes,
        });
      }
      const past = await meeting("Past call");
      const dualPast = await meeting("VP acting as panelist", otherVp, vp);
      const legacy = await meeting("Legacy without panelist", vp, null);
      const unrelated = await meeting(
        "Other participants",
        otherVp,
        otherPanelist,
      );
      const future = await meeting("Future call", vp, panelist, {
        startTime: new Date(Date.now() + 3600000),
      });
      const current = await meeting("Current call", vp, panelist, {
        startTime: new Date(Date.now() - 300000),
        duration: 60,
      });
      const failed = await meeting("Failed call", vp, panelist, {
        status: "failed",
      });
      const uncertain = await meeting("Uncertain request", vp, panelist, {
        status: "needs_review",
      });
      server = app.listen(0, "127.0.0.1");
      await once(server, "listening");
      const base = `http://127.0.0.1:${server.address().port}/api`;
      async function request(path, method = "GET", body, actor = vp) {
        const response = await fetch(base + path, {
          method,
          headers: {
            "Content-Type": "application/json",
            ...(actor
              ? { Authorization: `Bearer ${generateToken(actor.id)}` }
              : {}),
          },
          ...(body === undefined ? {} : { body: JSON.stringify(body) }),
          signal: AbortSignal.timeout(10000),
        });
        return { status: response.status, body: await response.json() };
      }
      const rating = (changes = {}) => ({
        role: "vp",
        overallCall: 8,
        venturePreparedness: 6,
        nextStepsClarity: 10,
        improvement: "  Share an agenda before the next call.  ",
        ...changes,
      });
      const ratePath = (call) => `/meetings/${call.id}/ratings`;
      const reminders = "/meetings/rating-notifications";

      await t.test(
        "rating and reminder endpoints require active participant roles",
        async () => {
          for (const [actor, expected] of [
            [null, 401],
            [customer, 403],
            [reviewer, 403],
            [admin, 403],
            [disabled, 403],
            [mustChange, 403],
          ]) {
            assert.equal(
              (await request(reminders, "GET", undefined, actor)).status,
              expected,
            );
            assert.equal(
              (await request(ratePath(past), "POST", rating(), actor)).status,
              expected,
            );
          }
          assert.equal(
            (await request(ratePath(past), "POST", rating(), otherVp)).status,
            404,
          );
          assert.equal(
            (
              await request(
                ratePath(past),
                "POST",
                rating({ role: "panelist" }),
                otherPanelist,
              )
            ).status,
            404,
          );
          assert.equal(
            (await request(ratePath(past), "POST", rating(), panelist)).status,
            403,
          );
          assert.equal(
            (
              await request(
                `/meetings/${new mongoose.Types.ObjectId()}/ratings`,
                "POST",
                rating(),
              )
            ).status,
            404,
          );
        },
      );

      await t.test(
        "meeting-specific ownership blocks other participants even for the same customer",
        async () => {
          for (const [call, actor, role] of [
            [past, otherVp, "vp"],
            [past, otherPanelist, "panelist"],
            [past, outsider, "vp"],
            [past, outsider, "panelist"],
            [past, vp, "panelist"],
            [dualPast, vp, "vp"],
            [legacy, outsider, "panelist"],
          ]) {
            const response = await request(
              ratePath(call),
              "POST",
              rating({ role }),
              actor,
            );
            assert.equal(
              response.status,
              404,
              `${actor.fullName} cannot rate ${call.topic} as ${role}`,
            );
          }
          assert.equal(
            (await request(reminders, "GET", undefined, outsider)).body.total,
            0,
          );
          for (const path of ["/meetings", "/meetings/panelist"]) {
            const response = await request(
              `${path}?view=past`, "GET", undefined, outsider,
            );
            assert.equal(response.status, 200);
            assert.equal(response.body.total, 0);
          }
          const saved = await Meeting.findById(past.id);
          assert.equal(saved.vpRating, undefined);
          assert.equal(saved.panelistRating, undefined);
          assert.equal(saved.logs.length, 0);
        },
      );

      await t.test(
        "meeting lists explicitly grant rating controls only to that workspace's participant",
        async () => {
          for (const [path, actor, call, expected] of [
            ["/meetings", vp, past, "vp"],
            ["/meetings/panelist", panelist, past, "panelist"],
            ["/meetings", otherVp, dualPast, "vp"],
            ["/meetings/panelist", vp, dualPast, "panelist"],
            ["/admin/meetings", admin, past, null],
            ["/meetings/mine", customer, past, null],
            ["/meetings/reviewer", reviewer, past, null],
          ]) {
            const response = await request(
              `${path}?view=past`, "GET", undefined, actor,
            );
            assert.equal(response.status, 200);
            const entry = response.body.data.find(
              (meeting) => meeting._id === call.id,
            );
            assert.ok(entry, `${actor.fullName} can see ${call.topic}`);
            assert.equal(
              entry.ratingRole,
              expected,
              `${path} returns the meeting-specific rating role`,
            );
          }
        },
      );

      await t.test(
        "reminders include only ended, unrated calls and combine a user's current roles",
        async () => {
          const response = await request(reminders);
          assert.equal(response.status, 200);
          assert.equal(response.body.total, 3);
          assert.deepEqual(
            response.body.data
              .map((entry) => `${entry.meetingId}:${entry.role}`)
              .sort(),
            [
              `${past.id}:vp`,
              `${dualPast.id}:panelist`,
              `${legacy.id}:vp`,
            ].sort(),
          );
          for (const entry of response.body.data) {
            assert.deepEqual(
              Object.keys(entry).sort(),
              [
                "meetingId",
                "role",
                "topic",
                "customerName",
                "startTime",
                "timezone",
                "duration",
              ].sort(),
            );
            assert.ok(
              ![
                future.id,
                current.id,
                failed.id,
                uncertain.id,
                unrelated.id,
              ].includes(entry.meetingId),
            );
          }
          const panel = await request(reminders, "GET", undefined, panelist);
          assert.equal(panel.body.total, 1);
          assert.equal(panel.body.data[0].meetingId, past.id);
          assert.equal(
            (await request(reminders)).body.total,
            3,
            "reading does not dismiss reminders",
          );
        },
      );

      await t.test(
        "reminder pagination is bounded and cannot change ownership",
        async () => {
          const first = await request(`${reminders}?limit=1&page=1`);
          const second = await request(`${reminders}?limit=1&page=2`);
          assert.equal(first.body.total, 3);
          assert.equal(first.body.totalPages, 3);
          assert.equal(first.body.data.length, 1);
          assert.notEqual(
            first.body.data[0].meetingId,
            second.body.data[0].meetingId,
          );
          for (const query of [
            "page=0",
            "page=1.5",
            "page=abc",
            "limit=26",
            "limit=0",
            `userId=${otherVp.id}`,
            "role=vp",
          ]) {
            assert.equal((await request(`${reminders}?${query}`)).status, 400);
          }
        },
      );

      await t.test(
        "future, in-progress and unsuccessful calls cannot be rated",
        async () => {
          for (const call of [future, current, failed, uncertain]) {
            assert.equal(
              (await request(ratePath(call), "POST", rating())).status,
              409,
            );
            assert.equal(
              (
                await request(
                  ratePath(call),
                  "POST",
                  rating({ role: "panelist" }),
                  panelist,
                )
              ).status,
              409,
            );
            assert.equal((await Meeting.findById(call.id)).vpRating, undefined);
          }
        },
      );

      await t.test(
        "three integer answers are required and caller-supplied stars/identity are rejected",
        async () => {
          const invalid = [
            { overallCall: 0 },
            { overallCall: 11 },
            { overallCall: 1.5 },
            { overallCall: "8" },
            { venturePreparedness: undefined },
            { nextStepsClarity: null },
            { role: "customer" },
            { stars: 5 },
            { submittedBy: otherVp.id },
            { submittedAt: new Date().toISOString() },
            { improvement: "x".repeat(5001) },
            { improvement: 1 },
          ];
          for (const changes of invalid)
            assert.equal(
              (await request(ratePath(past), "POST", rating(changes))).status,
              400,
            );
          assert.equal(
            (await request("/meetings/invalid/ratings", "POST", rating()))
              .status,
            400,
          );
          const saved = await Meeting.findById(past.id);
          assert.equal(saved.vpRating, undefined);
          assert.equal(saved.logs.length, 0);
        },
      );

      await t.test(
        "VP rating stores the server score and clears only the VP reminder",
        async () => {
          const response = await request(ratePath(past), "POST", rating());
          assert.equal(response.status, 201, JSON.stringify(response.body));
          assert.equal(response.body.data.role, "vp");
          assert.equal(response.body.data.meetingId, past.id);
          assert.equal(response.body.data.rating.stars, 4);
          assert.equal(
            response.body.data.rating.improvement,
            "Share an agenda before the next call.",
          );
          assert.equal(response.body.data.rating.submittedBy, vp.id);
          assert.ok(
            Number.isFinite(Date.parse(response.body.data.rating.submittedAt)),
          );
          const saved = await Meeting.findById(past.id);
          assert.equal(saved.vpRating.stars, 4);
          assert.equal(saved.panelistRating, undefined);
          assert.equal(
            saved.logs.filter((entry) => entry.event === "vp_rated").length,
            1,
          );
          assert.ok(
            !(await request(reminders)).body.data.some(
              (entry) => entry.meetingId === past.id,
            ),
          );
          assert.ok(
            (
              await request(reminders, "GET", undefined, panelist)
            ).body.data.some((entry) => entry.meetingId === past.id),
          );
          assert.equal(
            (await request(ratePath(past), "POST", rating({ overallCall: 1 })))
              .status,
            409,
          );
          assert.equal((await Meeting.findById(past.id)).vpRating.stars, 4);
        },
      );

      await t.test(
        "panelist rating remains independent and removes its reminder after submission",
        async () => {
          const response = await request(
            ratePath(past),
            "POST",
            rating({
              role: "panelist",
              overallCall: 9,
              venturePreparedness: 9,
              nextStepsClarity: 9,
              improvement: "Send financials earlier.",
            }),
            panelist,
          );
          assert.equal(response.status, 201);
          assert.equal(response.body.data.rating.stars, 4.5);
          const saved = await Meeting.findById(past.id);
          assert.equal(saved.vpRating.stars, 4);
          assert.equal(saved.panelistRating.stars, 4.5);
          assert.equal(
            (await request(reminders, "GET", undefined, panelist)).body.total,
            0,
          );
          assert.equal(
            (
              await request(
                ratePath(past),
                "POST",
                rating({ role: "panelist" }),
                panelist,
              )
            ).status,
            409,
          );
        },
      );

      await t.test(
        "existing dashboard scopes show both stars and protect detailed comments",
        async () => {
          for (const [path, actor, detailed] of [
            ["/admin/meetings", admin, true],
            ["/meetings", vp, true],
            ["/meetings/panelist", panelist, true],
            ["/meetings/mine", customer, false],
            ["/meetings/reviewer", reviewer, false],
          ]) {
            const response = await request(
              `${path}?view=past`,
              "GET",
              undefined,
              actor,
            );
            assert.equal(response.status, 200);
            const call = response.body.data.find(
              (entry) => entry._id === past.id,
            );
            assert.equal(call.vpRating.stars, 4);
            assert.equal(call.panelistRating.stars, 4.5);
            for (const field of ["vpRating", "panelistRating"]) {
              assert.equal("improvement" in call[field], detailed);
              assert.equal("overallCall" in call[field], detailed);
              if (!detailed)
                assert.deepEqual(Object.keys(call[field]).sort(), [
                  "stars",
                  "submittedAt",
                ]);
            }
            const missing = response.body.data.find(
              (entry) => entry._id === legacy.id,
            );
            if (missing) assert.equal(missing.panelistRating, undefined);
          }
          const hidden = await request(
            "/meetings/panelist?view=past",
            "GET",
            undefined,
            otherPanelist,
          );
          assert.ok(!hidden.body.data.some((entry) => entry._id === past.id));
        },
      );

      await t.test(
        "concurrent submissions for one role write only one rating and audit event",
        async () => {
          const call = await meeting("Concurrent VP rating");
          const responses = await Promise.all([
            request(ratePath(call), "POST", rating()),
            request(ratePath(call), "POST", rating({ overallCall: 10 })),
          ]);
          assert.deepEqual(
            responses.map((entry) => entry.status).sort(),
            [201, 409],
          );
          const saved = await Meeting.findById(call.id);
          assert.equal(
            saved.logs.filter((entry) => entry.event === "vp_rated").length,
            1,
          );
          assert.equal(
            saved.vpRating.stars,
            responses.find((entry) => entry.status === 201).body.data.rating
              .stars,
          );
        },
      );

      await t.test(
        "simultaneous VP and panelist submissions preserve both sets of answers",
        async () => {
          const call = await meeting("Independent concurrent ratings");
          const responses = await Promise.all([
            request(
              ratePath(call),
              "POST",
              rating({
                overallCall: 1,
                venturePreparedness: 1,
                nextStepsClarity: 1,
              }),
            ),
            request(
              ratePath(call),
              "POST",
              rating({
                role: "panelist",
                overallCall: 10,
                venturePreparedness: 10,
                nextStepsClarity: 10,
              }),
              panelist,
            ),
          ]);
          assert.deepEqual(
            responses.map((entry) => entry.status),
            [201, 201],
          );
          const saved = await Meeting.findById(call.id);
          assert.equal(saved.vpRating.stars, 1);
          assert.equal(saved.panelistRating.stars, 5);
          assert.equal(saved.logs.length, 2);
        },
      );

      await t.test(
        "star conversion covers bounds, fractions and optional feedback",
        async () => {
          for (const [scores, expected] of [
            [[1, 1, 1], 1],
            [[10, 10, 10], 5],
            [[9, 8, 9], 4.3],
            [[8, 6, 10], 4],
            [[5, 5, 5], 2.5],
          ]) {
            const call = await meeting(`Scores ${scores.join("/")}`);
            const response = await request(
              ratePath(call),
              "POST",
              rating({
                overallCall: scores[0],
                venturePreparedness: scores[1],
                nextStepsClarity: scores[2],
                improvement: undefined,
              }),
            );
            assert.equal(response.status, 201);
            assert.equal(response.body.data.rating.stars, expected);
            assert.equal(response.body.data.rating.improvement, undefined);
          }
        },
      );

      await t.test(
        "a dual-role user's reminder submits to the correct role and legacy VP ratings work",
        async () => {
          const response = await request(
            ratePath(dualPast),
            "POST",
            rating({ role: "panelist" }),
          );
          assert.equal(response.status, 201);
          const saved = await Meeting.findById(dualPast.id);
          assert.equal(saved.vpRating, undefined);
          assert.equal(saved.panelistRating.submittedBy.toString(), vp.id);
          assert.ok(
            !(await request(reminders)).body.data.some(
              (entry) => entry.meetingId === dualPast.id,
            ),
          );
          assert.equal(
            (await request(ratePath(legacy), "POST", rating())).status,
            201,
          );
          assert.equal(
            (
              await request(
                ratePath(legacy),
                "POST",
                rating({ role: "panelist" }),
              )
            ).status,
            404,
          );
        },
      );

      await t.test(
        "role removal immediately changes rating access and reminders for existing tokens",
        async () => {
          const call = await meeting("Removed VP role");
          await User.updateOne(
            { _id: vp._id },
            { $set: { roles: [byName.panelist] } },
          );
          assert.equal(
            (await request(ratePath(call), "POST", rating())).status,
            403,
          );
          const response = await request(reminders);
          assert.equal(response.status, 200);
          assert.ok(
            response.body.data.every((entry) => entry.role === "panelist"),
          );
          await User.updateOne(
            { _id: vp._id },
            { $set: { roles: [byName.vp, byName.panelist] } },
          );
          assert.equal(
            (await request(ratePath(call), "POST", rating())).status,
            201,
          );
        },
      );

      await t.test(
        "past participants retain rating eligibility after reassignment or customer deletion",
        async () => {
          const call = await meeting("Historical participant rating");
          await CustomerAccess.create({
            customer: customer._id,
            vpIds: [otherVp._id],
          });
          await User.deleteOne({ _id: customer._id });
          assert.equal(
            (await request(ratePath(call), "POST", rating())).status,
            201,
          );
          assert.equal(
            (
              await request(
                ratePath(call),
                "POST",
                rating({ role: "panelist" }),
                panelist,
              )
            ).status,
            201,
          );
          const saved = await Meeting.findById(call.id);
          assert.equal(saved.customerName, "customer");
          assert.equal(saved.vpRating.submittedBy.toString(), vp.id);
          assert.equal(
            saved.panelistRating.submittedBy.toString(),
            panelist.id,
          );
        },
      );
    } finally {
      if (server) await new Promise((resolve) => server.close(resolve));
      if (
        mongoose.connection.readyState === 1 &&
        mongoose.connection.name === dbName
      ) {
        await Promise.all([
          Meeting.deleteMany({}),
          User.deleteMany({}),
          Role.deleteMany({}),
          CompanySubmission.deleteMany({}),
          CustomerAccess.deleteMany({}),
        ]);
      }
      await mongoose.disconnect();
      if (originalSecret === undefined) delete process.env.JWT_SECRET;
      else process.env.JWT_SECRET = originalSecret;
    }
  },
);
