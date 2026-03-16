import { ALEMDAIDEIA_DASHBOARD_MOCK } from "../data/mockDashboard";
import type { DashboardSnapshot } from "../types/dashboard";

// This indirection keeps the current prototype mock-based while leaving a single
// handoff point for the future Ruby/ClickUp integration.
export function getDashboardSnapshot(): DashboardSnapshot {
  return ALEMDAIDEIA_DASHBOARD_MOCK;
}
