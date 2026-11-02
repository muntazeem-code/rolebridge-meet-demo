import type { Response } from "express";
import {
  isObjectIdOrHexString,
  type HydratedDocument,
  type QueryFilter,
} from "mongoose";
import { z } from "zod";
import type { AuthRequest } from "../middleware/authenticate.js";
import { Meeting, type IMeeting } from "../models/Meeting.js";
import { User } from "../models/User.js";
import { Role } from "../models/Role.js";
import { CustomerAccess } from "../models/CustomerAccess.js";
import {
  createZoomMeeting,
  ZoomServiceError,
} from "../services/zoom.service.js";
import {
  sendMeetingInvitation,
  MeetingMailError,
} from "../services/meeting-mail.service.js";
import { meetingStartTime } from "../utils/meeting-time.js";

const schema = z
  .object({
    customerId: z.string().refine(isObjectIdOrHexString, "Invalid customer ID"),
    topic: z.string().trim().min(2).max(200),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
    timezone: z.string().min(1).max(100),
    duration: z.number().int().min(1).max(1440),
    requestId: z.uuid(),
  })
  .strict();
type Actor = { _id: IMeeting["createdBy"]; fullName: string; email: string };
function log(
  meeting: HydratedDocument<IMeeting>,
  actor: Actor,
  event: string,
  message: string,
  level: "info" | "error" = "info",
) {
  meeting.logs.push({
    event,
    message,
    level,
    actorId: actor._id,
    actorName: actor.fullName,
    actorEmail: actor.email,
    at: new Date(),
  });
}
function publicMeeting(meeting: HydratedDocument<IMeeting>, admin = false) {
  const data = meeting.toObject();
  if (admin) return data;
  const { logs: _logs, ...visible } = data;
  return visible;
}
async function allowedCustomer(vpId: string, customerId: string) {
  const assignment = await CustomerAccess.exists({
    customer: customerId,
    vpIds: vpId,
  });
  if (!assignment) return null;
  const role = await Role.findOne({ name: "customer" });
  if (!role) return null;
  return User.findOne({ _id: customerId, status: "active", roles: role._id });
}
async function deliver(meeting: HydratedDocument<IMeeting>, actor: Actor) {
  try {
    await sendMeetingInvitation(meeting);
    meeting.emailStatus = "sent";
    meeting.emailSentAt = new Date();
    meeting.emailError = undefined;
    log(
      meeting,
      actor,
      "email_sent",
      "Invitation accepted by the configured SMTP server.",
    );
  } catch (error) {
    meeting.emailStatus = "failed";
    meeting.emailError =
      error instanceof MeetingMailError
        ? error.message
        : "EMAIL_FAILED: Invitation could not be sent.";
    log(meeting, actor, "email_failed", meeting.emailError, "error");
  }
  await meeting.save();
}
function resultMessage(meeting: HydratedDocument<IMeeting>) {
  if (meeting.status === "scheduled" && meeting.emailStatus === "sending")
    return "Meeting scheduled. Invitation email is being sent; refresh meetings for its status.";
  if (meeting.status === "scheduled")
    return meeting.emailStatus === "sent"
      ? "Meeting scheduled and invitation accepted by the mail server."
      : "Meeting scheduled, but invitation email failed. Use Retry Email after correcting SMTP.";
  if (meeting.status === "creating")
    return "Meeting creation is in progress. Refresh the list before trying again.";
  if (meeting.status === "needs_review")
    return "Meeting creation needs administrator review. Do not schedule a duplicate.";
  return "This scheduling request failed. Submit a new request to try again.";
}
export const scheduleMeeting = async (
  req: AuthRequest,
  res: Response,
): Promise<void> => {
  try {
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        success: false,
        message: "Invalid meeting details",
        errors: parsed.error.flatten(),
      });
      return;
    }
    const input = parsed.data;
    let startTime: Date;
    try {
      startTime = meetingStartTime(input.date, input.time, input.timezone);
    } catch (error) {
      res
        .status(400)
        .json({ success: false, message: (error as Error).message });
      return;
    }
    const customer = await allowedCustomer(req.userId!, input.customerId);
    if (!customer) {
      res.status(403).json({
        success: false,
        message: "You cannot schedule meetings for this customer.",
      });
      return;
    }
    const replyExisting = (existing: HydratedDocument<IMeeting>) => {
      if (
        existing.customerId.toString() !== input.customerId ||
        existing.topic !== input.topic ||
        existing.startTime.getTime() !== startTime.getTime() ||
        existing.timezone !== input.timezone ||
        existing.duration !== input.duration
      ) {
        res.status(409).json({
          success: false,
          message:
            "This request ID was already used for different meeting details.",
        });
        return;
      }
      const status =
        existing.status === "scheduled"
          ? 200
          : existing.status === "creating"
            ? 202
            : 409;
      res.status(status).json({
        success: status < 400,
        message: resultMessage(existing),
        data: publicMeeting(existing),
      });
    };
    const existing = await Meeting.findOne({
      createdBy: req.userId,
      requestId: input.requestId,
    });
    if (existing) {
      replyExisting(existing);
      return;
    }
    if (startTime.getTime() <= Date.now()) {
      res.status(400).json({
        success: false,
        message: "Choose a future meeting date and time.",
      });
      return;
    }
    const creator = await User.findById(req.userId);
    if (!creator) {
      res.status(401).json({ success: false, message: "Account not found." });
      return;
    }
    let meeting: HydratedDocument<IMeeting>;
    try {
      meeting = await Meeting.create({
        createdBy: creator._id,
        creatorName: creator.fullName,
        creatorEmail: creator.email,
        customerId: customer._id,
        customerName: customer.fullName,
        customerEmail: customer.email,
        requestId: input.requestId,
        topic: input.topic,
        startTime,
        timezone: input.timezone,
        duration: input.duration,
        status: "creating",
        emailStatus: "not_sent",
        logs: [
          {
            event: "requested",
            message: "VP requested a Zoom meeting.",
            level: "info",
            actorId: creator._id,
            actorName: creator.fullName,
            actorEmail: creator.email,
            at: new Date(),
          },
        ],
      });
    } catch (error) {
      if ((error as { code?: number }).code === 11000) {
        const duplicate = await Meeting.findOne({
          createdBy: req.userId,
          requestId: input.requestId,
        });
        if (duplicate) {
          replyExisting(duplicate);
          return;
        }
      }
      throw error;
    }
    try {
      const zoom = await createZoomMeeting(meeting);
      meeting.zoomMeetingId = zoom.zoomMeetingId;
      meeting.joinUrl = zoom.joinUrl;
      meeting.status = "scheduled";
      log(
        meeting,
        creator,
        "zoom_created",
        "Zoom meeting created successfully.",
      );
    } catch (error) {
      const failure =
        error instanceof ZoomServiceError
          ? error
          : new ZoomServiceError("Zoom meeting creation failed.", true);
      meeting.status = failure.uncertain ? "needs_review" : "failed";
      log(
        meeting,
        creator,
        failure.uncertain ? "zoom_uncertain" : "zoom_failed",
        failure.message,
        "error",
      );
      await meeting.save();
      res.status(502).json({
        success: false,
        message: failure.message,
        data: publicMeeting(meeting),
      });
      return;
    }
    // Persist the participant link before sending email. An SMTP failure never recreates Zoom.
    meeting.emailStatus = "sending";
    log(
      meeting,
      creator,
      "email_sending",
      "Sending the customer's invitation.",
    );
    try {
      await meeting.save();
    } catch {
      meeting.status = "needs_review";
      log(
        meeting,
        creator,
        "storage_failed",
        "Zoom created a meeting, but saving its details failed. Administrator review required.",
        "error",
      );
      await meeting.save();
      res.status(503).json({
        success: false,
        message: resultMessage(meeting),
        data: publicMeeting(meeting),
      });
      return;
    }
    await deliver(meeting, creator);
    res.status(201).json({
      success: true,
      message: resultMessage(meeting),
      data: publicMeeting(meeting),
    });
  } catch {
    res.status(500).json({
      success: false,
      message:
        "Could not complete scheduling. Refresh meetings before submitting another request.",
    });
  }
};

export const getMeetingCustomers = async (
  req: AuthRequest,
  res: Response,
): Promise<void> => {
  try {
    const assignments = await CustomerAccess.find({ vpIds: req.userId }).select(
      "customer",
    );
    const role = await Role.findOne({ name: "customer" });
    const customers = role
      ? await User.find({
          _id: { $in: assignments.map((entry) => entry.customer) },
          roles: role._id,
          status: "active",
        })
          .select("_id fullName email")
          .sort({ fullName: 1 })
      : [];
    res.json({ success: true, data: customers });
  } catch {
    res
      .status(500)
      .json({ success: false, message: "Unable to load assigned customers." });
  }
};

export const getMeetings = async (
  req: AuthRequest,
  res: Response,
): Promise<void> => {
  try {
    const admin = req.path === "/meetings" && req.baseUrl === "/api/admin";
    const page = Math.max(1, Math.min(100000, Number(req.query.page) || 1));
    const limit = 25;
    const filter: QueryFilter<IMeeting> = admin
      ? {}
      : {
          createdBy: req.userId,
          status: "scheduled",
          startTime: { $gt: new Date() },
        };
    const [meetings, total, requests] = await Promise.all([
      Meeting.find(filter)
        .sort(admin ? { createdAt: -1, _id: -1 } : { startTime: 1, _id: 1 })
        .skip((Math.floor(page) - 1) * limit)
        .limit(limit),
      Meeting.countDocuments(filter),
      admin
        ? []
        : Meeting.find({ createdBy: req.userId, status: { $ne: "scheduled" } })
            .sort({ createdAt: -1 })
            .limit(10),
    ]);
    res.json({
      success: true,
      data: meetings.map((meeting) => publicMeeting(meeting, admin)),
      ...(!admin
        ? { requests: requests.map((meeting) => publicMeeting(meeting)) }
        : {}),
      page: Math.floor(page),
      total,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    });
  } catch {
    res
      .status(500)
      .json({ success: false, message: "Unable to load meetings." });
  }
};

export const getCustomerMeetings = async (
  req: AuthRequest,
  res: Response,
): Promise<void> => {
  try {
    const parsed = z
      .object({
        page: z.coerce.number().int().min(1).max(100000).default(1),
        view: z.enum(["upcoming", "past"]).default("upcoming"),
      })
      .strict()
      .safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({
        success: false,
        message: "Provide a valid page and meeting view.",
      });
      return;
    }
    const { page, view } = parsed.data;
    const limit = 25;
    // The account ID always comes from the verified JWT, never from query parameters.
    // Include a meeting already in progress until its scheduled duration has elapsed.
    const endTime = {
      $add: ["$startTime", { $multiply: ["$duration", 60000] }],
    };
    const filter: QueryFilter<IMeeting> = {
      customerId: req.userId,
      status: "scheduled",
      $expr:
        view === "past"
          ? { $lte: [endTime, new Date()] }
          : { $gt: [endTime, new Date()] },
    };
    const [meetings, total] = await Promise.all([
      Meeting.find(filter)
        .select(
          "_id topic startTime timezone duration status zoomMeetingId joinUrl creatorName creatorEmail createdAt",
        )
        .sort({ startTime: view === "past" ? -1 : 1, _id: 1 })
        .skip((page - 1) * limit)
        .limit(limit),
      Meeting.countDocuments(filter),
    ]);
    res.json({
      success: true,
      data: meetings,
      page,
      total,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    });
  } catch {
    res
      .status(500)
      .json({ success: false, message: "Unable to load your meetings." });
  }
};

export const retryMeetingEmail = async (
  req: AuthRequest,
  res: Response,
): Promise<void> => {
  try {
    const { meetingId } = req.params;
    if (!isObjectIdOrHexString(meetingId)) {
      res.status(400).json({ success: false, message: "Invalid meeting ID." });
      return;
    }
    const admin = req.userRoles?.includes("super_admin");
    const meeting = await Meeting.findOne({
      _id: meetingId,
      ...(admin ? {} : { createdBy: req.userId }),
    });
    if (!meeting) {
      res.status(404).json({ success: false, message: "Meeting not found." });
      return;
    }
    if (
      !admin &&
      !(await allowedCustomer(req.userId!, meeting.customerId.toString()))
    ) {
      res.status(403).json({
        success: false,
        message: "You no longer have access to this customer.",
      });
      return;
    }
    if (
      meeting.status !== "scheduled" ||
      meeting.startTime.getTime() <= Date.now()
    ) {
      res.status(409).json({
        success: false,
        message: "Only scheduled future meetings can send invitations.",
      });
      return;
    }
    const customer = await User.findById(meeting.customerId);
    const customerRole = await Role.findOne({ name: "customer" });
    if (
      !customer ||
      customer.status !== "active" ||
      !customerRole ||
      !customer.roles.some((role) => role.equals(customerRole._id))
    ) {
      res.status(409).json({
        success: false,
        message: "The customer account is no longer active.",
      });
      return;
    }
    const actor = await User.findById(req.userId);
    if (!actor) {
      res.status(401).json({ success: false, message: "Account not found." });
      return;
    }
    const locked = await Meeting.findOneAndUpdate(
      {
        _id: meeting._id,
        status: "scheduled",
        emailStatus: { $in: ["failed", "not_sent"] },
      },
      {
        $set: {
          emailStatus: "sending",
          customerEmail: customer.email,
          customerName: customer.fullName,
        },
      },
      { returnDocument: "after" },
    );
    if (!locked) {
      res.status(409).json({
        success: false,
        message: "Email was already sent or a send is in progress.",
      });
      return;
    }
    log(
      locked,
      actor,
      "email_retry",
      "Retrying the invitation for the existing Zoom meeting.",
    );
    await locked.save();
    await deliver(locked, actor);
    res.json({
      success: true,
      message: resultMessage(locked),
      data: publicMeeting(locked, admin),
    });
  } catch {
    res.status(500).json({
      success: false,
      message:
        "Could not retry email. Refresh the meeting status before retrying.",
    });
  }
};
