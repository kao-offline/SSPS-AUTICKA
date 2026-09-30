import { apiErrorStatus, apiErrorMessage } from '@/lib/api-errors';
import { getConvexUrl } from '@/lib/convex-url';
﻿import { NextRequest, NextResponse } from 'next/server';
import { ConvexHttpClient } from 'convex/browser';
import { api } from '../../../../../convex/_generated/api';

const convex = new ConvexHttpClient(getConvexUrl());

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ pluginAlias: string; endpoint: string }> | { pluginAlias: string; endpoint: string } }
) {
  const resolvedParams = await params;
  return handlePluginApiRequest(request, resolvedParams, 'GET');
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ pluginAlias: string; endpoint: string }> | { pluginAlias: string; endpoint: string } }
) {
  const resolvedParams = await params;
  return handlePluginApiRequest(request, resolvedParams, 'POST');
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ pluginAlias: string; endpoint: string }> | { pluginAlias: string; endpoint: string } }
) {
  const resolvedParams = await params;
  return handlePluginApiRequest(request, resolvedParams, 'PUT');
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ pluginAlias: string; endpoint: string }> | { pluginAlias: string; endpoint: string } }
) {
  const resolvedParams = await params;
  return handlePluginApiRequest(request, resolvedParams, 'DELETE');
}

async function handlePluginApiRequest(
  request: NextRequest,
  params: { pluginAlias: string; endpoint: string },
  method: string
) {
  try {
    const { pluginAlias, endpoint } = params;
    const apiKey = request.headers.get('x-api-key');

    if (!apiKey) {
      return NextResponse.json({ error: 'API key is required' }, { status: 401 });
    }

    let body = null;
    if (method === 'POST' || method === 'PUT') {
      try {
        body = await request.json();
      } catch {
        return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
      }
    }

    // Fast-path for high-frequency server module traffic (single Convex call with auth inside).
    if (pluginAlias === 'parking-spaces') {
      return await handleParkingSpacesApi(endpoint, method, body, pluginAlias, apiKey);
    }

    const searchParams = Object.fromEntries(request.nextUrl.searchParams);

    const result = await convex.mutation(api.pluginApi.handlePluginApiCall, {
      pluginAlias,
      endpoint,
      method,
      body: body ? JSON.stringify(body) : null,
      queryParams: JSON.stringify(searchParams),
      apiKey,
    });

    return NextResponse.json(result);
  } catch (error) {
    console.error('Plugin API error:', error);
    return NextResponse.json(
      { error: apiErrorMessage(error) },
      { status: apiErrorStatus(error) }
    );
  }
}

async function handleParkingSpacesApi(
  endpoint: string,
  method: string,
  body: any,
  pluginAlias: string,
  apiKey: string
) {
  if (endpoint === 'getSpaces' && method === 'GET') {
    const result = await convex.query(api.pluginApi.getParkingSpacesSnapshotAuthed, {
      pluginName: pluginAlias,
      apiKey,
    });

    return NextResponse.json(result);
  }

  if (endpoint === 'getMap' && method === 'GET') {
    const result = await convex.query(api.pluginApi.getParkingMapSnapshotAuthed, {
      pluginName: pluginAlias,
      apiKey,
    });

    return NextResponse.json(result);
  }

  if (endpoint === 'updateSpaceStatus' && (method === 'POST' || method === 'PUT')) {
    const hasBool = typeof body?.isFull === 'boolean';
    const hasStatus = body?.status === 'full' || body?.status === 'empty';
    if ((!body?.spaceId && !body?.spaceName) || (!hasBool && !hasStatus)) {
      return NextResponse.json(
        { error: 'spaceId or spaceName and status/isFull are required' },
        { status: 400 }
      );
    }

    const result = await convex.mutation(api.pluginApi.updateParkingSpaceStatusAuthed, {
      pluginName: pluginAlias,
      apiKey,
      spaceId: body?.spaceId,
      spaceName: body?.spaceName,
      status: hasStatus ? body.status : undefined,
      isFull: hasBool ? body.isFull : undefined,
    });


    return NextResponse.json(result);
  }

  return NextResponse.json(
    { error: `Method ${method} is not supported for ${pluginAlias}/${endpoint}` },
    { status: 405 }
  );
}