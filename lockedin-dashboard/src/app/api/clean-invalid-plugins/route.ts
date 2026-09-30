import { getConvexUrl } from '@/lib/convex-url';
import { ConvexHttpClient } from 'convex/browser';
import { api } from '../../../../convex/_generated/api';
import { apiErrorStatus, apiErrorMessage } from '@/lib/api-errors';
import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  const token = request.headers.get('authorization')?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!token) return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  try {
    const convex = new ConvexHttpClient(getConvexUrl());
    convex.setAuth(token);
    const { userId } = await request.json();

    if (!userId) {
      return NextResponse.json(
        { error: 'Missing userId' },
        { status: 400 }
      );
    }

    // Call the Convex mutation to remove non-existent plugins
    const result = await convex.mutation(api.context.removeNonExistentPlugins, {
      userId,
    });

    return NextResponse.json(result);
  } catch (error) {
    console.error('Failed to clean invalid plugins:', error);
    return NextResponse.json(
      { error: 'Plugin cleanup failed' },
      { status: apiErrorStatus(error) }
    );
  }
}
