import type { Response } from "express";
import { isObjectIdOrHexString, Types } from "mongoose";
import fs from "node:fs";
import path from "node:path";
import type { AuthRequest } from "../middleware/authenticate.js";
import { Meeting, type IMeeting } from "../models/Meeting.js";
import { Transcription, type ITranscription } from "../models/Transcription.js";
import { CompanySubmission } from "../models/CompanySubmission.js";

/**
 * Check if the authenticated user has permission to access the meeting and its transcript.
 */
async function canAccessMeeting(
  userId: string,
  userRoles: string[],
  meeting: IMeeting,
): Promise<boolean> {
  // Super admin can access all meetings
  if (userRoles.includes("super_admin")) {
    return true;
  }

  // VP who scheduled the meeting
  if (userRoles.includes("vp") && meeting.createdBy.toString() === userId) {
    return true;
  }

  // Assigned Panelist
  if (userRoles.includes("panelist") && meeting.panelistId?.toString() === userId) {
    return true;
  }

  // Meeting Customer
  if (userRoles.includes("customer") && meeting.customerId.toString() === userId) {
    return true;
  }

  // Assigned Reviewer for the customer's company submission
  if (userRoles.includes("reviewer")) {
    const hasSubmission = await CompanySubmission.exists({
      customer: meeting.customerId,
      reviewer: userId,
    });
    if (hasSubmission) return true;
  }

  return false;
}

/**
 * GET /api/meetings/:meetingId/transcription
 * Retrieve the transcription and its status for a specific meeting.
 */
export const getMeetingTranscription = async (
  req: AuthRequest,
  res: Response,
): Promise<void> => {
  try {
    const { meetingId } = req.params;

    if (!isObjectIdOrHexString(meetingId)) {
      res.status(400).json({ success: false, message: "Invalid meeting ID." });
      return;
    }

    const meeting = await Meeting.findById(meetingId);
    if (!meeting) {
      res.status(404).json({ success: false, message: "Meeting not found." });
      return;
    }

    const authorized = await canAccessMeeting(
      req.userId!,
      req.userRoles || [],
      meeting,
    );

    if (!authorized) {
      res.status(403).json({
        success: false,
        message: "You do not have permission to view this transcript.",
      });
      return;
    }

    const transcription = await Transcription.findOne({ meetingId: meeting._id })
      .sort({ createdAt: -1 });

    res.json({
      success: true,
      data: transcription || null,
      message: transcription ? undefined : "No transcription found for this meeting.",
    });
  } catch (error) {
    console.error("Error retrieving meeting transcription:", error);
    res.status(500).json({
      success: false,
      message: "Unable to retrieve transcription.",
    });
  }
};

/**
 * GET /api/transcriptions/:transcriptionId
 * Retrieve transcription details and status by transcription ID.
 */
export const getTranscriptionById = async (
  req: AuthRequest,
  res: Response,
): Promise<void> => {
  try {
    const { transcriptionId } = req.params;

    if (!isObjectIdOrHexString(transcriptionId)) {
      res.status(400).json({ success: false, message: "Invalid transcription ID." });
      return;
    }

    const transcription = await Transcription.findById(transcriptionId);
    if (!transcription) {
      res.status(404).json({ success: false, message: "Transcription not found." });
      return;
    }

    const meeting = await Meeting.findById(transcription.meetingId);
    if (!meeting) {
      res.status(404).json({ success: false, message: "Associated meeting not found." });
      return;
    }

    const authorized = await canAccessMeeting(
      req.userId!,
      req.userRoles || [],
      meeting,
    );

    if (!authorized) {
      res.status(403).json({
        success: false,
        message: "You do not have permission to view this transcript.",
      });
      return;
    }

    res.json({
      success: true,
      data: transcription,
    });
  } catch (error) {
    console.error("Error retrieving transcription by ID:", error);
    res.status(500).json({
      success: false,
      message: "Unable to retrieve transcription.",
    });
  }
};

/**
 * GET /api/transcriptions/:transcriptionId/download/:format
 * Download transcript file in TXT, SRT, VTT, or JSON format.
 */
export const downloadTranscriptionFormat = async (
  req: AuthRequest,
  res: Response,
): Promise<void> => {
  try {
    const { transcriptionId, format } = req.params;

    if (!isObjectIdOrHexString(transcriptionId)) {
      res.status(400).json({ success: false, message: "Invalid transcription ID." });
      return;
    }

    const formatParam = Array.isArray(req.params.format)
      ? req.params.format[0]
      : req.params.format;
    const normalizedFormat = (formatParam || "").toLowerCase();
    if (!["txt", "srt", "vtt", "json"].includes(normalizedFormat)) {
      res.status(400).json({
        success: false,
        message: "Invalid download format. Supported formats are: txt, srt, vtt, json.",
      });
      return;
    }

    const transcription = await Transcription.findById(transcriptionId);
    if (!transcription) {
      res.status(404).json({ success: false, message: "Transcription not found." });
      return;
    }

    const meeting = await Meeting.findById(transcription.meetingId);
    if (!meeting) {
      res.status(404).json({ success: false, message: "Associated meeting not found." });
      return;
    }

    const authorized = await canAccessMeeting(
      req.userId!,
      req.userRoles || [],
      meeting,
    );

    if (!authorized) {
      res.status(403).json({
        success: false,
        message: "You do not have permission to download this transcript.",
      });
      return;
    }

    if (transcription.status !== "completed") {
      res.status(409).json({
        success: false,
        message: `Transcript is not ready for download (current status: ${transcription.status}).`,
      });
      return;
    }

    const sanitizedTopic = meeting.topic
      .replace(/[^a-zA-Z0-9_-]/g, "_")
      .slice(0, 50);
    const downloadFileName = `transcript_${sanitizedTopic}_${transcription._id}.${normalizedFormat}`;

    // Check if the physical file exists on disk
    const targetFilePath = transcription.outputFiles?.[
      normalizedFormat as keyof typeof transcription.outputFiles
    ];

    if (targetFilePath && fs.existsSync(targetFilePath)) {
      res.download(targetFilePath, downloadFileName, (err) => {
        if (err && !res.headersSent) {
          console.error("Error sending download file:", err);
          res.status(500).json({ success: false, message: "Error downloading file." });
        }
      });
      return;
    }

    // Fallback if file on disk was moved or removed: stream directly from DB content
    if (normalizedFormat === "txt") {
      res.setHeader("Content-Type", "text/plain; charset=utf-8");
      res.setHeader("Content-Disposition", `attachment; filename="${downloadFileName}"`);
      res.send(transcription.transcriptText);
      return;
    }

    if (normalizedFormat === "json") {
      res.setHeader("Content-Type", "application/json; charset=utf-8");
      res.setHeader("Content-Disposition", `attachment; filename="${downloadFileName}"`);
      res.send(
        JSON.stringify(
          {
            meetingId: transcription.meetingId,
            topic: meeting.topic,
            language: transcription.language,
            duration: transcription.duration,
            text: transcription.transcriptText,
            segments: transcription.segments,
          },
          null,
          2,
        ),
      );
      return;
    }

    if (normalizedFormat === "srt") {
      // Build SRT format from segments
      let srtContent = "";
      transcription.segments.forEach((seg, index) => {
        const formatTime = (secs: number) => {
          const h = Math.floor(secs / 3600).toString().padStart(2, "0");
          const m = Math.floor((secs % 3600) / 60).toString().padStart(2, "0");
          const s = Math.floor(secs % 60).toString().padStart(2, "0");
          const ms = Math.floor((secs % 1) * 1000).toString().padStart(3, "0");
          return `${h}:${m}:${s},${ms}`;
        };
        srtContent += `${index + 1}\n${formatTime(seg.start)} --> ${formatTime(seg.end)}\n${seg.text}\n\n`;
      });
      res.setHeader("Content-Type", "application/x-subrip; charset=utf-8");
      res.setHeader("Content-Disposition", `attachment; filename="${downloadFileName}"`);
      res.send(srtContent);
      return;
    }

    if (normalizedFormat === "vtt") {
      // Build WebVTT format from segments
      let vttContent = "WEBVTT\n\n";
      transcription.segments.forEach((seg) => {
        const formatTime = (secs: number) => {
          const h = Math.floor(secs / 3600).toString().padStart(2, "0");
          const m = Math.floor((secs % 3600) / 60).toString().padStart(2, "0");
          const s = Math.floor(secs % 60).toString().padStart(2, "0");
          const ms = Math.floor((secs % 1) * 1000).toString().padStart(3, "0");
          return `${h}:${m}:${s}.${ms}`;
        };
        vttContent += `${formatTime(seg.start)} --> ${formatTime(seg.end)}\n${seg.text}\n\n`;
      });
      res.setHeader("Content-Type", "text/vtt; charset=utf-8");
      res.setHeader("Content-Disposition", `attachment; filename="${downloadFileName}"`);
      res.send(vttContent);
      return;
    }

    res.status(404).json({ success: false, message: "File not available for download." });
  } catch (error) {
    console.error("Error during transcript download:", error);
    if (!res.headersSent) {
      res.status(500).json({ success: false, message: "Download failed." });
    }
  }
};
