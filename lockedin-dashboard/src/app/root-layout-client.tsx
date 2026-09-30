'use client';

import { HeroUIProvider } from "@heroui/react";
import { ConvexClientProvider } from "./convex-provider";
import { AuthProvider } from "./auth-context";
import { useTheme } from '@/lib/use-theme';

export function RootLayoutClient({
  children,
}: {
  children: React.ReactNode;
}) {
  useTheme();
  return (
    <HeroUIProvider>
      <ConvexClientProvider>
        <AuthProvider>
          {children}
        </AuthProvider>
      </ConvexClientProvider>
    </HeroUIProvider>
  );
}
