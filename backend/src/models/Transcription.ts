import mongoose, { Schema, Types, type HydratedDocument } from "mongoose";

export interface ITranscriptSegment {
  id: number;
  start: number;
  end: number;
  text: string;
}

export interface ITranscriptionOutputFiles {
  txt?: string;
  srt?: string;
  vtt?: string;
  json?: string;
  tsv?: string;
}

export interface ITranscription {
  meetingId: Types.ObjectId;
  originalFileName: string;
  recordingPath?: string;
  transcriptText: string;
  segments: ITranscriptSegment[];
  outputFiles: ITranscriptionOutputFiles;
  language: string;
  model: string;
  status: "pending" | "processing" | "completed" | "failed";
  errorMessage?: string;
  duration?: number;
  startedAt?: Date;
  completedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const segmentSchema = new Schema<ITranscriptSegment>(
  {
    id: { type: Number, required: true },
    start: { type: Number, required: true },
    end: { type: Number, required: true },
    text: { type: String, required: true },
  },
  { _id: false },
);

const outputFilesSchema = new Schema<ITranscriptionOutputFiles>(
  {
    txt: { type: String },
    srt: { type: String },
    vtt: { type: String },
    json: { type: String },
    tsv: { type: String },
  },
  { _id: false },
);

const transcriptionSchema = new Schema<ITranscription>(
  {
    meetingId: {
      type: Schema.Types.ObjectId,
      ref: "Meeting",
      required: true,
      index: true,
    },
    originalFileName: { type: String, required: true },
    recordingPath: { type: String },
    transcriptText: { type: String, default: "" },
    segments: { type: [segmentSchema], default: [] },
    outputFiles: { type: outputFilesSchema, default: {} },
    language: { type: String, default: "English" },
    model: { type: String, default: "base" },
    status: {
      type: String,
      enum: ["pending", "processing", "completed", "failed"],
      default: "pending",
      index: true,
    },
    errorMessage: { type: String },
    duration: { type: Number },
    startedAt: { type: Date },
    completedAt: { type: Date },
  },
  { timestamps: true },
);

transcriptionSchema.index({ meetingId: 1, createdAt: -1 });

export const Transcription = mongoose.model<ITranscription>(
  "Transcription",
  transcriptionSchema,
);
