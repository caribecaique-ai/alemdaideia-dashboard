import { DEFAULT_DASHBOARD_SNAPSHOT } from "../lib/defaultSnapshot.js";
import {
  dashboardSnapshotSchema,
  type DashboardSnapshot,
} from "../schemas/dashboard.js";
import { db, initDatabase } from "./database.js";

interface SnapshotRow {
  slug: string;
  payload: string;
  source: string;
  created_at: string;
  updated_at: string;
}

interface SnapshotEventRow {
  id: number;
  slug: string;
  payload: string;
  source: string;
  created_at: string;
}

export interface SnapshotRecord {
  slug: string;
  source: string;
  payload: DashboardSnapshot;
  createdAt: string;
  updatedAt: string;
}

export interface SnapshotEventRecord {
  id: number;
  slug: string;
  source: string;
  payload: DashboardSnapshot;
  createdAt: string;
}

interface SaveSnapshotInput {
  slug: string;
  source: string;
  snapshot: DashboardSnapshot;
}

initDatabase();

function nowIso(): string {
  return new Date().toISOString();
}

function parseSnapshotPayload(rawPayload: string): DashboardSnapshot {
  const parsed = JSON.parse(rawPayload) as unknown;
  return dashboardSnapshotSchema.parse(parsed);
}

function serializeSnapshot(snapshot: DashboardSnapshot): string {
  return JSON.stringify(snapshot);
}

function mapSnapshotRow(row: SnapshotRow): SnapshotRecord {
  return {
    slug: row.slug,
    source: row.source,
    payload: parseSnapshotPayload(row.payload),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

const getSnapshotStmt = db.prepare(`
  SELECT slug, payload, source, created_at, updated_at
  FROM dashboard_snapshots
  WHERE slug = ?
`);

const upsertSnapshotStmt = db.prepare(`
  INSERT INTO dashboard_snapshots (slug, payload, source, created_at, updated_at)
  VALUES (?, ?, ?, ?, ?)
  ON CONFLICT(slug) DO UPDATE SET
    payload = excluded.payload,
    source = excluded.source,
    updated_at = excluded.updated_at
`);

const insertEventStmt = db.prepare(`
  INSERT INTO dashboard_snapshot_events (slug, payload, source, created_at)
  VALUES (?, ?, ?, ?)
`);

const historyStmt = db.prepare(`
  SELECT id, slug, payload, source, created_at
  FROM dashboard_snapshot_events
  WHERE slug = ?
  ORDER BY created_at DESC, id DESC
  LIMIT ?
`);

export function getSnapshot(slug: string): SnapshotRecord | null {
  const row = getSnapshotStmt.get(slug) as SnapshotRow | undefined;
  if (!row) {
    return null;
  }

  return mapSnapshotRow(row);
}

export function saveSnapshot(input: SaveSnapshotInput): SnapshotRecord {
  const snapshot = dashboardSnapshotSchema.parse(input.snapshot);
  const payload = serializeSnapshot(snapshot);
  const now = nowIso();

  db.exec("BEGIN");
  try {
    upsertSnapshotStmt.run(input.slug, payload, input.source, now, now);
    insertEventStmt.run(input.slug, payload, input.source, now);
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }

  const stored = getSnapshot(input.slug);
  if (!stored) {
    throw new Error(`Snapshot ${input.slug} could not be loaded after save.`);
  }

  return stored;
}

export function ensureSnapshot(slug: string): SnapshotRecord {
  const existing = getSnapshot(slug);
  if (existing) {
    return existing;
  }

  return saveSnapshot({
    slug,
    source: "seed",
    snapshot: DEFAULT_DASHBOARD_SNAPSHOT,
  });
}

export function getSnapshotHistory(slug: string, limit: number): SnapshotEventRecord[] {
  const rows = historyStmt.all(slug, limit) as unknown as SnapshotEventRow[];

  return rows.map((row) => ({
    id: row.id,
    slug: row.slug,
    source: row.source,
    payload: parseSnapshotPayload(row.payload),
    createdAt: row.created_at,
  }));
}
