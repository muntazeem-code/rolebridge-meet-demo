import mongoose, { Schema, Types } from "mongoose";

export interface IMeetingLog {
  event: string;
  level: "info" | "error";
  message: string;
  actorId: Types.ObjectId;
  actorName: string;
  actorEmail: string;
  at: Date;
}

export interface IMeetingRating {
  overallCall: number;
  venturePreparedness: number;
  nextStepsClarity: number;
  improvement?: string;
  stars: number;
  submittedBy: Types.ObjectId;
  submittedAt: Date;
}

export interface IMeeting {
  createdBy: Types.ObjectId;
  creatorName: string;
  creatorEmail: string;
  customerId: Types.ObjectId;
  customerName: string;
  customerEmail: string;
  panelistId?: Types.ObjectId;
  panelistName?: string;
  panelistEmail?: string;
  companySubmissionId?: Types.ObjectId;
  requestId: string;
  topic: string;
  startTime: Date;
  timezone: string;
  duration: number;
  status: "creating" | "scheduled" | "failed" | "needs_review";
  zoomMeetingId?: string;
  joinUrl?: string;
  emailStatus: "not_sent" | "sending" | "sent" | "failed";
  emailSentAt?: Date;
  emailError?: string;
  invitedEmails: string[];
  vpRating?: IMeetingRating;
  panelistRating?: IMeetingRating;
  logs: IMeetingLog[];
  createdAt: Date;
}
const scoreField = {
  type: Number,
  required: true,
  min: 1,
  max: 10,
  validate: Number.isInteger,
};
const ratingSchema = new Schema<IMeetingRating>(
  {
    overallCall: scoreField,
    venturePreparedness: scoreField,
    nextStepsClarity: scoreField,
    improvement: { type: String, trim: true, maxlength: 5000 },
    stars: { type: Number, required: true, min: 1, max: 5 },
    submittedBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
    submittedAt: { type: Date, required: true },
  },
  { _id: false },
);
const logSchema = new Schema<IMeetingLog>(
  {
    event: { type: String, required: true },
    level: { type: String, enum: ["info", "error"], required: true },
    message: { type: String, required: true },
    actorId: { type: Schema.Types.ObjectId, required: true },
    actorName: { type: String, required: true },
    actorEmail: { type: String, required: true },
    at: { type: Date, required: true },
  },
  { _id: true },
);
const schema = new Schema<IMeeting>(
  {
    createdBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
    creatorName: { type: String, required: true },
    creatorEmail: { type: String, required: true },
    customerId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    customerName: { type: String, required: true },
    customerEmail: { type: String, required: true },
    panelistId: { type: Schema.Types.ObjectId, ref: "User" },
    panelistName: String,
    panelistEmail: String,
    companySubmissionId: {
      type: Schema.Types.ObjectId,
      ref: "CompanySubmission",
    },
    requestId: { type: String, required: true },
    topic: { type: String, required: true, maxlength: 200 },
    startTime: { type: Date, required: true },
    timezone: { type: String, required: true },
    duration: { type: Number, required: true, min: 1, max: 1440 },
    status: {
      type: String,
      enum: ["creating", "scheduled", "failed", "needs_review"],
      default: "creating",
    },
    zoomMeetingId: String,
    joinUrl: String,
    emailStatus: {
      type: String,
      enum: ["not_sent", "sending", "sent", "failed"],
      default: "not_sent",
    },
    emailSentAt: Date,
    emailError: String,
    invitedEmails: { type: [String], default: [] },
    vpRating: { type: ratingSchema, default: undefined },
    panelistRating: { type: ratingSchema, default: undefined },
    logs: { type: [logSchema], default: [] },
  },
  { timestamps: true },
);
schema.index({ createdBy: 1, requestId: 1 }, { unique: true });
schema.index({ createdBy: 1, startTime: 1 });
schema.index({ panelistId: 1, startTime: 1 });
schema.index({ customerId: 1, startTime: 1 });
schema.index({ createdAt: -1 });
export const Meeting = mongoose.model<IMeeting>("Meeting", schema);
