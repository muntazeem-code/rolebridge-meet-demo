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
  data: Meeting[];
  page: number;
  total: number;
  totalPages: number;
  requests?: Meeting[];
}
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
  | "createdAt"
>;

export function meetingTime(meeting: Pick<Meeting, "startTime" | "timezone">) {
  return new Intl.DateTimeFormat("en-IN", {
    timeZone: meeting.timezone,
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(meeting.startTime));
}
