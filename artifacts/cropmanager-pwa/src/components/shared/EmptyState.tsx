import React from 'react';

interface EmptyStateProps {
  emoji?: string;
  icon?: React.ReactNode;
  title: string;
  subtitle?: string;
}

/** Shared empty-list block (previously copy-pasted across list screens). */
export function EmptyState({ emoji, icon, title, subtitle }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center py-20 text-center">
      {emoji && <p className="text-4xl mb-3">{emoji}</p>}
      {icon && <div className="mb-3 opacity-40">{icon}</div>}
      <p className="font-semibold">{title}</p>
      {subtitle && <p className="text-sm text-muted-foreground mb-4">{subtitle}</p>}
    </div>
  );
}
