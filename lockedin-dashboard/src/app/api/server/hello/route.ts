import { apiErrorStatus, apiErrorMessage } from '@/lib/api-errors';
import { getConvexUrl } from '@/lib/convex-url';
﻿import { NextRequest, NextResponse } from "next/server";
import { ConvexHttpClient } from "convex/browser";
import { api } from "../../../../../convex/_generated/api";

const convex = new ConvexHttpClient(getConvexUrl());

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    const serverInstanceId = String(body?.serverInstanceId || "").trim();
    const bindKeyHash = String(body?.bindKeyHash || "").trim();

    if (!serverInstanceId || !bindKeyHash) {
      return NextResponse.json(
        { error: "serverInstanceId and bindKeyHash are required" },
        { status: 400 }
      );
    }

    const serverInfo = body?.serverInfo;
    const publicIp =
      typeof body?.publicIp === "string"
        ? body.publicIp
        : typeof serverInfo?.publicIp === "string"
          ? serverInfo.publicIp
          : undefined;
    const tunnelUrl = typeof body?.tunnelUrl === "string" ? body.tunnelUrl : undefined;

    const result = await convex.mutation(api.servers.helloFromServer, {
      serverInstanceId,
      bindKeyHash,
      serverInfo,
      capabilities: body?.capabilities,
      ...(publicIp ? { publicIp } : {}),
      ...(tunnelUrl ? { tunnelUrl } : {}),
    });

    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: apiErrorMessage(error) },
      { status: apiErrorStatus(error) }
    );
  }
}
