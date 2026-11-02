import mongoose, { Schema, Types } from "mongoose";

export const SUPPORT_NEEDS = [
  "strategy",
  "finance",
  "marketing_sales",
  "operations",
  "technology",
  "people_hr",
] as const;

interface ICompanySubmission {
  customer: Types.ObjectId;
  reviewer: Types.ObjectId;
  companyName: string;
  description: string;
  supportNeeds: (typeof SUPPORT_NEEDS)[number][];
  companyDetails: string;
  industry?: string;
  website?: string;
  location?: string;
  teamSize?: string;
  foundedYear?: number;
  status: "submitted" | "reviewed";
  reviewerComments?: string;
  reviewedAt?: Date;
}

const schema = new Schema<ICompanySubmission>(
  {
    customer: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      unique: true,
    },
    reviewer: { type: Schema.Types.ObjectId, ref: "User", required: true },
    companyName: { type: String, required: true, trim: true, maxlength: 200 },
    description: { type: String, required: true, trim: true, maxlength: 5000 },
    supportNeeds: { type: [String], enum: SUPPORT_NEEDS, required: true },
    companyDetails: {
      type: String,
      required: true,
      trim: true,
      maxlength: 15000,
    },
    industry: { type: String, maxlength: 100 },
    website: { type: String, maxlength: 500 },
    location: { type: String, maxlength: 200 },
    teamSize: { type: String, maxlength: 100 },
    foundedYear: Number,
    status: {
      type: String,
      enum: ["submitted", "reviewed"],
      default: "submitted",
      required: true,
    },
    reviewerComments: { type: String, maxlength: 10000 },
    reviewedAt: Date,
  },
  { timestamps: true },
);

schema.index({ reviewer: 1, status: 1 });
schema.index({ createdAt: -1, _id: -1 });

export const CompanySubmission = mongoose.model<ICompanySubmission>(
  "CompanySubmission",
  schema,
);
