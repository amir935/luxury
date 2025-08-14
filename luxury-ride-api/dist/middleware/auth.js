"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.requireAuth = requireAuth;
// middleware/requireAuth.ts
const jwt_1 = require("../lib/jwt");
const prisma_1 = require("../lib/prisma");
async function requireAuth(req, res, next) {
    try {
        const header = req.headers.authorization;
        if (!header?.startsWith("Bearer "))
            return res.status(401).json({ error: "Missing token" });
        const token = header.split(" ")[1];
        const payload = (0, jwt_1.verifyToken)(token);
        // if you implemented tokenVersion, you can also load user to compare tv here
        const user = await prisma_1.prisma.user.findUnique({
            where: { id: payload.userId },
            select: { role: true, tokenVersion: true },
        });
        if (!user)
            return res.status(401).json({ error: "User not found" });
        // (optional) if using tokenVersion revocation:
        // if ((user.tokenVersion ?? 0) !== (payload.tv ?? 0)) return res.status(401).json({ error: "Token revoked" });
        req.userId = payload.userId;
        req.userRole = user.role;
        next();
    }
    catch {
        return res.status(401).json({ error: "Invalid token" });
    }
}
