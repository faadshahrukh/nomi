import type { ReactNode } from 'react';
import { EmptyState, type EmptyStateProps } from './EmptyState';
import { ErrorState, type ErrorStateProps } from './ErrorState';

export type AsyncStatus = 'loading' | 'error' | 'empty' | 'ready';

export interface AsyncBoundaryProps {
  status: AsyncStatus;
  /** Skeleton shaped like the final content, so layout does not jump. */
  skeleton: ReactNode;
  empty: EmptyStateProps;
  error?: ErrorStateProps;
  children: ReactNode;
}

/** One place that decides loading / error / empty / ready, so every feature handles all four the same way. */
export function AsyncBoundary({ status, skeleton, empty, error, children }: AsyncBoundaryProps) {
  if (status === 'loading') return <>{skeleton}</>;
  if (status === 'error') return <ErrorState {...error} />;
  if (status === 'empty') return <EmptyState {...empty} />;
  return <>{children}</>;
}
