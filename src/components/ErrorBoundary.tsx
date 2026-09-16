import { Component, type ErrorInfo, type ReactNode } from "react";

type Props = { children: ReactNode };
type State = { error: Error | null };

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("Load Tracker crashed", error, info.componentStack);
    document.body.classList.add("app-ready");
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="screen overlay-screen login-screen">
        <p className="eyebrow">Desktop failed to start</p>
        <h1 className="page-title">Something broke after the logo</h1>
        <p className="field-hint">{this.state.error.message}</p>
        <button
          type="button"
          className="block-btn"
          onClick={() => window.location.reload()}
        >
          Reload
        </button>
      </div>
    );
  }
}
