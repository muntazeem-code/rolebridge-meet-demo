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
import { CompanySubmission } from "../models/CompanySubmission.js";
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
    panelistId: z.string().refine(isObjectIdOrHexString, "Invalid panelist ID"),
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
  const { logs: _logs, invitedEmails: _recipients, ...visible } = data;
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
    const accepted = await sendMeetingInvitation(meeting);
    meeting.invitedEmails = [...new Set([...(meeting.invitedEmails ?? []), ...accepted])];
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
    if (error instanceof MeetingMailError) {
      meeting.invitedEmails = [...new Set([...(meeting.invitedEmails ?? []), ...error.acceptedEmails])];
    }
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
        existing.panelistId?.toString() !== input.panelistId ||
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
    const submission = await CompanySubmission.findOne({ customer: customer._id, status: "reviewed" });
    if (!submission) {
      res.status(409).json({ success: false, message: "The customer's company review must be completed before scheduling a panelist call." });
      return;
    }
    const panelistRole = await Role.findOne({ name: "panelist" });
    const panelist = panelistRole ? await User.findOne({
      _id: input.panelistId, status: "active", roles: panelistRole._id,
    }) : null;
    if (!panelist || panelist.id === req.userId || panelist.id === customer.id) {
      res.status(400).json({ success: false, message: "Select an active panelist other than the VP or customer." });
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
        panelistId: panelist._id,
        panelistName: panelist.fullName,
        panelistEmail: panelist.email,
        companySubmissionId: submission._id,
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
            message: `VP requested a Zoom meeting with customer ${customer.fullName} and panelist ${panelist.fullName}.`,
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
      "Sending customer and panelist invitations.",
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
    const reviewed = await CompanySubmission.find({
      customer: { $in: assignments.map((entry) => entry.customer) }, status: "reviewed",
    }).select("customer");
    const customers = role
      ? await User.find({
          _id: { $in: reviewed.map((entry) => entry.customer) },
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

export const getMeetingPanelists = async (req: AuthRequest, res: Response): Promise<void> => {
  const parsed = z.object({ customerId: z.string().refine(isObjectIdOrHexString) }).strict().safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ success: false, message: "Provide a valid customer ID." });
    return;
  }
  try {
    const customer = await allowedCustomer(req.userId!, parsed.data.customerId);
    if (!customer) {
      res.status(403).json({ success: false, message: "You do not have access to this customer." });
      return;
    }
    if (!(await CompanySubmission.exists({ customer: customer._id, status: "reviewed" }))) {
      res.status(409).json({ success: false, message: "The customer's company review is not complete." });
      return;
    }
    const role = await Role.findOne({ name: "panelist" });
    const data = role ? await User.find({
      roles: role._id, status: "active", _id: { $nin: [req.userId, customer._id] },
    }).select("_id fullName email").sort({ fullName: 1, _id: 1 }) : [];
    res.json({ success: true, data });
  } catch {
    res.status(500).json({ success: false, message: "Unable to load panelists." });
  }
};

type MeetingScope = "admin" | "vp" | "customer" | "panelist" | "reviewer";

async function listMeetings(req: AuthRequest, res: Response, scope: MeetingScope): Promise<void> {
  const parsed = z.object({
    page: z.coerce.number().int().min(1).max(100000).default(1),
    view: z.enum(["all", "upcoming", "past"]).default(scope === "admin" ? "all" : "upcoming"),
  }).strict().safeParse(req.query);
  if (!parsed.success || (scope !== "admin" && parsed.data.view === "all")) {
    res.status(400).json({ success: false, message: "Provide a valid page and meeting view." });
    return;
  }
  try {
    const { page, view } = parsed.data;
    const admin = scope === "admin";
    const participant = scope === "customer" || scope === "panelist" || scope === "reviewer";
    const filter: QueryFilter<IMeeting> = {};
    if (scope === "vp") filter.createdBy = req.userId;
    if (scope === "customer") filter.customerId = req.userId;
    if (scope === "panelist") filter.panelistId = req.userId;
    if (scope === "reviewer") {
      const submissions = await CompanySubmission.find({ reviewer: req.userId }).select("customer");
      filter.customerId = { $in: submissions.map((submission) => submission.customer) };
    }
    if (view !== "all") {
      const endTime = { $add: ["$startTime", { $multiply: ["$duration", 60000] }] };
      filter.status = "scheduled";
      filter.$expr = view === "past" ? { $lte: [endTime, new Date()] } : { $gt: [endTime, new Date()] };
    }
    const limit = 25;
    const query = Meeting.find(filter).sort(view === "all" ? { createdAt: -1, _id: -1 } : { startTime: view === "past" ? -1 : 1, _id: 1 })
      .skip((page - 1) * limit).limit(limit);
    if (participant) {
      query.select(`_id topic startTime timezone duration status zoomMeetingId creatorName creatorEmail customerName customerEmail panelistName panelistEmail createdAt${scope === "reviewer" ? "" : " joinUrl"}`);
    }
    const [meetings, total, requests] = await Promise.all([
      query,
      Meeting.countDocuments(filter),
      scope === "vp" && view === "upcoming"
        ? Meeting.find({ createdBy: req.userId, status: { $ne: "scheduled" } }).sort({ createdAt: -1 }).limit(10)
        : [],
    ]);
    res.json({
      success: true,
      data: meetings.map((meeting) => participant ? meeting.toObject() : publicMeeting(meeting, admin)),
      ...(scope === "vp" ? { requests: requests.map((meeting) => publicMeeting(meeting)) } : {}),
      page, total, totalPages: Math.max(1, Math.ceil(total / limit)),
    });
  } catch {
    res.status(500).json({ success: false, message: "Unable to load meetings." });
  }
}

export const getMeetings = (req: AuthRequest, res: Response): Promise<void> =>
  listMeetings(req, res, req.baseUrl === "/api/admin" ? "admin" : "vp");
export const getCustomerMeetings = (req: AuthRequest, res: Response): Promise<void> =>
  listMeetings(req, res, "customer");
export const getParticipantMeetings = (scope: "panelist" | "reviewer") =>
  (req: AuthRequest, res: Response): Promise<void> => listMeetings(req, res, scope);

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
    const panelistRole = meeting.panelistId ? await Role.findOne({ name: "panelist" }) : null;
    const panelist = meeting.panelistId && panelistRole ? await User.findOne({
      _id: meeting.panelistId, status: "active", roles: panelistRole._id,
    }) : null;
    if (meeting.panelistId && !panelist) {
      res.status(409).json({ success: false, message: "The selected panelist is no longer active." });
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
          ...(panelist ? { panelistName: panelist.fullName, panelistEmail: panelist.email } : {}),
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
