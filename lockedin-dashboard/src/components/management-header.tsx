import type { ReactNode } from 'react';

export function ManagementHeader({ title, summary, actions }: {
  title: string;
  summary?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <header className="management-header">
      <div className="min-w-0">
        <div className="management-heading">
          <h1>{title}</h1>
          {summary && <div className="management-summary">{summary}</div>}
        </div>
      </div>
      {actions && <div className="management-actions">{actions}</div>}
    </header>
  );
}
