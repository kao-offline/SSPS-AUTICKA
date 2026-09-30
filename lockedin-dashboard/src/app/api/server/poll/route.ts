import { apiErrorStatus, apiErrorMessage } from '@/lib/api-errors';
import { getConvexUrl } from '@/lib/convex-url';
﻿import { NextRequest, NextResponse } from "next/server";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../../../../../convex/_generated/api";

const convex = new ConvexHttpClient(getConvexUrl());

function getBearerToken(request: NextRequest) {
  const header = request.headers.get("authorization") || "";
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || null;
}

export async function POST(request: NextRequest) {
  try {
    const tokenFromHeader = getBearerToken(request);
    const body = await request.json().catch(() => ({}));

    const token = String(tokenFromHeader || body?.token || "").trim();
    if (!token) {
      return NextResponse.json({ error: "Missing server token" }, { status: 401 });
    }

    const status = typeof body?.status === "string" ? body.status : undefined;
    const serverInfo = body?.serverInfo;
    const publicIp =
      typeof body?.publicIp === "string"
        ? body.publicIp
        : typeof serverInfo?.publicIp === "string"
          ? serverInfo.publicIp
          : undefined;
    const knownModules = Array.isArray(body?.knownModules)
      ? body.knownModules
          .filter((k: any) => k && typeof k.moduleId === "string")
          .map((k: any) => ({
            moduleId: String(k.moduleId),
            version: typeof k.version === "string" ? k.version : undefined,
          }))
      : undefined;

    const tunnelUrl = typeof body?.tunnelUrl === "string" ? body.tunnelUrl : undefined;

    const result = await convex.mutation(api.servers.pollFromServer, {
      token,
      status,
      ...(serverInfo !== undefined ? { serverInfo } : {}),
      ...(publicIp ? { publicIp } : {}),
      ...(tunnelUrl ? { tunnelUrl } : {}),
      ...(knownModules ? { knownModules } : {}),
    });

    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: apiErrorMessage(error) },
      { status: apiErrorStatus(error) }
    );
  }
}
