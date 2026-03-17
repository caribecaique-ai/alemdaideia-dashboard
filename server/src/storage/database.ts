import fs from "node:fs";
import { DatabaseSync } from "node:sqlite";
import path from "node:path";
import { fileURLToPath } from "node:url";

const sourceAwareRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const serverRoot =
  path.basename(sourceAwareRoot).toLowerCase() === "dist"
    ? path.dirname(sourceAwareRoot)
    : sourceAwareRoot;
const configuredPath = process.env.DATABASE_FILE?.trim() || "./data/dashboard.sqlite";
const databaseFile = path.isAbsolute(configuredPath)
  ? configuredPath
  : path.resolve(serverRoot, configuredPath);

fs.mkdirSync(path.dirname(databaseFile), { recursive: true });

export const db = new DatabaseSync(databaseFile);

export function initDatabase() {
  db.exec(`
    PRAGMA journal_mode = WAL;

    CREATE TABLE IF NOT EXISTS dashboard_snapshots (
      slug TEXT PRIMARY KEY,
      payload TEXT NOT NULL,
      source TEXT NOT NULL DEFAULT 'manual',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS dashboard_snapshot_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      slug TEXT NOT NULL,
      payload TEXT NOT NULL,
      source TEXT NOT NULL DEFAULT 'manual',
      created_at TEXT NOT NULL,
      FOREIGN KEY (slug) REFERENCES dashboard_snapshots(slug) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_snapshot_events_slug_created
      ON dashboard_snapshot_events (slug, created_at DESC, id DESC);
  `);
}

export function closeDatabase() {
  db.close();
}

export function getDatabaseFilePath() {
  return databaseFile;
}
