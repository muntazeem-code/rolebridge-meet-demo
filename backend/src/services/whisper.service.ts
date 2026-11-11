import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { Transcription, type ITranscription } from "../models/Transcription.js";
import { Types, type HydratedDocument } from "mongoose";

export interface WhisperConfig {
  pythonExecutable: string;
  model: string;
  language: string;
  device: string;
  outputDir: string;
}

export function getWhisperConfig(): WhisperConfig {
  const pythonExecutable =
    (process.env.PYTHON_EXECUTABLE && process.env.PYTHON_EXECUTABLE.trim()) ||
    "python";
  return {
    pythonExecutable,
    model: process.env.WHISPER_MODEL || "base",
    language: process.env.WHISPER_LANGUAGE || "English",
    device: process.env.WHISPER_DEVICE || "cpu",
    outputDir:
      process.env.WHISPER_OUTPUT_DIR ||
      path.join(process.cwd(), "storage", "transcripts"),
  };
}

// Find ffmpeg in PATH or standard Windows WinGet locations if not currently in PATH
function resolveFfmpegPath(): string | undefined {
  if (process.env.FFMPEG_PATH && fs.existsSync(process.env.FFMPEG_PATH)) {
    return process.env.FFMPEG_PATH;
  }
  // Check common WinGet installation location on Windows
  const userProfile = process.env.USERPROFILE || os.homedir();
  const wingetPkgDir = path.join(userProfile, "AppData", "Local", "Microsoft", "WinGet", "Packages");
  if (fs.existsSync(wingetPkgDir)) {
    try {
      const entries = fs.readdirSync(wingetPkgDir, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isDirectory() && entry.name.toLowerCase().includes("ffmpeg")) {
          const possibleBin = path.join(wingetPkgDir, entry.name, "ffmpeg-9.0.2-full_build-shared", "bin");
          if (fs.existsSync(path.join(possibleBin, "ffmpeg.exe"))) {
            return possibleBin;
          }
          // Check any bin subfolder
          const subdirs = fs.readdirSync(path.join(wingetPkgDir, entry.name));
          for (const sub of subdirs) {
            const b = path.join(wingetPkgDir, entry.name, sub, "bin");
            if (fs.existsSync(path.join(b, "ffmpeg.exe"))) {
              return b;
            }
          }
        }
      }
    } catch {
      // Ignore directory scan errors
    }
  }
  return undefined;
}

export interface TranscriptionJobResult {
  success: boolean;
  transcriptText?: string;
  segments?: Array<{ id: number; start: number; end: number; text: string }>;
  outputFiles?: {
    txt?: string;


    json?: string;

  };
  duration?: number;
  errorMessage?: string;
}

/**
 * Execute local Whisper asynchronously on the given recording file.
 * Returns a promise that resolves when transcription completes or fails.
 */
export async function runWhisperTranscription(
  recordingFilePath: string,
  meetingId: Types.ObjectId | string,
  transcriptionDocId?: Types.ObjectId | string,
): Promise<TranscriptionJobResult> {
  const config = getWhisperConfig();
  const meetingFolder = path.resolve(config.outputDir, String(meetingId));

  if (!fs.existsSync(meetingFolder)) {
    fs.mkdirSync(meetingFolder, { recursive: true });
  }

  // Pre-setup environment for Windows UTF-8 and FFmpeg
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    PYTHONUTF8: "1",
    PYTHONIOENCODING: "utf-8",
  };

  const ffmpegDir = resolveFfmpegPath();
  if (ffmpegDir) {
    env.PATH = `${ffmpegDir}${path.delimiter}${env.PATH || ""}`;
  }

  // Resolve Python executable from environment or fallback to "python"
  const pythonExecutable =
    (process.env.PYTHON_EXECUTABLE && process.env.PYTHON_EXECUTABLE.trim()) ||
    "python";

  const baseFileName = path.basename(recordingFilePath);
  const baseNameWithoutExt = path.parse(recordingFilePath).name;

  const args = [
    "-m", "whisper",
    recordingFilePath,
    "--model", config.model,
    "--language", config.language,
    "--device", config.device,
    "--output_dir", meetingFolder,
    "--output_format", "all",
    "--fp16", "False",
  ];

  console.log(`[Whisper] Resolved Python executable: ${pythonExecutable}`);
  console.log(`[Whisper] Starting transcription for meeting ${meetingId}:`);
  console.log(`[Whisper] Command: ${pythonExecutable} ${args.join(" ")}`);

  const startTime = Date.now();

  return new Promise<TranscriptionJobResult>((resolve) => {
    let child;
    try {
      child = spawn(pythonExecutable, args, {
        env,
        windowsHide: true,
      });
    } catch (spawnError) {
      const errorMsg = spawnError instanceof Error ? spawnError.message : String(spawnError);
      console.error(`[Whisper] Failed to spawn process:`, errorMsg);
      resolve({
        success: false,
        errorMessage: `Failed to spawn Whisper process: ${errorMsg}`,
      });
      return;
    }

    let stderr = "";
    let stdout = "";

    child.stdout.on("data", (data) => {
      const text = data.toString("utf-8");
      stdout += text;
      // Log progress lines
      const lastLine = text.trim().split("\n").pop();
      if (lastLine) console.log(`[Whisper stdout] ${lastLine}`);
    });

    child.stderr.on("data", (data) => {
      const text = data.toString("utf-8");
      stderr += text;
    });

    child.on("error", (err) => {
      console.error(`[Whisper] Process execution error:`, err);
      resolve({
        success: false,
        errorMessage: `Whisper process error: ${err.message}`,
      });
    });

    child.on("close", async (code) => {
      const durationSeconds = Math.round((Date.now() - startTime) / 1000);

      if (code !== 0) {
        console.error(`[Whisper] Exited with code ${code}. Stderr: ${stderr.slice(-500)}`);
        resolve({
          success: false,
          duration: durationSeconds,
          errorMessage: `Whisper process failed with exit code ${code}: ${stderr.slice(-300) || "Unknown error"}`,
        });
        return;
      }

      console.log(`[Whisper] Finished successfully in ${durationSeconds}s for meeting ${meetingId}`);

      // Locate output files
      const txtPath = path.join(meetingFolder, `${baseNameWithoutExt}.txt`);
      const srtPath = path.join(meetingFolder, `${baseNameWithoutExt}.srt`);
      const vttPath = path.join(meetingFolder, `${baseNameWithoutExt}.vtt`);
      const jsonPath = path.join(meetingFolder, `${baseNameWithoutExt}.json`);
      const tsvPath = path.join(meetingFolder, `${baseNameWithoutExt}.tsv`);

      const outputFiles: {
        txt?: string;
    
    
        json?: string;
    
      } = {};

      if (fs.existsSync(txtPath)) outputFiles.txt = txtPath;


      if (fs.existsSync(jsonPath)) outputFiles.json = jsonPath;
      for (const unwanted of [srtPath, vttPath, tsvPath]) {
        if (fs.existsSync(unwanted)) {
          try {
            fs.unlinkSync(unwanted);
          } catch {
            // Ignore unlink errors
          }
        }
      }

      let transcriptText = "";
      if (fs.existsSync(txtPath)) {
        try {
          transcriptText = fs.readFileSync(txtPath, "utf-8").trim();
        } catch (e) {
          console.error(`[Whisper] Failed to read ${txtPath}:`, e);
        }
      }

      let segments: Array<{ id: number; start: number; end: number; text: string }> = [];
      if (fs.existsSync(jsonPath)) {
        try {
          const rawJson = fs.readFileSync(jsonPath, "utf-8");
          const parsed = JSON.parse(rawJson);
          if (Array.isArray(parsed.segments)) {
            segments = parsed.segments.map((seg: any) => ({
              id: Number(seg.id ?? 0),
              start: Number(seg.start ?? 0),
              end: Number(seg.end ?? 0),
              text: String(seg.text ?? "").trim(),
            }));
          }
          if (!transcriptText && parsed.text) {
            transcriptText = String(parsed.text).trim();
          }
        } catch (e) {
          console.error(`[Whisper] Failed to parse ${jsonPath}:`, e);
        }
      }

      resolve({
        success: true,
        transcriptText,
        segments,
        outputFiles,
        duration: durationSeconds,
      });
    });
  });
}

/**
 * High-level function that manages the full database lifecycle for a transcription job:
 * creates or updates the Transcription document, runs Whisper asynchronously,
 * and records completed or failed results.
 */
export async function processMeetingTranscription(
  meetingId: Types.ObjectId,
  recordingFilePath: string,
): Promise<HydratedDocument<ITranscription>> {
  const config = getWhisperConfig();
  const originalFileName = path.basename(recordingFilePath);

  // Check if a transcription record already exists
  let transcription = await Transcription.findOne({ meetingId });

  if (transcription) {
    if (transcription.status === "processing") {
      console.log(`[Whisper] Transcription already in progress for meeting ${meetingId}. Skipping.`);
      return transcription;
    }
    if (transcription.status === "completed") {
      console.log(`[Whisper] Meeting ${meetingId} already has completed transcription. Skipping.`);
      return transcription;
    }
    // Update to processing
    transcription.status = "processing";
    transcription.originalFileName = originalFileName;
    transcription.recordingPath = recordingFilePath;
    transcription.startedAt = new Date();
    transcription.errorMessage = undefined;
    transcription.set("model", config.model);
    transcription.language = config.language;
    await transcription.save();
  } else {
    transcription = await Transcription.create({
      meetingId,
      originalFileName,
      recordingPath: recordingFilePath,
      status: "processing",
      startedAt: new Date(),
      model: config.model,
      language: config.language,
    });
  }

  // Trigger whisper asynchronously without blocking
  runWhisperTranscription(recordingFilePath, meetingId, transcription._id)
    .then(async (result) => {
      const doc = await Transcription.findById(transcription._id);
      if (!doc) return;

      if (result.success) {
        doc.status = "completed";
        doc.transcriptText = result.transcriptText || "";
        doc.segments = result.segments || [];
        doc.outputFiles = result.outputFiles || {};
        doc.duration = result.duration;
        doc.completedAt = new Date();
        doc.errorMessage = undefined;
      } else {
        doc.status = "failed";
        doc.errorMessage = result.errorMessage || "Transcription failed";
        doc.completedAt = new Date();
      }
      await doc.save();
      console.log(`[Whisper] Saved transcription status "${doc.status}" for meeting ${meetingId}`);
    })
    .catch(async (err) => {
      console.error(`[Whisper] Unexpected error during transcription:`, err);
      await Transcription.findByIdAndUpdate(transcription._id, {
        status: "failed",
        errorMessage: err instanceof Error ? err.message : String(err),
        completedAt: new Date(),
      });
    });

  return transcription;
}
