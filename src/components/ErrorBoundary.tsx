import { Component, type CSSProperties, type ErrorInfo, type ReactNode } from "react";

type Props = { children: ReactNode };
type State = { error: Error | null };

const wrap: CSSProperties = {
  minHeight: "100vh",
  padding: 32,
  fontFamily: '"Segoe UI", system-ui, sans-serif',
  background: "#ffffff",
  color: "#111111",
};

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("Load Tracker crashed", error, info.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div style={wrap}>
        <p style={{ margin: "0 0 8px", fontWeight: 700 }}>Desktop failed to start</p>
        <p style={{ margin: "0 0 16px" }}>{this.state.error.message}</p>
        <button type="button" onClick={() => window.location.reload()}>
          Reload
        </button>
      </div>
    );
  }
}
