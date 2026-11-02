"use client";

import { useCallback, useEffect, useState } from "react";
import { ShieldAlert } from "lucide-react";
import { toast } from "@/lib/toast";
import { FALLBACK_UNITS } from "@tusker/core/lib/procurement/units";

/** fetch + `{ success, data, error }` unwrapping used by the BOQ and rate-sheet pages. */
export async function apiJson<T = any>(url: string, init?: RequestInit & { json?: unknown }): Promise<T> {
  const { json, ...rest } = init ?? {};
  const res = await fetch(url, {
    ...rest,
    ...(json !== undefined
      ? { body: JSON.stringify(json), headers: { "Content-Type": "application/json", ...(rest.headers ?? {}) } }
      : {}),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || body.success === false) throw new Error(body.error || body.message || `Request failed (${res.status})`);
  return body.data as T;
}

export const toastError = (e: unknown, fallback: string) => toast.error(e instanceof Error ? e.message : fallback);

export type Trade = { id: string; name: string };

export function useTrades(workspaceId: string) {
  const [trades, setTrades] = useState<Trade[]>([]);
  const reload = useCallback(
    () =>
      apiJson<Trade[]>(`/api/v1/procurement/trades?w=${workspaceId}`)
        .then(setTrades)
        .catch((e) => toastError(e, "Could not load departments")),
    [workspaceId]
  );
  useEffect(() => {
    let live = true;
    apiJson<Trade[]>(`/api/v1/procurement/trades?w=${workspaceId}`)
      .then((list) => live && setTrades(list))
      .catch((e) => toastError(e, "Could not load departments"));
    return () => {
      live = false;
    };
  }, [workspaceId]);

  const addTrade = async (name: string) => {
    const trade = await apiJson<Trade>(`/api/v1/procurement/trades?w=${workspaceId}`, { method: "POST", json: { name } });
    setTrades((list) => (list.some((t) => t.id === trade.id) ? list : [...list, trade]));
    return trade;
  };
  return { trades, addTrade, reload };
}

/** Units a rate is commonly quoted in, plus the workspace's own catalogue. */
const BOQ_UNITS = [
  { abbreviation: "nos", name: "Numbers" },
  { abbreviation: "rft", name: "Running feet" },
  { abbreviation: "rmt", name: "Running metre" },
  { abbreviation: "sqft", name: "Square feet" },
  { abbreviation: "sqm", name: "Square metre" },
  { abbreviation: "cft", name: "Cubic feet" },
  { abbreviation: "cum", name: "Cubic metre" },
  { abbreviation: "set", name: "Set" },
  { abbreviation: "job", name: "Job / lump sum" },
];

export function useRateUnits(workspaceId: string) {
  const [units, setUnits] = useState(BOQ_UNITS);
  useEffect(() => {
    fetch(`/api/v1/procurement/indents/units?w=${workspaceId}`)
      .then((r) => r.json())
      .then((body) => {
        const list: { abbreviation: string; name: string }[] = Array.isArray(body?.data) && body.data.length ? body.data : FALLBACK_UNITS;
        const seen = new Set(BOQ_UNITS.map((u) => u.abbreviation.toLowerCase()));
        setUnits([...BOQ_UNITS, ...list.filter((u) => !seen.has(u.abbreviation.toLowerCase()))]);
      })
      .catch(() => {});
  }, [workspaceId]);
  return units;
}

export function NoAccess({ what }: { what: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-16 text-center text-muted-foreground">
      <ShieldAlert className="size-8" />
      <p className="text-sm">You don&apos;t have access to {what}. An owner or admin can turn it on in Settings → Permissions.</p>
    </div>
  );
}
