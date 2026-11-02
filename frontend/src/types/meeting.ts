export interface MeetingLog {
  _id: string;
  event: string;
  level: "info" | "error";
  message: string;
  actorName: string;
  actorEmail: string;
  at: string;
}
export interface Meeting {
  _id: string;
  createdBy: string;
  creatorName: string;
  creatorEmail: string;
  customerId: string;
  customerName: string;
  customerEmail: string;
  panelistId?: string;
  panelistName?: string;
  panelistEmail?: string;
  companySubmissionId?: string;
  invitedEmails?: string[];
  requestId: string;
  topic: string;
  startTime: string;
  timezone: string;
  duration: number;
  status: "creating" | "scheduled" | "failed" | "needs_review";
  zoomMeetingId?: string;
  joinUrl?: string;
  emailStatus: "not_sent" | "sending" | "sent" | "failed";
  emailError?: string;
  logs?: MeetingLog[];
  createdAt: string;
}
export interface MeetingPage {
  success: boolean;
  data: MeetingDetails[];
  page: number;
  total: number;
  totalPages: number;
  requests?: Meeting[];
}
export type MeetingDetails = Pick<
  Meeting,
  "_id" | "topic" | "startTime" | "timezone" | "duration" | "status" |
  "creatorName" | "creatorEmail" | "customerName" | "customerEmail" | "createdAt"
> & Partial<Meeting>;
export interface CustomerOption {
  _id: string;
  fullName: string;
  email: string;
}
export interface CustomerAssignment extends CustomerOption {
  vpIds: string[];
}
export type CustomerMeeting = Pick<
  Meeting,
  | "_id"
  | "topic"
  | "startTime"
  | "timezone"
  | "duration"
  | "status"
  | "zoomMeetingId"
  | "joinUrl"
  | "creatorName"
  | "creatorEmail"
  | "panelistName"
  | "panelistEmail"
  | "createdAt"
>;

export type MeetingView = "all" | "upcoming" | "past";

export function meetingPhase(meeting: Pick<Meeting, "startTime" | "duration" | "status">, now = Date.now()) {
  if (meeting.status !== "scheduled") return null;
  const start = new Date(meeting.startTime).getTime();
  if (start + meeting.duration * 60000 <= now) return "Past";
  return start <= now ? "In progress" : "Upcoming";
}

export function meetingTime(meeting: Pick<Meeting, "startTime" | "timezone">) {
  return new Intl.DateTimeFormat("en-IN", {
    timeZone: meeting.timezone,
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(meeting.startTime));
}
