import nodemailer from "nodemailer";

export const sendInvitationEmail = async (
  email: string,
  invitationUrl: string
): Promise<void> => {
  if (
    !process.env.SMTP_HOST ||
    !process.env.SMTP_USER ||
    !process.env.SMTP_PASS ||
    !process.env.MAIL_FROM
  ) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("SMTP is not configured");
    }

    console.log("DEV invitation for:", email);
    console.log("DEV invitation URL:", invitationUrl);
    return;
  }

  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    secure: Number(process.env.SMTP_PORT || 587) === 465,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });

  await transporter.sendMail({
    from: process.env.MAIL_FROM,
    to: email,
    subject: "You're invited to join the platform",
    text: `Complete your account setup:\n${invitationUrl}\n\nThis invitation expires in 24 hours.`,
  });

  console.log("Invitation email sent to:", email);
};