import { Router } from "express";
import { z } from "zod";
import { DASHBOARD_SLUG } from "../config/dashboardScope.js";
import { DEFAULT_DASHBOARD_SNAPSHOT } from "../lib/defaultSnapshot.js";
import {
  liveClickupDashboardService,
  type LiveDashboardStatus,
  type LiveSnapshotEvent,
} from "../services/liveClickupDashboard.js";
import {
  ensureSnapshot,
  getSnapshot,
  getSnapshotHistory,
  saveSnapshot,
} from "../storage/dashboardRepository.js";
import {
  dashboardSnapshotSchema,
  snapshotEnvelopeSchema,
  snapshotHistoryQuerySchema,
  snapshotQuerySchema,
  type SnapshotEnvelope,
} from "../schemas/dashboard.js";

export const dashboardRouter = Router();

function assertDashboardSlug(slug: string) {
  if (slug !== DASHBOARD_SLUG) {
    const error = new Error(`Invalid slug. Use ${DASHBOARD_SLUG}.`) as Error & { statusCode?: number };
    error.statusCode = 400;
    throw error;
  }
}

function parseWritePayload(body: unknown): SnapshotEnvelope {
  const envelope = snapshotEnvelopeSchema.safeParse(body);
  if (envelope.success) {
    return {
      ...envelope.data,
      slug: envelope.data.slug || DASHBOARD_SLUG,
    };
  }

  const rawSnapshot = dashboardSnapshotSchema.safeParse(body);
  if (rawSnapshot.success) {
    return {
      slug: DASHBOARD_SLUG,
      source: "manual",
      snapshot: rawSnapshot.data,
    };
  }

  throw rawSnapshot.error;
}

dashboardRouter.get("/snapshot", (req, res, next) => {
  try {
    const { slug } = snapshotQuerySchema.parse(req.query);
    const force =
      String(req.query.force || "").toLowerCase() === "true" || String(req.query.force || "") === "1";
    const resolvedSlug = slug || DASHBOARD_SLUG;
    assertDashboardSlug(resolvedSlug);

    const run = async () => {
      if (force) {
        await liveClickupDashboardService.refresh("force-query");
      }

      const snapshot = ensureSnapshot(resolvedSlug);
      const status = liveClickupDashboardService.getStatus();

      res.json({
        data: snapshot.payload,
        meta: {
          slug: snapshot.slug,
          source: snapshot.source,
          updatedAt: snapshot.updatedAt,
          realtime: true,
          sync: {
            healthy: status.healthy,
            lastSyncAt: status.lastSyncAt,
            lastError: status.lastError,
            version: status.version,
          },
        },
      });
    };

    void run().catch(next);
  } catch (error) {
    next(error);
  }
});

dashboardRouter.post("/snapshot", (req, res, next) => {
  try {
    const { slug, source, snapshot } = parseWritePayload(req.body);
    const resolvedSlug = slug || DASHBOARD_SLUG;
    assertDashboardSlug(resolvedSlug);

    const saved = saveSnapshot({
      slug: resolvedSlug,
      source,
      snapshot,
    });

    res.status(201).json({
      data: saved.payload,
      meta: {
        slug: saved.slug,
        source: saved.source,
        updatedAt: saved.updatedAt,
      },
    });
  } catch (error) {
    next(error);
  }
});

dashboardRouter.get("/snapshot/history", (req, res, next) => {
  try {
    const { slug, limit } = snapshotHistoryQuerySchema.parse(req.query);
    const resolvedSlug = slug || DASHBOARD_SLUG;
    assertDashboardSlug(resolvedSlug);
    const rows = getSnapshotHistory(resolvedSlug, limit);

    res.json({
      data: rows.map((row) => ({
        id: row.id,
        slug: row.slug,
        source: row.source,
        createdAt: row.createdAt,
        snapshot: row.payload,
      })),
    });
  } catch (error) {
    next(error);
  }
});

dashboardRouter.post("/refresh", (req, res, next) => {
  const trigger = String(req.body?.trigger || "manual-refresh").trim() || "manual-refresh";

  liveClickupDashboardService
    .refresh(trigger)
    .then((result) => {
      const snapshot = getSnapshot(DASHBOARD_SLUG) || ensureSnapshot(DASHBOARD_SLUG);
      res.json({
        ok: true,
        changed: result.changed,
        updatedAt: result.updatedAt,
        data: snapshot.payload,
        meta: {
          slug: snapshot.slug,
          source: snapshot.source,
          sync: liveClickupDashboardService.getStatus(),
        },
      });
    })
    .catch(next);
});

dashboardRouter.get("/status", (_req, res) => {
  const status = liveClickupDashboardService.getStatus();
  res.json({
    data: status,
  });
});

dashboardRouter.get("/stream", (req, res) => {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders?.();

  const send = (event: string, payload: unknown) => {
    res.write(`event: ${event}\n`);
    res.write(`data: ${JSON.stringify(payload)}\n\n`);
  };

  const snapshot = getSnapshot(DASHBOARD_SLUG) || ensureSnapshot(DASHBOARD_SLUG);
  send("connected", {
    connectedAt: new Date().toISOString(),
    slug: DASHBOARD_SLUG,
  });
  send("snapshot", {
    snapshot: snapshot.payload,
    meta: {
      slug: snapshot.slug,
      source: snapshot.source,
      updatedAt: snapshot.updatedAt,
      version: liveClickupDashboardService.getStatus().version,
    },
  });
  send("status", liveClickupDashboardService.getStatus());

  const onSnapshot = (event: LiveSnapshotEvent) => send("snapshot", event);
  const onStatus = (status: LiveDashboardStatus) => send("status", status);
  const onHeartbeat = (payload: unknown) => send("heartbeat", payload);

  liveClickupDashboardService.on("snapshot", onSnapshot);
  liveClickupDashboardService.on("status", onStatus);
  liveClickupDashboardService.on("heartbeat", onHeartbeat);

  req.on("close", () => {
    liveClickupDashboardService.off("snapshot", onSnapshot);
    liveClickupDashboardService.off("status", onStatus);
    liveClickupDashboardService.off("heartbeat", onHeartbeat);
    res.end();
  });
});

dashboardRouter.get("/snapshot/schema", (_req, res) => {
  const accentOptions = z.enum(["emerald", "violet", "amber", "blue", "rose"]).options;

  res.json({
    message: "Payload contract for /api/dashboard/snapshot",
    accentOptions,
    example: {
      slug: DASHBOARD_SLUG,
      source: "clickup-sync",
      snapshot: DEFAULT_DASHBOARD_SNAPSHOT,
    },
  });
});
