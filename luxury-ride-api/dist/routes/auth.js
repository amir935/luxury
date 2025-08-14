"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerSchema = void 0;
const express_1 = require("express");
const prisma_1 = require("../lib/prisma");
const bcrypt_1 = __importDefault(require("bcrypt"));
const zod_1 = require("zod");
const jwt_1 = require("../lib/jwt");
const otp_1 = require("../utils/otp");
const time_1 = require("../utils/time");
const mailer_1 = require("../utils/mailer");
const auth_1 = require("../middleware/auth");
const router = (0, express_1.Router)();
const normalizeEtPhone = (v) => {
    const x = v.replace(/\s+/g, "");
    if (/^\+2519\d{8}$/.test(x))
        return x;
    if (/^2519\d{8}$/.test(x))
        return `+${x}`;
    if (/^09\d{8}$/.test(x))
        return `+251${x.slice(1)}`;
    if (/^9\d{8}$/.test(x))
        return `+251${x}`;
    return x;
};
const etPhoneSchema = zod_1.z
    .string()
    .min(9)
    .transform(normalizeEtPhone)
    .refine((v) => /^\+2519\d{8}$/.test(v), "Invalid Ethiopian phone (+2519XXXXXXXX)");
/** REGISTER: email OR phone */
exports.registerSchema = zod_1.z
    .object({
    name: zod_1.z.string(),
    email: zod_1.z.string().email().optional(),
    phone: zod_1.z.string().optional(),
    password: zod_1.z.string().min(6),
    role: zod_1.z.enum(["RIDER", "DRIVER", "ADMIN", "SUPER_ADMIN"]).optional(),
})
    .refine((data) => data.email || data.phone, { message: "Either email or phone must be provided" });
// routes/auth.ts (register)
router.post("/register", async (req, res) => {
    try {
        const body = exports.registerSchema.parse(req.body); // name, password, email? phone? role?
        // check uniqueness
        const where = body.email
            ? { email: body.email.toLowerCase() }
            : { phone: body.phone };
        const exists = await prisma_1.prisma.user.findFirst({ where, select: { id: true } });
        if (exists) {
            return res
                .status(409)
                .json({ error: `Account already exists with that ${body.email ? "email" : "phone"}` });
        }
        const passwordHash = await bcrypt_1.default.hash(body.password, 10);
        // prepare data (only include provided field)
        const createData = body.email
            ? {
                name: body.name,
                email: body.email.toLowerCase(),
                passwordHash,
                role: body.role ?? "RIDER",
            }
            : {
                name: body.name,
                phone: body.phone,
                passwordHash,
                role: body.role ?? "RIDER",
            };
        // ✅ CREATE the user
        const user = await prisma_1.prisma.user.create({
            data: createData,
            select: {
                id: true,
                name: true,
                email: true,
                phone: true,
                role: true,
                tokenVersion: true, // default 0
            },
        });
        // sign JWT with role + tokenVersion
        const token = (0, jwt_1.signToken)({
            id: user.id,
            role: user.role,
            tokenVersion: user.tokenVersion,
        });
        return res.status(201).json({ user, token });
    }
    catch (e) {
        console.error("REGISTER ERROR:", e);
        if (e?.issues)
            return res.status(400).json({ error: "Invalid input", details: e.issues });
        return res.status(500).json({ error: "Server error" });
    }
});
/** LOGIN: email OR phone (you already have this) */
const loginSchema = zod_1.z.union([
    zod_1.z.object({ email: zod_1.z.string().email(), password: zod_1.z.string().min(8) }),
    zod_1.z.object({ phone: etPhoneSchema, password: zod_1.z.string().min(8) }),
]);
router.post("/login", async (req, res) => {
    try {
        const body = loginSchema.parse(req.body);
        const where = "email" in body ? { email: body.email.toLowerCase() } : { phone: body.phone };
        const user = await prisma_1.prisma.user.findFirst({
            where,
            select: { id: true, name: true, email: true, phone: true, role: true, passwordHash: true, tokenVersion: true }
        });
        if (!user || !user.passwordHash)
            return res.status(401).json({ error: "Invalid credentials" });
        const ok = await bcrypt_1.default.compare(body.password, user.passwordHash);
        if (!ok)
            return res.status(401).json({ error: "Invalid credentials" });
        const token = (0, jwt_1.signToken)({ id: user.id, role: user.role, tokenVersion: user.tokenVersion });
        res.json({ user: { id: user.id, name: user.name, email: user.email, phone: user.phone, role: user.role }, token });
    }
    catch (e) {
        if (e?.issues)
            return res.status(400).json({ error: "Invalid input" });
        return res.status(500).json({ error: "Server error" });
    }
});
router.get("/me", auth_1.requireAuth, async (req, res) => {
    const user = await prisma_1.prisma.user.findUnique({
        where: { id: req.userId },
        select: { id: true, email: true, role: true }
    });
    res.json({ user });
});
// or sendSMS
/**
 * body: { userId: number, channel: "email" | "sms", sentTo: string }
 * - channel "email": sentTo must be the user's email
 * - channel "sms": sentTo must be the user's phone
 */
router.post("/verification/request", async (req, res) => {
    const { userId, channel, sentTo } = req.body;
    const user = await prisma_1.prisma.user.findUnique({ where: { id: userId } });
    if (!user)
        return res.status(404).json({ message: "User not found" });
    // Throttle: check for unexpired, unconsumed code
    const existing = await prisma_1.prisma.verificationCode.findFirst({
        where: { userId, channel, sentTo, consumed: false, expiresAt: { gt: new Date() } },
        orderBy: { createdAt: "desc" },
    });
    if (existing)
        return res.status(429).json({ message: "Code already sent. Try again later." });
    const code = (0, otp_1.genCode)();
    const expiresAt = (0, time_1.inMinutes)(10);
    await prisma_1.prisma.verificationCode.create({
        data: { userId, channel, sentTo, code, expiresAt },
    });
    const msg = `Your ${process.env.APP_NAME} verification code is ${code}. It expires in 10 minutes.`;
    if (channel === "email")
        await (0, mailer_1.sendEmail)(sentTo, "Your verification code", msg);
    else /* await sendSMS(sentTo, msg) */
        null;
    res.json({ message: "Verification code sent" });
});
router.post("/verification/confirm", async (req, res) => {
    const { userId, channel, sentTo, code } = req.body;
    const vc = await prisma_1.prisma.verificationCode.findFirst({
        where: { userId, channel, sentTo, consumed: false },
        orderBy: { createdAt: "desc" },
    });
    if (!vc)
        return res.status(400).json({ message: "No code to verify" });
    if (vc.expiresAt < new Date())
        return res.status(410).json({ message: "Code expired" });
    // attempts limit
    if (vc.attempts >= 5)
        return res.status(429).json({ message: "Too many attempts" });
    const isMatch = vc.code === code;
    await prisma_1.prisma.verificationCode.update({
        where: { id: vc.id },
        data: { attempts: { increment: 1 }, consumed: isMatch ? true : false },
    });
    if (!isMatch)
        return res.status(400).json({ message: "Invalid code" });
    // mark user verified
    await prisma_1.prisma.user.update({ where: { id: userId }, data: { isVerified: true } });
    res.json({ message: "Verified" });
});
/** body: { email: string } */
router.post("/forgot", async (req, res) => {
    const { email } = req.body;
    const user = await prisma_1.prisma.user.findUnique({ where: { email } });
    // Always respond 200 to avoid user enumeration
    if (!user)
        return res.json({ message: "If the account exists, a code has been sent" });
    const code = (0, otp_1.genCode)();
    await prisma_1.prisma.passwordReset.create({
        data: {
            userId: user.id,
            code,
            channel: "email",
            sentTo: email,
            expiresAt: (0, time_1.inMinutes)(15),
        },
    });
    try {
        await (0, mailer_1.sendEmail)(email, "Password reset code", `Your reset code is ${code}. It expires in 15 minutes.`);
    }
    catch (err) {
        console.warn("Email send failed (dev ok):", err.message);
        // Do NOT throw; we still created the code and replied
    }
    return res.json({ message: "If the account exists, a code has been sent" });
});
router.post("/verify", async (req, res) => {
    const { email, code } = req.body;
    const user = await prisma_1.prisma.user.findUnique({ where: { email } });
    if (!user)
        return res.status(400).json({ message: "Invalid" });
    const pr = await prisma_1.prisma.passwordReset.findFirst({
        where: { userId: user.id, sentTo: email, consumed: false },
        orderBy: { createdAt: "desc" },
    });
    if (!pr)
        return res.status(400).json({ message: "No code found" });
    if (pr.expiresAt < new Date())
        return res.status(410).json({ message: "Code expired" });
    if (pr.attempts >= 5)
        return res.status(429).json({ message: "Too many attempts" });
    const ok = pr.code === code;
    await prisma_1.prisma.passwordReset.update({
        where: { id: pr.id },
        data: { attempts: { increment: 1 }, consumed: ok ? true : false },
    });
    if (!ok)
        return res.status(400).json({ message: "Invalid code" });
    res.json({ message: "Code verified" });
});
router.post("/reset", async (req, res) => {
    const { email, code, newPassword } = req.body;
    const user = await prisma_1.prisma.user.findUnique({ where: { email } });
    if (!user)
        return res.status(400).json({ message: "Invalid" });
    const pr = await prisma_1.prisma.passwordReset.findFirst({
        where: { userId: user.id, sentTo: email, consumed: false },
        orderBy: { createdAt: "desc" },
    });
    if (!pr)
        return res.status(400).json({ message: "Invalid or already used" });
    if (pr.expiresAt < new Date())
        return res.status(410).json({ message: "Code expired" });
    if (pr.attempts >= 5)
        return res.status(429).json({ message: "Too many attempts" });
    if (pr.code !== code) {
        await prisma_1.prisma.passwordReset.update({ where: { id: pr.id }, data: { attempts: { increment: 1 } } });
        return res.status(400).json({ message: "Invalid code" });
    }
    const passwordHash = await bcrypt_1.default.hash(newPassword, 10);
    await prisma_1.prisma.$transaction([
        prisma_1.prisma.user.update({ where: { id: user.id }, data: { passwordHash } }),
        prisma_1.prisma.passwordReset.update({ where: { id: pr.id }, data: { consumed: true, attempts: { increment: 1 } } }),
    ]);
    res.json({ message: "Password updated" });
});
router.patch("/change", async (req, res) => {
    const userId = req.user.sub; // from JWT
    const { currentPassword, newPassword } = req.body;
    const user = await prisma_1.prisma.user.findUnique({ where: { id: Number(userId) } });
    if (!user || !user.passwordHash)
        return res.status(401).json({ message: "Unauthorized" });
    const ok = await bcrypt_1.default.compare(currentPassword, user.passwordHash);
    if (!ok)
        return res.status(400).json({ message: "Current password incorrect" });
    const passwordHash = await bcrypt_1.default.hash(newPassword, 10);
    await prisma_1.prisma.user.update({ where: { id: user.id }, data: { passwordHash } });
    res.json({ message: "Password changed" });
});
router.post("/logout", auth_1.requireAuth, async (req, res) => {
    if (!req.userId)
        return res.status(401).json({ error: "Missing user" });
    await prisma_1.prisma.user.update({
        where: { id: req.userId }, // ✅ now defined
        data: { tokenVersion: { increment: 1 } } // per-user revocation
    });
    return res.status(204).end();
});
exports.default = router;
