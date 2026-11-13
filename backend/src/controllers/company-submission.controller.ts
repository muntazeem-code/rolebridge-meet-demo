import type { Request, Response } from "express";
import crypto from "node:crypto";
import { isObjectIdOrHexString, type Types } from "mongoose";
import { z } from "zod";
import type { AuthRequest } from "../middleware/authenticate.js";
import {
  CompanySubmission,
  SUPPORT_NEEDS,
} from "../models/CompanySubmission.js";
import { CustomerAccess } from "../models/CustomerAccess.js";
import { Role } from "../models/Role.js";
import { User } from "../models/User.js";
import { Invitation } from "../models/Invitation.js";
import { sendInvitationEmail } from "../services/mail.service.js";

const people = [
  { path: "customer", select: "fullName email" },
  { path: "reviewer", select: "fullName email" },
];
const inputSchema = z
  .object({
    companyName: z.string().trim().min(2).max(200),
    description: z.string().trim().min(10).max(5000),
    supportNeeds: z
      .array(z.enum(SUPPORT_NEEDS))
      .min(1)
      .max(6)
      .refine((values) => new Set(values).size === values.length),
    companyDetails: z.string().trim().min(10).max(15000),
    industry: z.string().trim().max(100).optional(),
    website: z
      .string()
      .trim()
      .max(500)
      .refine((value) => {
        if (!value) return true;
        try {
          return ["http:", "https:"].includes(new URL(value).protocol);
        } catch {
          return false;
        }
      })
      .optional(),
    location: z.string().trim().max(200).optional(),
    teamSize: z.string().trim().max(100).optional(),
    foundedYear: z
      .number()
      .int()
      .min(1800)
      .max(new Date().getFullYear())
      .optional(),
  })
  .strict();

export async function getMySubmission(
  req: AuthRequest,
  res: Response,
): Promise<void> {
  try {
    const data = await CompanySubmission.findOne({ customer: req.userId })
      .select("-reviewerComments -reviewedAt")
      .populate(people);
    res.json({ success: true, data });
  } catch {
    res
      .status(500)
      .json({ success: false, message: "Unable to load your company form." });
  }
}

export async function submitCompany(
  req: AuthRequest,
  res: Response,
): Promise<void> {
  const parsed = inputSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      success: false,
      message:
        "Provide company name, description, additional details and at least one valid support option. Check field lengths, website and founding year.",
    });
    return;
  }
  try {
    if (await CompanySubmission.exists({ customer: req.userId })) {
      res.status(409).json({
        success: false,
        message: "Your company form has already been submitted.",
      });
      return;
    }
    const role = await Role.findOne({ name: "reviewer" });
    const reviewers = role
      ? await User.find({
          roles: role._id,
          status: "active",
          _id: { $ne: req.userId },
        })
          .select("_id")
          .sort({ createdAt: 1, _id: 1 })
      : [];
    if (!reviewers.length) {
      res.status(503).json({
        success: false,
        message:
          "No active reviewer is available. Please ask the admin to activate a reviewer, then submit again. Your form has not been submitted.",
      });
      return;
    }
    const workloads = await CompanySubmission.aggregate<{
      _id: unknown;
      count: number;
    }>([
      {
        $match: {
          status: "submitted",
          reviewer: { $in: reviewers.map((reviewer) => reviewer._id) },
        },
      },
      { $group: { _id: "$reviewer", count: { $sum: 1 } } },
    ]);
    const counts = new Map(
      workloads.map((row) => [String(row._id), row.count]),
    );
    const reviewer = reviewers.reduce((best, candidate) =>
      (counts.get(candidate.id) ?? 0) < (counts.get(best.id) ?? 0)
        ? candidate
        : best,
    );
    const data = await CompanySubmission.create({
      ...parsed.data,
      customer: req.userId,
      reviewer: reviewer._id,
    });
    await data.populate(people);
    res.status(201).json({
      success: true,
      message: "Company form submitted and assigned to a reviewer.",
      data,
    });
  } catch (error) {
    if (
      error &&
      typeof error === "object" &&
      "code" in error &&
      error.code === 11000
    ) {
      res.status(409).json({
        success: false,
        message: "Your company form has already been submitted.",
      });
      return;
    }
    res.status(500).json({
      success: false,
      message:
        "Unable to submit your company form. Refresh to check its status before retrying.",
    });
  }
}

export function listSubmissions(scope: "reviewer" | "admin" | "vp" | "panelist") {
  return async (req: AuthRequest, res: Response): Promise<void> => {
    const parsed = z
      .object({
        page: z.coerce.number().int().min(1).max(100000).default(1),
        limit: z.coerce.number().int().min(1).max(50).default(10),
      })
      .safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({
        success: false,
        message: "Provide a valid page and a limit from 1 to 50.",
      });
      return;
    }
    try {
      const { page, limit } = parsed.data;
      const filter: {
        reviewer?: string;
        customer?: { $in: Types.ObjectId[] };
        status?: "reviewed";
      } = {};
      if (scope === "reviewer") filter.reviewer = req.userId;
      if (scope === "vp" || scope === "panelist") filter.status = "reviewed";
      if (scope === "vp") {
        const access = await CustomerAccess.find({ vpIds: req.userId }).select(
          "customer",
        );
        filter.customer = { $in: access.map((entry) => entry.customer) };
      }
      const [data, total] = await Promise.all([
        CompanySubmission.find(filter)
          .sort({ createdAt: -1, _id: -1 })
          .skip((page - 1) * limit)
          .limit(limit)
          .populate(people),
        CompanySubmission.countDocuments(filter),
      ]);
      res.json({
        success: true,
        data,
        page,
        total,
        totalPages: Math.max(1, Math.ceil(total / limit)),
      });
    } catch {
      res.status(500).json({
        success: false,
        message: "Unable to load company submissions.",
      });
    }
  };
}

export async function submitFeedback(
  req: AuthRequest,
  res: Response,
): Promise<void> {
  const parsed = z
    .object({ comments: z.string().trim().min(1).max(10000) })
    .strict()
    .safeParse(req.body);
  if (!isObjectIdOrHexString(req.params.submissionId) || !parsed.success) {
    res.status(400).json({
      success: false,
      message:
        "Provide a valid submission ID and comments (1–10000 characters).",
    });
    return;
  }
  try {
    const filter = { _id: req.params.submissionId, reviewer: req.userId };
    const data = await CompanySubmission.findOneAndUpdate(
      { ...filter, status: "submitted" },
      {
        $set: {
          reviewerComments: parsed.data.comments,
          reviewedAt: new Date(),
          status: "reviewed",
        },
      },
      { returnDocument: "after", runValidators: true },
    ).populate(people);
    if (!data) {
      const exists = await CompanySubmission.exists(filter);
      res.status(exists ? 409 : 404).json({
        success: false,
        message: exists
          ? "Feedback has already been submitted."
          : "Assigned submission not found.",
      });
      return;
    }
    res.json({
      success: true,
      message:
        "Feedback sent. Panelists, the admin and assigned VPs can now see your review.",
      data,
    });
  } catch {
    res.status(500).json({
      success: false,
      message:
        "Unable to send feedback. Refresh to check its status before retrying.",
    });
  }
}

export async function applyToProgram(
  req: Request,
  res: Response,
): Promise<void> {
  const publicApplySchema = inputSchema.extend({
    fullName: z.string().trim().min(2).max(100),
    email: z.string().trim().email().toLowerCase(),
  });

  const parsed = publicApplySchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      success: false,
      message:
        "Provide full name, valid email, company name, description, additional details and at least one support option. Check field lengths, website, and founding year.",
      errors: parsed.error.flatten(),
    });
    return;
  }

  const { fullName, email, ...companyData } = parsed.data;

  try {
    const customerRole = await Role.findOne({ name: "customer" });
    if (!customerRole) {
      res.status(500).json({
        success: false,
        message: "Customer role is not configured.",
      });
      return;
    }

    // Check if user already exists
    let user = await User.findOne({ email });
    if (user) {
      const existingSubmission = await CompanySubmission.findOne({
        customer: user._id,
      });
      if (existingSubmission) {
        res.status(409).json({
          success: false,
          message:
            "An application for this email address has already been submitted. Please check your email or log in.",
        });
        return;
      }

      // If user exists without a submission, ensure the customer role is present
      if (!user.roles.some((r) => r.equals(customerRole._id))) {
        user.roles.push(customerRole._id);
        await user.save();
      }
    } else {
      user = await User.create({
        fullName,
        email,
        roles: [customerRole._id],
        status: "pending",
        mustChangePassword: true,
      });
    }

    // Ensure customer access document exists for VP assignment later
    await CustomerAccess.updateOne(
      { customer: user._id },
      { $setOnInsert: { customer: user._id, vpIds: [] } },
      { upsert: true },
    );

    // Reviewer assignment (same round-robin logic as submitCompany)
    const reviewerRole = await Role.findOne({ name: "reviewer" });
    const reviewers = reviewerRole
      ? await User.find({
          roles: reviewerRole._id,
          status: "active",
          _id: { $ne: user._id },
        })
          .select("_id")
          .sort({ createdAt: 1, _id: 1 })
      : [];

    let reviewerId: Types.ObjectId;
    if (reviewers.length > 0) {
      const workloads = await CompanySubmission.aggregate<{
        _id: unknown;
        count: number;
      }>([
        {
          $match: {
            status: "submitted",
            reviewer: { $in: reviewers.map((reviewer) => reviewer._id) },
          },
        },
        { $group: { _id: "$reviewer", count: { $sum: 1 } } },
      ]);
      const counts = new Map(
        workloads.map((row) => [String(row._id), row.count]),
      );
      const reviewer = reviewers.reduce((best, candidate) =>
        (counts.get(candidate.id) ?? 0) < (counts.get(best.id) ?? 0)
          ? candidate
          : best,
      );
      reviewerId = reviewer._id;
    } else {
      // Fallback: active super_admin if no reviewer role is active
      const adminRole = await Role.findOne({ name: "super_admin" });
      const adminUser = adminRole
        ? await User.findOne({ roles: adminRole._id, status: "active" })
        : null;
      if (!adminUser) {
        res.status(503).json({
          success: false,
          message:
            "No active reviewer or administrator is available to receive applications. Please try again later.",
        });
        return;
      }
      reviewerId = adminUser._id;
    }

    const submission = await CompanySubmission.create({
      ...companyData,
      customer: user._id,
      reviewer: reviewerId,
      status: "submitted",
    });

    // Create invitation token and send email
    const rawToken = crypto.randomBytes(32).toString("hex");
    const tokenHash = crypto
      .createHash("sha256")
      .update(rawToken)
      .digest("hex");

    await Invitation.deleteMany({ user: user._id });
    await Invitation.create({
      user: user._id,
      tokenHash,
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
    });

    const clientUrl = (
      process.env.CLIENT_URL || "http://localhost:5174"
    ).replace(/\/$/, "");
    const invitationUrl = `${clientUrl}/set-password?token=${rawToken}`;

    try {
      await sendInvitationEmail(user.email, invitationUrl);
    } catch (emailError) {
      console.error(
        "Invitation email delivery failed for program application:",
        emailError,
      );
    }

    res.status(201).json({
      success: true,
      message:
        "Application submitted successfully! Please check your email for an invitation link to set your password and access your dashboard.",
      data: {
        id: submission._id,
        email: user.email,
        invitationUrl:
          process.env.NODE_ENV !== "production" ? invitationUrl : undefined,
      },
    });
  } catch (error) {
    console.error("Error in applyToProgram:", error);
    res.status(500).json({
      success: false,
      message:
        "Unable to process your application at this time. Please try again.",
    });
  }
}
