import { ALEMDAIDEIA_DASHBOARD_MOCK } from "../data/mockDashboard";
import type { DashboardSnapshot } from "../types/dashboard";

interface DashboardSnapshotResponse {
  data: DashboardSnapshot;
}

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL?.trim() ?? "";

function buildSnapshotUrl(): string {
  return `${apiBaseUrl.replace(/\/+$/, "")}/api/dashboard/snapshot`;
}

function buildStreamUrl(): string {
  return `${apiBaseUrl.replace(/\/+$/, "")}/api/dashboard/stream`;
}

interface StreamSnapshotEvent {
  snapshot?: DashboardSnapshot;
  data?: DashboardSnapshot;
}

interface StreamConnectedEvent {
  connectedAt?: string;
}

interface StreamHeartbeatEvent {
  syncAt?: string;
  changed?: boolean;
}

// This keeps the prototype mock-safe while allowing backend integration when available.
export async function getDashboardSnapshot(): Promise<DashboardSnapshot> {
  if (!apiBaseUrl) {
    return ALEMDAIDEIA_DASHBOARD_MOCK;
  }

  try {
    const response = await fetch(buildSnapshotUrl(), {
      method: "GET",
      headers: {
        Accept: "application/json",
      },
    });

    if (!response.ok) {
      throw new Error(`Dashboard API returned ${response.status}`);
    }

    const payload = (await response.json()) as DashboardSnapshotResponse;
    if (!payload?.data) {
      throw new Error("Dashboard API payload does not include data.");
    }

    return payload.data;
  } catch (error) {
    console.warn("Falling back to local mock dashboard snapshot.", error);
    return ALEMDAIDEIA_DASHBOARD_MOCK;
  }
}

export function subscribeDashboardSnapshotStream(handlers: {
  onSnapshot: (snapshot: DashboardSnapshot) => void;
  onConnected?: (event: StreamConnectedEvent) => void;
  onHeartbeat?: (event: StreamHeartbeatEvent) => void;
  onError?: (error: Event) => void;
}): () => void {
  if (!apiBaseUrl || typeof window === "undefined" || typeof window.EventSource === "undefined") {
    return () => undefined;
  }

  const eventSource = new EventSource(buildStreamUrl());

  const snapshotHandler = (event: MessageEvent<string>) => {
    try {
      const payload = JSON.parse(event.data) as StreamSnapshotEvent;
      const snapshot = payload.snapshot || payload.data;
      if (snapshot) {
        handlers.onSnapshot(snapshot);
      }
    } catch (error) {
      console.warn("Failed to parse dashboard stream snapshot payload.", error);
    }
  };

  const connectedHandler = (event: MessageEvent<string>) => {
    try {
      handlers.onConnected?.(JSON.parse(event.data) as StreamConnectedEvent);
    } catch {
      handlers.onConnected?.({});
    }
  };

  const heartbeatHandler = (event: MessageEvent<string>) => {
    try {
      handlers.onHeartbeat?.(JSON.parse(event.data) as StreamHeartbeatEvent);
    } catch {
      handlers.onHeartbeat?.({});
    }
  };

  const errorHandler = (event: Event) => {
    handlers.onError?.(event);
  };

  eventSource.addEventListener("snapshot", snapshotHandler as EventListener);
  eventSource.addEventListener("connected", connectedHandler as EventListener);
  eventSource.addEventListener("heartbeat", heartbeatHandler as EventListener);
  eventSource.addEventListener("error", errorHandler);

  return () => {
    eventSource.removeEventListener("snapshot", snapshotHandler as EventListener);
    eventSource.removeEventListener("connected", connectedHandler as EventListener);
    eventSource.removeEventListener("heartbeat", heartbeatHandler as EventListener);
    eventSource.removeEventListener("error", errorHandler);
    eventSource.close();
  };
}
