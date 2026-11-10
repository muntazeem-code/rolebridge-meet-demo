import fs from "node:fs";
import path from "node:path";
import { Meeting, type IMeeting } from "../models/Meeting.js";
import type { HydratedDocument } from "mongoose";

export interface RecordingInfo {
  folderName: string;
  folderPath: string;
  audioFilePath?: string;
  videoFilePath?: string;
  primaryRecordingPath?: string;
  detectedMeetingId?: string;
  timestamp?: Date;
  extractedTopic?: string;
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Inspect a Zoom recording folder and extract relevant metadata
 * (audio/video files, Zoom meeting ID, recording timestamp, topic string).
 */
export function inspectRecordingFolder(folderPath: string): RecordingInfo | null {
  if (!fs.existsSync(folderPath)) return null;
  const stat = fs.statSync(folderPath);
  if (!stat.isDirectory()) return null;

  const folderName = path.basename(folderPath);
  const files = fs.readdirSync(folderPath);

  let audioFilePath: string | undefined;
  let videoFilePath: string | undefined;

  // Zoom produces files such as audio1432928419.m4a and video1432928419.mp4
  for (const file of files) {
    const ext = path.extname(file).toLowerCase();
    const fullPath = path.join(folderPath, file);

    if (ext === ".m4a") {
      audioFilePath = fullPath;
    } else if (ext === ".mp4") {
      videoFilePath = fullPath;
    }
  }

  // If neither audio nor video file is found, this is not a usable recording folder
  if (!audioFilePath && !videoFilePath) {
    return null;
  }

  // Whisper processes audio much faster and with lower memory than video.
  // Prefer M4A audio if present, otherwise MP4 video.
  const primaryRecordingPath = audioFilePath || videoFilePath;

  // Parse Zoom timestamp from folder name (e.g., "2026-11-10 12.37.03 ...")
  let timestamp: Date | undefined;
  let remainingName = folderName;

  const timestampMatch = folderName.match(
    /^(\d{4}-\d{2}-\d{2})[\s_](\d{2})[.-](\d{2})[.-](\d{2})/,
  );

  if (timestampMatch) {
    const [fullPrefix, datePart, hours, minutes, seconds] = timestampMatch;
    timestamp = new Date(`${datePart}T${hours}:${minutes}:${seconds}`);
    remainingName = folderName.slice(fullPrefix.length).trim();
  } else {
    // Fallback to directory creation time
    timestamp = stat.birthtime || stat.mtime;
  }

  // Look for 9 to 11 digit numeric sequences (Zoom Meeting ID) in folder name or recording.conf
  let detectedMeetingId: string | undefined;

  // Check folder name for meeting ID
  const meetingIdMatch = folderName.match(/\b\d{9,11}\b/);
  if (meetingIdMatch) {
    detectedMeetingId = meetingIdMatch[0];
    remainingName = remainingName.replace(meetingIdMatch[0], "").trim();
  }

  // Check recording.conf if present
  const confPath = path.join(folderPath, "recording.conf");
  if (!detectedMeetingId && fs.existsSync(confPath)) {
    try {
      const confData = JSON.parse(fs.readFileSync(confPath, "utf-8"));
      if (confData.meeting_id && /^\d{9,11}$/.test(String(confData.meeting_id))) {
        detectedMeetingId = String(confData.meeting_id);
      }
    } catch {
      // Ignore conf read errors
    }
  }

  const extractedTopic = remainingName.replace(/^[_\s-]+|[_\s-]+$/g, "");

  return {
    folderName,
    folderPath,
    audioFilePath,
    videoFilePath,
    primaryRecordingPath,
    detectedMeetingId,
    timestamp,
    extractedTopic: extractedTopic || undefined,
  };
}

/**
 * Match a Zoom recording folder to an existing RoleBridge Meeting.
 * Uses exact Zoom meeting ID first, then topic + timestamp window.
 * Strictly verifies to never guess or attach to an incorrect meeting.
 */
export async function matchRecordingToMeeting(
  recordingInfo: RecordingInfo,
): Promise<HydratedDocument<IMeeting> | null> {
  const { folderName, detectedMeetingId, extractedTopic, timestamp } = recordingInfo;

  // Strategy 1: Match by Zoom Meeting ID
  if (detectedMeetingId) {
    const meetingByZoomId = await Meeting.findOne({
      zoomMeetingId: detectedMeetingId,
      status: "scheduled",
    });

    if (meetingByZoomId) {
      console.log(
        `[RecordingMatcher] Matched "${folderName}" to meeting "${meetingByZoomId.topic}" (${meetingByZoomId._id}) via Zoom Meeting ID ${detectedMeetingId}`,
      );
      return meetingByZoomId;
    }
  }

  // Strategy 2: Match by Topic and Scheduled Time Window
  if (extractedTopic && timestamp && !isNaN(timestamp.getTime())) {
    // Look for scheduled meetings matching the topic
    const topicRegex = new RegExp(`^${escapeRegex(extractedTopic.trim())}$`, "i");
    const candidates = await Meeting.find({
      topic: { $regex: topicRegex },
      status: "scheduled",
    });

    if (candidates.length === 1) {
      const candidate = candidates[0];
      // Check if candidate start time is on the same day or within 12 hours of recording
      const diffHours = Math.abs(candidate.startTime.getTime() - timestamp.getTime()) / (1000 * 60 * 60);
      if (diffHours <= 12) {
        console.log(
          `[RecordingMatcher] Matched "${folderName}" to meeting "${candidate.topic}" (${candidate._id}) via unique topic and timestamp window`,
        );
        return candidate;
      }
    } else if (candidates.length > 1) {
      // Find candidate closest in time to recording timestamp (within 4 hours)
      const compatible = candidates.filter((c) => {
        const diffHours = Math.abs(c.startTime.getTime() - timestamp.getTime()) / (1000 * 60 * 60);
        return diffHours <= 4;
      });

      if (compatible.length === 1) {
        const candidate = compatible[0];
        console.log(
          `[RecordingMatcher] Matched "${folderName}" to meeting "${candidate.topic}" (${candidate._id}) via closest timestamp`,
        );
        return candidate;
      }
    }

    // Strategy 2b: Try partial topic match if extracted topic is contained in meeting topic
    // (e.g. if Zoom truncated topic or appended words)
    const partialCandidates = await Meeting.find({
      topic: { $regex: new RegExp(escapeRegex(extractedTopic.trim()), "i") },
      status: "scheduled",
    });

    if (partialCandidates.length === 1) {
      const candidate = partialCandidates[0];
      const diffHours = Math.abs(candidate.startTime.getTime() - timestamp.getTime()) / (1000 * 60 * 60);
      if (diffHours <= 12) {
        console.log(
          `[RecordingMatcher] Matched "${folderName}" to meeting "${candidate.topic}" (${candidate._id}) via partial topic match`,
        );
        return candidate;
      }
    }
  }

  // Strategy 3: Single active scheduled meeting matching the recording date/time
  // If the host ran their personal room or ad-hoc topic ("Md Muntazeem Saradgi's Zoom Meeting"),
  // check if there is exactly ONE scheduled meeting whose window matches this recording time.
  if (timestamp && !isNaN(timestamp.getTime())) {
    const windowStart = new Date(timestamp.getTime() - 30 * 60 * 1000); // 30 mins before
    const windowEnd = new Date(timestamp.getTime() + 120 * 60 * 1000); // 2 hours after
    const activeMeetings = await Meeting.find({
      status: "scheduled",
      startTime: { $gte: windowStart, $lte: windowEnd },
    });

    if (activeMeetings.length === 1) {
      const candidate = activeMeetings[0];
      console.log(
        `[RecordingMatcher] Matched "${folderName}" to unique scheduled meeting in time window: "${candidate.topic}" (${candidate._id})`,
      );
      return candidate;
    }
  }

  console.warn(
    `[RecordingMatcher] Could not reliably match recording folder "${folderName}" to an existing meeting. Skipping to prevent false association.`,
  );
  return null;
}
