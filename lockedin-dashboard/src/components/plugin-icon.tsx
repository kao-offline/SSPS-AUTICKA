'use client';

import React from 'react';
import { useQuery } from 'convex/react';
import { api } from '../../convex/_generated/api';
import { ImageIcon } from 'lucide-react';
import { useTheme } from '@/lib/use-theme';

interface PluginIconProps {
  pluginName?: string;
  theme?: 'light' | 'dark';
  fallback?: React.ReactNode;
  svgMarkup?: string | null;
  className?: string;
  imageClassName?: string;
}

export function PluginIcon({
  pluginName,
  theme,
  fallback,
  svgMarkup,
  className = '',
  imageClassName = '',
}: PluginIconProps) {
  const { theme: selectedTheme } = useTheme();
  const iconUrl = useQuery(
    api.context.getPluginIconUrl,
    pluginName ? { pluginName, theme: theme ?? selectedTheme } : 'skip',
  );

  if (svgMarkup) {
    return (
      <div
        className={className}
        aria-hidden="true"
        dangerouslySetInnerHTML={{ __html: svgMarkup }}
      />
    );
  }

  if (iconUrl) {
    return (
      <img
        src={iconUrl}
        alt={pluginName ? `${pluginName} icon` : 'Plugin icon'}
        className={imageClassName || className}
      />
    );
  }

  if (fallback) {
    return <>{fallback}</>;
  }

  return <ImageIcon className={className} />;
}
