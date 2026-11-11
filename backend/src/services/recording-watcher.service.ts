import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import dotenv from "dotenv";
import { inspectRecordingFolder, matchRecordingToMeeting } from "./recording-matcher.service.js";
import { processMeetingTranscription } from "./whisper.service.js";
import { Transcription } from "../models/Transcription.js";

// Ensure environment variables are loaded
dotenv.config();

export function getZoomRecordingDirectory(): string {
  if (process.env.ZOOM_RECORDING_DIR && process.env.ZOOM_RECORDING_DIR.trim()) {
    return path.resolve(process.env.ZOOM_RECORDING_DIR.trim());
  }
  // Default Windows Zoom recording path: %USERPROFILE%\Documents\Zoom
  const userProfile = process.env.USERPROFILE || os.homedir();
  return path.join(userProfile, "Documents", "Zoom");
}

// Track folder/file paths currently being processed or waiting for stability
const inFlightPaths = new Set<string>();

/**
 * Checks whether a recording file has finished writing and is stable.
 */
async function isRecordingFolderStable(folderPath: string, targetFile: string): Promise<boolean> {
  // 1. Check for active Zoom conversion/temporary files
  try {
    const files = fs.readdirSync(folderPath);
    const hasTempFiles = files.some((f) => {
      const lower = f.toLowerCase();
      return lower.endsWith(".zoom") || lower.endsWith(".tmp") || lower.includes("converting");
    });

    if (hasTempFiles) {
      console.log(`[RecordingWatcher] Folder "${path.basename(folderPath)}" still has active temp/zoom files.`);
      return false;
    }

    // 2. Check recording.conf if present
    const confPath = path.join(folderPath, "recording.conf");
    if (fs.existsSync(confPath)) {
      try {
        const conf = JSON.parse(fs.readFileSync(confPath, "utf-8"));
        if (Array.isArray(conf.items)) {
          const item = conf.items[0];
          if (item && typeof item.process === "number" && item.process < 100) {
            console.log(`[RecordingWatcher] Recording conversion is at ${item.process}%. Waiting for 100%.`);
            return false;
          }
        }
      } catch {
        // conf read error or incomplete write
        return false;
      }
    }

    // 3. Size check across an interval
    const stat1 = fs.statSync(targetFile);
    if (stat1.size === 0) return false;

    // Check if the file was modified in the last 2 seconds
    const now = Date.now();
    if (now - stat1.mtimeMs < 2000) {
      return false;
    }

    await new Promise((resolve) => setTimeout(resolve, 2000));

    const stat2 = fs.statSync(targetFile);
    if (stat1.size !== stat2.size) {
      console.log(`[RecordingWatcher] File size changed (${stat1.size} -> ${stat2.size}). Still writing.`);
      return false;
    }

    // 4. File access test (read open)
    try {
      const fd = fs.openSync(targetFile, "r");
      fs.closeSync(fd);
    } catch {
      return false;
    }

    return true;
  } catch {
    return false;
  }
}

/**
 * Handle a single candidate recording folder.
 */
async function handleRecordingFolder(folderPath: string): Promise<void> {
  if (inFlightPaths.has(folderPath)) return;

  const recordingInfo = inspectRecordingFolder(folderPath);
  if (!recordingInfo || !recordingInfo.primaryRecordingPath) return;

  const targetFile = recordingInfo.primaryRecordingPath;

  // Check if this file has already been processed or is currently processing in MongoDB
  const existingTx = await Transcription.findOne({
    $or: [
      { recordingPath: targetFile },
      { originalFileName: path.basename(targetFile) },
    ],
    status: { $in: ["completed", "processing"] },
  });

  if (existingTx) {
    return;
  }

  inFlightPaths.add(folderPath);

  try {
    // Verify file stability before doing anything
    const stable = await isRecordingFolderStable(folderPath, targetFile);
    if (!stable) {
      inFlightPaths.delete(folderPath);
      return;
    }

    // Attempt to match recording to a meeting
    const meeting = await matchRecordingToMeeting(recordingInfo);
    if (!meeting) {
      // Could not verify meeting association; keep in flight so we don't log spam,
      // but do not attach to any meeting.
      return;
    }

    // Check if meeting already has a completed or in-progress transcription
    const meetingTx = await Transcription.findOne({
      meetingId: meeting._id,
      status: { $in: ["completed", "processing"] },
    });

    if (meetingTx) {
      console.log(`[RecordingWatcher] Meeting ${meeting._id} already has a transcription (${meetingTx.status}). Skipping.`);
      return;
    }

    console.log(
      `[RecordingWatcher] Starting automatic transcription for meeting "${meeting.topic}" (${meeting._id}) using recording: ${targetFile}`,
    );

    await processMeetingTranscription(meeting._id, targetFile);
  } catch (error) {
    console.error(`[RecordingWatcher] Error handling folder ${folderPath}:`, error);
  } finally {
    // Keep in set for 60 seconds to avoid duplicate triggers while DB updates
    setTimeout(() => {
      inFlightPaths.delete(folderPath);
    }, 60000);
  }
}

/**
 * Scan the Zoom recording directory for candidate recording folders.
 */
export async function scanZoomRecordings(): Promise<void> {
  const zoomDir = getZoomRecordingDirectory();

  if (!fs.existsSync(zoomDir)) {
    return;
  }

  try {
    const entries = fs.readdirSync(zoomDir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory()) {
        const fullPath = path.join(zoomDir, entry.name);
        await handleRecordingFolder(fullPath);
      }
    }
  } catch (error) {
    console.error(`[RecordingWatcher] Error scanning directory ${zoomDir}:`, error);
  }
}

let watcherInterval: NodeJS.Timeout | null = null;
let fsWatcher: fs.FSWatcher | null = null;

/**
 * Start the recording watcher service.
 */
export function startRecordingWatcher(): void {
  dotenv.config();
  const zoomDir = getZoomRecordingDirectory();
  console.log(`[RecordingWatcher] Initializing Zoom recording watcher...`);
  console.log(`[RecordingWatcher] Zoom directory: ${zoomDir}`);

  if (!fs.existsSync(zoomDir)) {
    console.warn(`[RecordingWatcher] Zoom recording directory does not exist yet: ${zoomDir}. Creating directory or waiting for Zoom.`);
    try {
      fs.mkdirSync(zoomDir, { recursive: true });
    } catch {
      // Continue even if directory cannot be created immediately
    }
  }

  // Initial scan
  void scanZoomRecordings();

  // Run periodic scans every 10 seconds
  watcherInterval = setInterval(() => {
    void scanZoomRecordings();
  }, 10000);

  // Setup fs.watch for immediate detection of newly created folders
  try {
    if (fs.existsSync(zoomDir)) {
      fsWatcher = fs.watch(zoomDir, (_eventType, filename) => {
        if (filename) {
          const fullPath = path.join(zoomDir, filename);
          // Wait 3 seconds for Zoom to create internal files, then handle
          setTimeout(() => {
            void handleRecordingFolder(fullPath);
          }, 3000);
        }
      });
    }
  } catch (err) {
    console.warn(`[RecordingWatcher] fs.watch not supported or failed on ${zoomDir}:`, err);
  }

  console.log(`[RecordingWatcher] Zoom recording watcher is active.`);
}

/**
 * Stop the recording watcher service.
 */
export function stopRecordingWatcher(): void {
  if (watcherInterval) {
    clearInterval(watcherInterval);
    watcherInterval = null;
  }
  if (fsWatcher) {
    fsWatcher.close();
    fsWatcher = null;
  }
  console.log(`[RecordingWatcher] Watcher stopped.`);
}
