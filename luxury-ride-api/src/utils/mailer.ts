import nodemailer from "nodemailer";

export const transporter = nodemailer.createTransport({
  host: "smtp.gmail.com",
  port: 465,
  secure: true,
  auth: {
    user: process.env.GMAIL_USER!,
    pass: process.env.GMAIL_APP_PASSWORD!, // Gmail App Password (16 chars)
  },
});

export async function verifyMailer() {
  try {
    await transporter.verify();
    console.log("SMTP OK ✅");
  } catch (err) {
    console.error("SMTP FAIL ❌", err);
  }
}

export async function sendEmail(to: string, subject: string, text: string, html?: string) {
  const info = await transporter.sendMail({
    from: process.env.MAIL_FROM || process.env.GMAIL_USER,
    to,
    subject,
    text,
    html: html ?? `<p>${text}</p>`,
  });
  console.log("Gmail messageId:", info.messageId);
}
