import { Component, type ErrorInfo, type ReactNode } from "react";

interface Props {
  children: ReactNode;
  /** Called when the player chooses to start a fresh shift after a crash. */
  onReset?: () => void;
}

interface State {
  error: Error | null;
}

/**
 * Catches render/runtime errors anywhere in the game tree and shows a friendly
 * recovery screen instead of a blank page. A crash mid-shift should never trap
 * the player.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // Surface the failure in the console for debugging; players still get the
    // recovery UI below.
    console.error("Night Med Reg crashed:", error, info.componentStack);
  }

  handleReset = () => {
    this.props.onReset?.();
    this.setState({ error: null });
  };

  render() {
    if (this.state.error) {
      return (
        <main className="app crash-screen" role="alert">
          <section className="panel">
            <h1>The shift fell over</h1>
            <p>
              Something went wrong and the game crashed. Your night is over, but
              you can start a fresh shift.
            </p>
            <p className="crash-detail">{this.state.error.message}</p>
            <button onClick={this.handleReset}>Start a new shift</button>
          </section>
        </main>
      );
    }
    return this.props.children;
  }
}
