'use client';

import { getConvexUrl } from '@/lib/convex-url';

import { ConvexAuthProvider } from "@convex-dev/auth/react";
import { ConvexReactClient } from "convex/react";

const convex = new ConvexReactClient(getConvexUrl());

export function ConvexClientProvider({ children }: { children: React.ReactNode }) {
  return <ConvexAuthProvider client={convex}>{children}</ConvexAuthProvider>;
}
