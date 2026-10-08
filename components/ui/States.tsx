import React from 'react';

interface LoadingStateProps {
  message?: string;
}

export function LoadingState({ message = 'Loading financial records...' }: LoadingStateProps) {
  return (
    <div className="flex flex-col items-center justify-center p-12 text-center border border-neutral-800/80 rounded-lg bg-neutral-900/40">
      <div className="w-5 h-5 border-2 border-neutral-600 border-t-neutral-200 rounded-full animate-spin mb-3" />
      <p className="text-xs font-mono uppercase tracking-widest text-neutral-400">{message}</p>
    </div>
  );
}

interface EmptyStateProps {
  title: string;
  description: string;
  action?: React.ReactNode;
}

export function EmptyState({ title, description, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center p-12 text-center border border-dashed border-neutral-800 rounded-lg bg-neutral-900/20">
      <div className="w-8 h-8 rounded-full bg-neutral-800/80 flex items-center justify-center text-neutral-400 mb-3 text-xs font-mono">
        —
      </div>
      <h3 className="text-sm font-semibold text-neutral-200 mb-1">{title}</h3>
      <p className="text-xs text-neutral-400 max-w-sm mb-4 leading-relaxed">{description}</p>
      {action && <div>{action}</div>}
    </div>
  );
}

interface ErrorStateProps {
  title?: string;
  message: string;
  onRetry?: () => void;
}

export function ErrorState({
  title = 'Service Error',
  message,
  onRetry,
}: ErrorStateProps) {
  return (
    <div className="p-4 border border-rose-900/50 rounded-lg bg-rose-950/20 text-rose-200">
      <div className="flex items-start justify-between">
        <div>
          <h4 className="text-xs font-mono uppercase tracking-wider font-semibold text-rose-400 mb-1">
            {title}
          </h4>
          <p className="text-xs text-rose-300/90 leading-relaxed">{message}</p>
        </div>
        {onRetry && (
          <button
            onClick={onRetry}
            className="ml-4 px-2.5 py-1 text-xs font-mono bg-rose-900/60 hover:bg-rose-800/80 text-rose-200 rounded border border-rose-700/50 transition-colors"
          >
            Retry
          </button>
        )}
      </div>
    </div>
  );
}
