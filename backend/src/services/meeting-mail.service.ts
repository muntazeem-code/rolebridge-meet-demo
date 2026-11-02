import nodemailer from "nodemailer";

export class MeetingMailError extends Error {
  constructor(message: string, public acceptedEmails: string[] = []) {
    super(message);
  }
}
export async function sendMeetingInvitation(meeting: {
  customerEmail: string;
  customerName: string;
  panelistEmail?: string;
  panelistName?: string;
  invitedEmails?: string[];
  creatorName: string;
  topic: string;
  startTime: Date;
  timezone: string;
  duration: number;
  joinUrl?: string;
}) {
  const recipients = [...new Set([meeting.customerEmail, meeting.panelistEmail]
    .filter((email): email is string => !!email))]
    .filter((email) => !(meeting.invitedEmails ?? []).includes(email));
  if (!recipients.length) return [];
  const { SMTP_HOST, SMTP_USER, SMTP_PASS, MAIL_FROM } = process.env;
  if (
    !SMTP_HOST ||
    !SMTP_USER ||
    !SMTP_PASS ||
    !MAIL_FROM ||
    !meeting.joinUrl
  ) {
    throw new MeetingMailError(
      "SMTP_NOT_CONFIGURED: Configure SMTP_HOST, SMTP_USER, SMTP_PASS and MAIL_FROM.",
    );
  }
  const port = Number(process.env.SMTP_PORT || 587);
  const transporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port,
    secure: port === 465,
    auth: { user: SMTP_USER, pass: SMTP_PASS },
    connectionTimeout: 10000,
    greetingTimeout: 10000,
    socketTimeout: 15000,
  });
  const localTime = new Intl.DateTimeFormat("en-IN", {
    timeZone: meeting.timezone,
    dateStyle: "full",
    timeStyle: "long",
  }).format(meeting.startTime);
  try {
    const info = await transporter.sendMail({
      from: MAIL_FROM,
      to: recipients,
      subject: "Meeting invitation: " + meeting.topic,
      text: `Hello,\n\n${meeting.creatorName} has scheduled a meeting with customer ${meeting.customerName}${meeting.panelistName ? ` and panelist ${meeting.panelistName}` : ""}.\n\nTopic: ${meeting.topic}\nWhen: ${localTime}\nTimezone: ${meeting.timezone}\nDuration: ${meeting.duration} minutes\n\nJoin Zoom: ${meeting.joinUrl}\n\nPlease use the participant link above.\n`,
    });
    const accepted = (info.accepted ?? []).map(String);
    if (recipients.some((email) => !accepted.includes(email))) {
      throw new MeetingMailError(
        "EMAIL_REJECTED: The mail server did not accept all participant invitations.",
        accepted,
      );
    }
    return accepted;
  } catch (error) {
    if (error instanceof MeetingMailError) throw error;
    const failure = error as { code?: string; responseCode?: number };
    const code = String(failure.code || "EMAIL_FAILED")
      .replace(/[^A-Z0-9_]/g, "")
      .slice(0, 40);
    // Store actionable codes, not raw SMTP replies, message bodies, or credentials.
    throw new MeetingMailError(
      code +
        (failure.responseCode ? " (SMTP " + failure.responseCode + ")" : "") +
        ": Invitation email failed. Check SMTP settings; Gmail requires an app password.",
    );
  } finally {
    transporter.close();
  }
}
