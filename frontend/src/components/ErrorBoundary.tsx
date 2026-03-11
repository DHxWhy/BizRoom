import { Component, type ErrorInfo, type ReactNode } from "react";
import { S } from "../constants/strings";

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

/**
 * React class-based error boundary.
 * Catches render errors in descendant components and displays a fallback UI.
 */
export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    console.error("ErrorBoundary caught:", error, errorInfo);
  }

  render(): ReactNode {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;

      return (
        <div className="h-screen bg-neutral-900 text-neutral-100 flex items-center justify-center">
          <div className="text-center max-w-md">
            <div className="text-4xl mb-4">&#x26A0;&#xFE0F;</div>
            <h2 className="text-xl font-bold mb-2">
              {S.errors.boundary.title}
            </h2>
            <p className="text-neutral-400 mb-4 text-sm">
              {this.state.error?.message ?? S.errors.boundary.unknown}
            </p>
            <button
              onClick={() => window.location.reload()}
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 rounded-lg text-sm transition-colors"
            >
              {S.errors.boundary.reload}
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
