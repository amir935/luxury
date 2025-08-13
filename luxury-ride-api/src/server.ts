import "dotenv/config";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import rateLimit from "express-rate-limit";
import { verifyMailer } from "./utils/mailer"; // <-- import this

import authRoutes from "./routes/auth";
import ridesRoutes from "./routes/rides";
import usersRoutes from "./routes/users";
import vehiclesRoutes from "./routes/vehicles";
import driversRoutes from "./routes/drivers";


const app = express();

app.use(express.json());
app.use(helmet());
app.use(cors({ origin: "*", methods: ["GET","POST","PUT","PATCH","DELETE","OPTIONS"], allowedHeaders: ["Content-Type","Authorization"] }));
app.use(morgan("dev"));
app.use(rateLimit({ windowMs: 60_000, max: 180 }));

app.get("/", (_req, res) => res.json({ ok: true }));

app.use("/auth", authRoutes);
app.use("/rides", ridesRoutes);
app.use("/users", usersRoutes);
app.use("/vehicles", vehiclesRoutes);
app.use("/drivers", driversRoutes);



app.use((err: any, _req: any, res: any, _next: any) => {
  console.error("Unhandled error:", err);
  res.status(err?.status || 500).json({ error: err?.message || "Server error" });
});

// Verify SMTP once at boot (after dotenv is loaded)
verifyMailer();

const port = Number(process.env.PORT || 4000);
app.listen(port, "0.0.0.0", () => {
  console.log(`API listening on http://localhost:${port}`);
});
