import { NextRequest, NextResponse } from "next/server";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../../../../../convex/_generated/api";
import { getConvexUrl } from "@/lib/convex-url";
import { apiErrorStatus, apiErrorMessage } from "@/lib/api-errors";

// Direct-contact proxy: dashboard -> on-site agent via tunnel.
// No Convex reads here by design (this is what kills the polling spam).
// The agent /status endpoint is public (instance id + module ids only),
// the tunnel URL itself (unguessable) is the access control.
const ALLOWED_TUNNEL_SUFFIXES = [".trycloudflare.com", ".loca.lt"];

function isAllowedTunnel(url: string): boolean {
  try {
    const u = new URL(url);
    if (u.protocol !== "https:") return false;
    return ALLOWED_TUNNEL_SUFFIXES.some((s) => u.hostname.endsWith(s));
  } catch {
    return false;
  }
}

export async function POST(request: NextRequest) {
  const token = request.headers.get('authorization')?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!token) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  try {
    const convex = new ConvexHttpClient(getConvexUrl());
    convex.setAuth(token);
    await convex.query(api.servers.assertAdmin, {});
    const body = await request.json().catch(() => ({}));
    const tunnelUrl = String(body?.tunnelUrl || "").trim().replace(/\/+$/, "");

    if (!tunnelUrl || !isAllowedTunnel(tunnelUrl)) {
      return NextResponse.json({ error: "Valid tunnel URL required (trycloudflare.com / loca.lt)" }, { status: 400 });
    }

    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 8000);
    try {
      const resp = await fetch(`${tunnelUrl}/status`, {
        signal: ctrl.signal,
        headers: { Accept: "application/json" },
        redirect: "error",
      });
      const data = await resp.json().catch(() => ({}));
      return NextResponse.json(
        { ok: resp.ok, direct: true, status: resp.status, data },
        { status: resp.ok ? 200 : 502 },
      );
    } finally {
      clearTimeout(timer);
    }
  } catch (error) {
    const msg = apiErrorMessage(error);
    const timeout = /abort/i.test(msg);
    return NextResponse.json(
      { ok: false, direct: true, error: timeout ? "Tunnel timeout (server offline?)" : msg },
      { status: timeout ? 504 : apiErrorStatus(error) === 500 ? 502 : apiErrorStatus(error) },
    );
  }
}
