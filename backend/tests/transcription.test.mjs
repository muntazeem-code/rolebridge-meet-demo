import "dotenv/config";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { once } from "node:events";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import test from "node:test";
import mongoose from "mongoose";
import app from "../dist/app.js";
import { Meeting } from "../dist/models/Meeting.js";
import { User } from "../dist/models/User.js";
import { Role } from "../dist/models/Role.js";
import { Transcription } from "../dist/models/Transcription.js";
import { generateToken } from "../dist/utils/jwt.js";
import {
  inspectRecordingFolder,
  matchRecordingToMeeting,
} from "../dist/services/recording-matcher.service.js";
import { getWhisperConfig } from "../dist/services/whisper.service.js";

test("Automatic Zoom transcription model, matching and API endpoints", { timeout: 60000 }, async (t) => {
  assert.ok(
    process.env.MONGO_URI,
    "MONGO_URI must be configured for integration tests",
  );

  const dbName = `tx_test_${Date.now()}`;
  const originalSecret = process.env.JWT_SECRET;
  process.env.JWT_SECRET = randomUUID();
  let server;
  const tempTestDir = path.join(os.tmpdir(), `roles_test_zoom_${randomUUID()}`);

  try {
    await mongoose.connect(process.env.MONGO_URI, {
      dbName,
      serverSelectionTimeoutMS: 10000,
    });
    assert.equal(mongoose.connection.name, dbName);

    await Promise.all([
      Meeting.init(),
      User.init(),
      Role.init(),
      Transcription.init(),
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
    const vp = await fixture("vp", ["vp"]);
    const otherVp = await fixture("other-vp", ["vp"]);
    const panelist = await fixture("panelist", ["panelist"]);
    const customer = await fixture("customer", ["customer"]);

    // Create a scheduled test meeting
    const testMeeting = await Meeting.create({
      createdBy: vp._id,
      creatorName: vp.fullName,
      creatorEmail: vp.email,
      customerId: customer._id,
      customerName: customer.fullName,
      customerEmail: customer.email,
      panelistId: panelist._id,
      panelistName: panelist.fullName,
      panelistEmail: panelist.email,
      requestId: randomUUID(),
      topic: "Tech Architecture Review",
      startTime: new Date("2026-11-10T10:00:00.000Z"),
      timezone: "UTC",
      duration: 30,
      status: "scheduled",
      zoomMeetingId: "98765432101",
      joinUrl: "https://zoom.us/j/98765432101",
    });

    // Start Express server for API testing
    server = app.listen(0);
    await once(server, "listening");
    const port = server.address().port;
    const origin = `http://127.0.0.1:${port}`;

    function authHeader(user) {
      return {
        Authorization: `Bearer ${generateToken(user._id.toString())}`,
        "Content-Type": "application/json",
      };
    }

    // -------------------------------------------------------------
    // Test 1: Whisper Config & Environment Defaults
    // -------------------------------------------------------------
    await t.test("Whisper configuration reads PYTHON_EXECUTABLE and falls back to python", () => {
      const origPy = process.env.PYTHON_EXECUTABLE;
      try {
        process.env.PYTHON_EXECUTABLE = "custom-python";
        let config = getWhisperConfig();
        assert.equal(config.pythonExecutable, "custom-python");

        delete process.env.PYTHON_EXECUTABLE;
        config = getWhisperConfig();
        assert.equal(config.pythonExecutable, "python");
      } finally {
        if (origPy !== undefined) {
          process.env.PYTHON_EXECUTABLE = origPy;
        } else {
          delete process.env.PYTHON_EXECUTABLE;
        }
      }

      const config = getWhisperConfig();
      assert.ok(config.pythonExecutable);
      assert.ok(config.model);
      assert.ok(config.language);
      assert.ok(config.device);
      assert.ok(config.outputDir);
    });

    // -------------------------------------------------------------
    // Test 2: Recording Folder Inspector & Matcher
    // -------------------------------------------------------------
    await t.test("Recording Inspector detects audio files and meeting ID", async () => {
      fs.mkdirSync(tempTestDir, { recursive: true });

      // Create a simulated Zoom recording folder with Meeting ID
      const zoomFolder1 = path.join(
        tempTestDir,
        "2026-11-10 10.05.00 Tech Architecture Review 98765432101",
      );
      fs.mkdirSync(zoomFolder1, { recursive: true });
      fs.writeFileSync(path.join(zoomFolder1, "audio.m4a"), "dummy audio content");
      fs.writeFileSync(path.join(zoomFolder1, "video.mp4"), "dummy video content");

      const info1 = inspectRecordingFolder(zoomFolder1);
      assert.ok(info1);
      assert.equal(info1.detectedMeetingId, "98765432101");
      assert.ok(info1.audioFilePath?.endsWith(".m4a"));
      assert.equal(info1.primaryRecordingPath, info1.audioFilePath);

      // Matcher test with Zoom ID
      const matched = await matchRecordingToMeeting(info1);
      assert.ok(matched);
      assert.equal(matched._id.toString(), testMeeting._id.toString());
    });

    await t.test("Recording Matcher matches via Topic and Timestamp Window", async () => {
      // Zoom folder without explicit meeting ID in name, but topic matches
      const zoomFolder2 = path.join(
        tempTestDir,
        "2026-11-10 10.02.30 Tech Architecture Review",
      );
      fs.mkdirSync(zoomFolder2, { recursive: true });
      fs.writeFileSync(path.join(zoomFolder2, "audio.m4a"), "dummy audio content");

      const info2 = inspectRecordingFolder(zoomFolder2);
      assert.ok(info2);

      const matched = await matchRecordingToMeeting(info2);
      assert.ok(matched);
      assert.equal(matched._id.toString(), testMeeting._id.toString());
    });

    await t.test("Recording Matcher rejects unverified recordings", async () => {
      const unknownFolder = path.join(
        tempTestDir,
        "2026-11-10 10.00.00 Unrelated Personal Call",
      );
      fs.mkdirSync(unknownFolder, { recursive: true });
      fs.writeFileSync(path.join(unknownFolder, "audio.m4a"), "audio");

      const info = inspectRecordingFolder(unknownFolder);
      assert.ok(info);

      const matched = await matchRecordingToMeeting(info);
      assert.equal(matched, null, "Should not guess or falsely match an unknown meeting");
    });

    // -------------------------------------------------------------
    // Test 3: Transcription MongoDB Model
    // -------------------------------------------------------------
    let transcriptionDoc;
    await t.test("Creates and stores Transcription document with segments", async () => {
      transcriptionDoc = await Transcription.create({
        meetingId: testMeeting._id,
        originalFileName: "audio.m4a",
        transcriptText: "Welcome everyone to the tech review meeting. Let us review the sprint roadmap.",
        segments: [
          {
            id: 0,
            start: 0.0,
            end: 3.5,
            text: "Welcome everyone to the tech review meeting.",
          },
          {
            id: 1,
            start: 3.5,
            end: 6.0,
            text: "Let us review the sprint roadmap.",
          },
        ],
        language: "English",
        model: "base",
        status: "completed",
        duration: 25,
        startedAt: new Date(),
        completedAt: new Date(),
      });

      assert.ok(transcriptionDoc._id);
      assert.equal(transcriptionDoc.status, "completed");
      assert.equal(transcriptionDoc.segments.length, 2);
      assert.equal(transcriptionDoc.duration, 25);
    });

    // -------------------------------------------------------------
    // Test 4: API GET /api/meetings/:meetingId/transcription
    // -------------------------------------------------------------
    await t.test("GET /api/meetings/:meetingId/transcription enforces auth and permissions", async () => {
      // Unauthenticated
      const unauthRes = await fetch(`${origin}/api/meetings/${testMeeting._id}/transcription`);
      assert.equal(unauthRes.status, 401);

      // Unauthorized VP (other VP who did not schedule the meeting)
      const otherVpRes = await fetch(
        `${origin}/api/meetings/${testMeeting._id}/transcription`,
        { headers: authHeader(otherVp) },
      );
      assert.equal(otherVpRes.status, 403);

      // Authorized VP (the creator)
      const vpRes = await fetch(
        `${origin}/api/meetings/${testMeeting._id}/transcription`,
        { headers: authHeader(vp) },
      );
      assert.equal(vpRes.status, 200);
      const vpBody = await vpRes.json();
      assert.equal(vpBody.success, true);
      assert.equal(vpBody.data.status, "completed");
      assert.equal(vpBody.data.transcriptText, transcriptionDoc.transcriptText);

      // Authorized Admin
      const adminRes = await fetch(
        `${origin}/api/meetings/${testMeeting._id}/transcription`,
        { headers: authHeader(admin) },
      );
      assert.equal(adminRes.status, 200);

      // Authorized Panelist
      const panelistRes = await fetch(
        `${origin}/api/meetings/${testMeeting._id}/transcription`,
        { headers: authHeader(panelist) },
      );
      assert.equal(panelistRes.status, 200);
    });

    // -------------------------------------------------------------
    // Test 5: API GET /api/transcriptions/:id
    // -------------------------------------------------------------
    await t.test("GET /api/transcriptions/:id returns details", async () => {
      const res = await fetch(
        `${origin}/api/transcriptions/${transcriptionDoc._id}`,
        { headers: authHeader(vp) },
      );
      assert.equal(res.status, 200);
      const body = await res.json();
      assert.equal(body.success, true);
      assert.equal(body.data.segments.length, 2);
    });

    // -------------------------------------------------------------
    // Test 6: API GET /api/transcriptions/:id/download/:format
    // -------------------------------------------------------------
    await t.test("Download formats (TXT, JSON, SRT, VTT)", async () => {
      // Download TXT
      const txtRes = await fetch(
        `${origin}/api/transcriptions/${transcriptionDoc._id}/download/txt`,
        { headers: authHeader(vp) },
      );
      assert.equal(txtRes.status, 200);
      assert.match(txtRes.headers.get("content-type") || "", /text\/plain/);
      const txtBody = await txtRes.text();
      assert.ok(txtBody.includes("Welcome everyone"));

      // Download JSON
      const jsonRes = await fetch(
        `${origin}/api/transcriptions/${transcriptionDoc._id}/download/json`,
        { headers: authHeader(vp) },
      );
      assert.equal(jsonRes.status, 200);
      assert.match(jsonRes.headers.get("content-type") || "", /application\/json/);
      const jsonBody = await jsonRes.json();
      assert.equal(jsonBody.segments.length, 2);

      // Download SRT
      const srtRes = await fetch(
        `${origin}/api/transcriptions/${transcriptionDoc._id}/download/srt`,
        { headers: authHeader(vp) },
      );
      assert.equal(srtRes.status, 400);



      // Invalid format rejection
      const invalidRes = await fetch(
        `${origin}/api/transcriptions/${transcriptionDoc._id}/download/exe`,
        { headers: authHeader(vp) },
      );
      assert.equal(invalidRes.status, 400);
    });

  } catch (err) {
    console.error("TEST FAILED WITH:", err);
    throw err;
  } finally {
    process.env.JWT_SECRET = originalSecret;
    if (server) {
      server.close();
      await once(server, "close");
    }
    // Clean up temporary directory
    if (fs.existsSync(tempTestDir)) {
      try {
        fs.rmSync(tempTestDir, { recursive: true, force: true });
      } catch {
        // Ignore cleanup error
      }
    }
    await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
  }
});
