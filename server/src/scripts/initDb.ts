import "dotenv/config";
import { DASHBOARD_SLUG } from "../config/dashboardScope.js";
import { closeDatabase, getDatabaseFilePath, initDatabase } from "../storage/database.js";
import { ensureSnapshot } from "../storage/dashboardRepository.js";

initDatabase();
const snapshot = ensureSnapshot(DASHBOARD_SLUG);

console.log("Database file:", getDatabaseFilePath());
console.log("Default snapshot ready:", {
  slug: snapshot.slug,
  source: snapshot.source,
  updatedAt: snapshot.updatedAt,
});

closeDatabase();
