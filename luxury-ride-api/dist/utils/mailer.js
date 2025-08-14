"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createTransporter = createTransporter;
exports.verifyMailer = verifyMailer;
exports.sendEmail = sendEmail;
// src/lib/mailer.ts
require("dotenv/config");
const nodemailer_1 = __importDefault(require("nodemailer"));
function assertGmailEnv() {
    const missing = [];
    if (!process.env.GMAIL_USER)
        missing.push("GMAIL_USER");
    if (!process.env.GMAIL_APP_PASSWORD)
        missing.push("GMAIL_APP_PASSWORD");
    if (missing.length) {
        const msg = `Missing env: ${missing.join(", ")}. For Gmail you need 2FA + App Password.`;
        throw new Error(msg);
    }
}
async function createTransporter() {
    // Prefer Gmail if creds exist
    if (process.env.GMAIL_USER && process.env.GMAIL_APP_PASSWORD) {
        return nodemailer_1.default.createTransport({
            host: "smtp.gmail.com",
            port: 465, // or 587 with secure:false
            secure: true, // 465 = true, 587 = false (STARTTLS)
            auth: {
                user: process.env.GMAIL_USER,
                pass: process.env.GMAIL_APP_PASSWORD,
            },
        });
    }
    // Dev fallback: Ethereal (no real mail sent, preview URL is returned)
    const test = await nodemailer_1.default.createTestAccount();
    return nodemailer_1.default.createTransport({
        host: "smtp.ethereal.email",
        port: 587,
        secure: false,
        auth: { user: test.user, pass: test.pass },
    });
}
async function verifyMailer() {
    try {
        const tx = await createTransporter();
        await tx.verify();
        console.log("SMTP OK ✅");
    }
    catch (err) {
        console.error("SMTP FAIL ❌", err);
    }
}
async function sendEmail(to, subject, text, html) {
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
    const preview = nodemailer_1.default.getTestMessageUrl?.(info);
    if (preview)
        console.log("Preview URL:", preview);
    console.log("MessageId:", info.messageId);
}
