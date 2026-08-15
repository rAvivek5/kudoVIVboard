import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  error: Error | null;
}

/** One boundary per route tree. A broken card must not blank the whole board. */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    // Swap for your error reporter (Sentry, Logflare) in one line here.
    console.error('[boundary]', error, info.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;
    if (this.props.fallback) return this.props.fallback;

    return (
      <div className="flex min-h-[60dvh] items-center justify-center p-6">
        <div className="sticker relative max-w-md p-8 text-center tape">
          <p className="font-mono text-[11px] uppercase tracking-widest text-muted">
            Something broke
          </p>
          <h1 className="mt-3 text-2xl">This page stopped loading</h1>
          <p className="mt-2 text-sm text-muted">
            The error has been logged. Reloading usually clears it.
          </p>
          <button
            onClick={() => window.location.reload()}
            className="mt-6 h-11 rounded-full border-2 border-ink bg-hype px-6 font-display font-semibold text-white shadow-pop sticker-lift"
          >
            Reload the page
          </button>
        </div>
      </div>
    );
  }
}
