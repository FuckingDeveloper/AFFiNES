import { Component, type ErrorInfo, type ReactNode } from 'react';

export class DashboardErrorBoundary extends Component<
  { children: ReactNode },
  { error: Error | null }
> {
  state: { error: Error | null } = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Failed to render admin dashboard', error, info);
  }

  render() {
    const { error } = this.state;
    if (!error) {
      return this.props.children;
    }

    return (
      <div className="flex min-h-[320px] items-center justify-center p-6">
        <div className="w-full max-w-xl rounded-xl border border-border bg-card p-6 shadow-1">
          <h2 className="text-lg font-semibold">Dashboard is unavailable</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            The dashboard request failed. Other admin pages remain available.
          </p>
          <pre className="mt-4 max-h-32 overflow-auto rounded-md bg-muted p-3 text-xs text-muted-foreground">
            {error.message || 'Unknown dashboard error'}
          </pre>
          <button
            type="button"
            className="mt-4 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
            onClick={() => window.location.reload()}
          >
            Reload dashboard
          </button>
        </div>
      </div>
    );
  }
}
