// src/lib/mailer.ts
import "dotenv/config";
import nodemailer from "nodemailer";

function assertGmailEnv() {
  const missing: string[] = [];
  if (!process.env.GMAIL_USER) missing.push("GMAIL_USER");
  if (!process.env.GMAIL_APP_PASSWORD) missing.push("GMAIL_APP_PASSWORD");
  if (missing.length) {
    const msg = `Missing env: ${missing.join(", ")}. For Gmail you need 2FA + App Password.`;
    throw new Error(msg);
  }
}

export async function createTransporter() {
  // Prefer Gmail if creds exist
  if (process.env.GMAIL_USER && process.env.GMAIL_APP_PASSWORD) {
    return nodemailer.createTransport({
      host: "smtp.gmail.com",
      port: 465,          // or 587 with secure:false
      secure: true,       // 465 = true, 587 = false (STARTTLS)
      auth: {
        user: process.env.GMAIL_USER!,
        pass: process.env.GMAIL_APP_PASSWORD!,
      },
    });
  }

  // Dev fallback: Ethereal (no real mail sent, preview URL is returned)
  const test = await nodemailer.createTestAccount();
  return nodemailer.createTransport({
    host: "smtp.ethereal.email",
    port: 587,
    secure: false,
    auth: { user: test.user, pass: test.pass },
  });
}

export async function verifyMailer() {
  try {
    const tx = await createTransporter();
    await tx.verify();
    console.log("SMTP OK ✅");
  } catch (err) {
    console.error("SMTP FAIL ❌", err);
  }
}

export async function sendEmail(to: string, subject: string, text: string, html?: string) {
  const tx = await createTransporter();
  const info = await tx.sendMail({
    from: process.env.MAIL_FROM || process.env.GMAIL_USER,
    to,
    subject,
    text,
    html: html ?? `<p>${text}</p>`,
  });

  // Log preview URL when using Ethereal
  // @ts-ignore
  const preview = (nodemailer as any).getTestMessageUrl?.(info);
  if (preview) console.log("Preview URL:", preview);
  console.log("MessageId:", info.messageId);
}
