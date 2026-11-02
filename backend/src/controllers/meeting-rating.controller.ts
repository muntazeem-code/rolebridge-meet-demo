import type { Response } from "express";
import { isObjectIdOrHexString, Types } from "mongoose";
import { z } from "zod";
import type { AuthRequest } from "../middleware/authenticate.js";
import { Meeting } from "../models/Meeting.js";
import { User } from "../models/User.js";

const ratingInput = z
  .object({
    role: z.enum(["vp", "panelist"]),
    overallCall: z.number().int().min(1).max(10),
    venturePreparedness: z.number().int().min(1).max(10),
    nextStepsClarity: z.number().int().min(1).max(10),
    improvement: z.string().trim().max(5000).optional(),
  })
  .strict();

const endTime = { $add: ["$startTime", { $multiply: ["$duration", 60000] }] };

export async function submitMeetingRating(
  req: AuthRequest,
  res: Response,
): Promise<void> {
  const parsed = ratingInput.safeParse(req.body);
  if (!isObjectIdOrHexString(req.params.meetingId) || !parsed.success) {
    res.status(400).json({
      success: false,
      message:
        "Select a score from 1 to 10 for all three questions. Optional feedback must be at most 5000 characters, and the meeting ID must be valid.",
    });
    return;
  }
  const { role, ...answers } = parsed.data;
  if (!req.userRoles?.includes(role)) {
    res.status(403).json({
      success: false,
      message: "Your account does not have the selected rating role.",
    });
    return;
  }
  try {
    const actor = await User.findById(req.userId).select("fullName email");
    if (!actor) {
      res.status(401).json({ success: false, message: "Account not found." });
      return;
    }
    const field = role === "vp" ? "vpRating" : "panelistRating";
    const owner = role === "vp" ? "createdBy" : "panelistId";
    const ownership = { _id: req.params.meetingId, [owner]: req.userId };
    const now = new Date();
    const rating = {
      ...answers,
      stars:
        Math.round(
          Math.max(
            1,
            (answers.overallCall +
              answers.venturePreparedness +
              answers.nextStepsClarity) /
              6,
          ) * 10,
        ) / 10,
      submittedBy: actor._id,
      submittedAt: now,
    };
    const meeting = await Meeting.findOneAndUpdate(
      {
        ...ownership,
        status: "scheduled",
        $expr: { $lte: [endTime, now] },
        [field]: null,
      },
      {
        $set: { [field]: rating },
        $push: {
          logs: {
            event: `${role}_rated`,
            level: "info",
            message: `${role === "vp" ? "VP" : "Panelist"} submitted a ${rating.stars.toFixed(1)}/5 call rating.`,
            actorId: actor._id,
            actorName: actor.fullName,
            actorEmail: actor.email,
            at: now,
          },
        },
      },
      { returnDocument: "after", runValidators: true },
    ).select(field);
    if (!meeting) {
      const existing = await Meeting.findOne(ownership).select(field);
      if (!existing) {
        res.status(404).json({
          success: false,
          message: "Meeting not found for your participant role.",
        });
      } else {
        res.status(409).json({
          success: false,
          message: existing[field]
            ? "You have already rated this meeting. Ratings cannot be submitted twice."
            : "You can rate a scheduled meeting only after the call has ended.",
        });
      }
      return;
    }
    res.status(201).json({
      success: true,
      message: "Thank you. Your meeting rating has been submitted.",
      data: { meetingId: meeting.id, role, rating: meeting[field] },
    });
  } catch {
    res.status(500).json({
      success: false,
      message:
        "Unable to save your rating. Refresh the meeting to check whether it was saved before trying again.",
    });
  }
}

export async function getRatingNotifications(
  req: AuthRequest,
  res: Response,
): Promise<void> {
  const parsed = z
    .object({
      page: z.coerce.number().int().min(1).max(100000).default(1),
      limit: z.coerce.number().int().min(1).max(25).default(10),
    })
    .strict()
    .safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({
      success: false,
      message: "Provide a valid page and a limit from 1 to 25.",
    });
    return;
  }
  try {
    const { page, limit } = parsed.data;
    const userId = new Types.ObjectId(req.userId!);
    const roles = ["vp", "panelist"].filter((role) =>
      req.userRoles?.includes(role),
    );
    const candidates = roles.map((role) => ({
      role,
      owner: role === "vp" ? "createdBy" : "panelistId",
      field: role === "vp" ? "vpRating" : "panelistRating",
    }));
    const [result] = await Meeting.aggregate([
      {
        $match: {
          status: "scheduled",
          $expr: { $lte: [endTime, new Date()] },
          $or: candidates.map(({ owner, field }) => ({
            [owner]: userId,
            [field]: null,
          })),
        },
      },
      {
        $project: {
          topic: 1,
          customerName: 1,
          startTime: 1,
          timezone: 1,
          duration: 1,
          pendingRoles: {
            $filter: {
              input: candidates.map(({ role, owner, field }) => ({
                $cond: [
                  {
                    $and: [
                      { $eq: [`$${owner}`, userId] },
                      { $eq: [{ $ifNull: [`$${field}`, null] }, null] },
                    ],
                  },
                  role,
                  null,
                ],
              })),
              as: "role",
              cond: { $ne: ["$$role", null] },
            },
          },
        },
      },
      { $unwind: "$pendingRoles" },
      { $sort: { startTime: -1, _id: -1, pendingRoles: 1 } },
      {
        $facet: {
          data: [
            { $skip: (page - 1) * limit },
            { $limit: limit },
            {
              $project: {
                _id: 0,
                meetingId: "$_id",
                role: "$pendingRoles",
                topic: 1,
                customerName: 1,
                startTime: 1,
                timezone: 1,
                duration: 1,
              },
            },
          ],
          count: [{ $count: "total" }],
        },
      },
    ]);
    const total = result?.count[0]?.total ?? 0;
    res.json({
      success: true,
      data: result?.data ?? [],
      page,
      total,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    });
  } catch {
    res.status(500).json({
      success: false,
      message: "Unable to load rating notifications.",
    });
  }
}
