"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
require("dotenv/config");
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const helmet_1 = __importDefault(require("helmet"));
const morgan_1 = __importDefault(require("morgan"));
const express_rate_limit_1 = __importDefault(require("express-rate-limit"));
const mailer_1 = require("./utils/mailer"); // <-- import this
const auth_1 = __importDefault(require("./routes/auth"));
const rides_1 = __importDefault(require("./routes/rides"));
const users_1 = __importDefault(require("./routes/users"));
const vehicles_1 = __importDefault(require("./routes/vehicles"));
const drivers_1 = __importDefault(require("./routes/drivers"));
const app = (0, express_1.default)();
app.use(express_1.default.json());
app.use((0, helmet_1.default)());
app.use((0, cors_1.default)({ origin: "*", methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"], allowedHeaders: ["Content-Type", "Authorization"] }));
app.use((0, morgan_1.default)("dev"));
app.use((0, express_rate_limit_1.default)({ windowMs: 60_000, max: 180 }));
app.get("/", (_req, res) => res.json({ ok: true }));
app.use("/auth", auth_1.default);
app.use("/rides", rides_1.default);
app.use("/users", users_1.default);
app.use("/vehicles", vehicles_1.default);
app.use("/drivers", drivers_1.default);
app.use((err, _req, res, _next) => {
    console.error("Unhandled error:", err);
    res.status(err?.status || 500).json({ error: err?.message || "Server error" });
});
// Verify SMTP once at boot (after dotenv is loaded)
(0, mailer_1.verifyMailer)();
const port = Number(process.env.PORT || 4000);
app.listen(port, "0.0.0.0", () => {
    console.log(`API listening on http://localhost:${port}`);
});
