import "dotenv/config";
import cors from "cors";
import express from "express";
import { ZodError } from "zod";
import { DASHBOARD_SLUG } from "./config/dashboardScope.js";
import { dashboardRouter } from "./routes/dashboard.js";
import { liveClickupDashboardService } from "./services/liveClickupDashboard.js";
import { closeDatabase, getDatabaseFilePath, initDatabase } from "./storage/database.js";
import { ensureSnapshot } from "./storage/dashboardRepository.js";

const app = express();
const port = Number(process.env.PORT ?? 3000);
const allowedOrigins = (process.env.CORS_ORIGIN ?? "http://localhost:5173")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
        return;
      }

      callback(new Error(`Origin not allowed by CORS: ${origin}`));
    },
  }),
);
app.use(express.json({ limit: "2mb" }));

initDatabase();
ensureSnapshot(DASHBOARD_SLUG);

app.get("/api/health", (_req, res) => {
  const liveStatus = liveClickupDashboardService.getStatus();
  res.json({
    status: "ok",
    timestamp: new Date().toISOString(),
    live: liveStatus,
  });
});

app.use("/api/dashboard", dashboardRouter);

app.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  if (
    error &&
    typeof error === "object" &&
    "statusCode" in error &&
    typeof (error as { statusCode?: unknown }).statusCode === "number" &&
    error instanceof Error
  ) {
    res.status((error as Error & { statusCode: number }).statusCode).json({
      error: error.message,
    });
    return;
  }

  if (error instanceof ZodError) {
    res.status(400).json({
      error: "Invalid request data.",
      details: error.issues,
    });
    return;
  }

  if (error instanceof Error && error.message.startsWith("Origin not allowed by CORS")) {
    res.status(403).json({
      error: error.message,
    });
    return;
  }

  console.error(error);
  res.status(500).json({
    error: "Internal server error.",
  });
});

const server = app.listen(port, () => {
  console.log(`Dashboard API listening on http://localhost:${port}`);
  console.log(`SQLite file: ${getDatabaseFilePath()}`);
  liveClickupDashboardService.start();
});

function shutdown(signal: string) {
  console.log(`${signal} received. Closing API...`);
  server.close(() => {
    liveClickupDashboardService.stop();
    closeDatabase();
    process.exit(0);
  });
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
