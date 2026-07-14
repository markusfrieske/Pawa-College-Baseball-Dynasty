import { Component, type ErrorInfo, type ReactNode } from "react";

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  componentStack: string | null;
}

/**
 * Global React ErrorBoundary.
 *
 * Catches render-phase errors including "Too many re-renders" (infinite loop
 * bugs) and displays the component stack in development so the exact culprit
 * can be identified. In production it shows a graceful reload screen.
 */
export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null, componentStack: null };
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    const stack = info.componentStack ?? null;
    this.setState({ componentStack: stack });

    if (import.meta.env.DEV) {
      console.error("[ErrorBoundary] Caught render error:", error.message);
      if (stack) {
        console.error("[ErrorBoundary] Component stack:", stack);
      }
    }
  }

  handleReload() {
    this.setState({ hasError: false, error: null, componentStack: null });
    window.location.reload();
  }

  render() {
    if (!this.state.hasError) {
      return this.props.children;
    }

    if (this.props.fallback) {
      return this.props.fallback;
    }

    const isDev = import.meta.env.DEV;
    const isTooManyRenders = this.state.error?.message?.includes("Too many re-renders");

    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-6">
        <div className="max-w-2xl w-full">
          <div
            className="border rounded-lg p-6"
            style={{ borderColor: "rgba(202,168,84,0.3)", background: "#0a1a0d" }}
          >
            <h1
              className="font-pixel text-gold text-xs mb-3"
              style={{ fontFamily: "'Press Start 2P', monospace" }}
            >
              {isTooManyRenders ? "Render Loop Detected" : "Something Went Wrong"}
            </h1>
            <p className="text-white/70 text-sm mb-4">
              {isTooManyRenders
                ? "A component entered an infinite render loop. This is a known intermittent bug being tracked."
                : "An unexpected error occurred. Please reload to continue."}
            </p>

            {isDev && this.state.error && (
              <div className="mb-4 space-y-3">
                <div className="bg-red-900/20 border border-red-500/30 rounded p-3">
                  <p className="text-red-400 text-xs font-mono font-bold mb-1">Error</p>
                  <p className="text-red-300 text-xs font-mono break-all">
                    {this.state.error.message}
                  </p>
                </div>

                {this.state.componentStack && (
                  <div className="bg-amber-900/10 border border-amber-500/20 rounded p-3">
                    <p className="text-amber-400 text-xs font-mono font-bold mb-2">
                      Component Stack (check the first component listed below)
                    </p>
                    <pre className="text-amber-200/80 text-xs font-mono whitespace-pre-wrap overflow-auto max-h-64">
                      {this.state.componentStack.trim()}
                    </pre>
                  </div>
                )}
              </div>
            )}

            <button
              onClick={() => this.handleReload()}
              className="px-4 py-2 text-xs font-pixel text-black rounded"
              style={{
                fontFamily: "'Press Start 2P', monospace",
                background: "rgb(202,168,84)",
              }}
            >
              Reload Page
            </button>
          </div>
        </div>
      </div>
    );
  }
}
