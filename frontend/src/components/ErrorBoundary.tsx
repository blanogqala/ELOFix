import { Component, type ErrorInfo, type ReactNode } from "react";
import { Button } from "@/components/ui/button";

type Props = { children: ReactNode };
type State = { hasError: boolean };

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    if (import.meta.env.DEV) {
      console.error(error, info);
    }
  }

  private handleRetry = () => {
    this.setState({ hasError: false });
  };

  render() {
    if (!this.state.hasError) {
      return this.props.children;
    }

    return (
      <div className="flex min-h-screen items-center justify-center bg-muted px-4">
        <div className="max-w-md space-y-4 text-center">
          <h1 className="text-2xl font-semibold">Something went wrong</h1>
          <p className="text-muted-foreground">
            An unexpected error occurred. You can try again or return to a safe page.
          </p>
          <div className="flex flex-wrap items-center justify-center gap-3">
            <Button type="button" onClick={this.handleRetry}>
              Retry
            </Button>
            <Button asChild variant="outline">
              <a href="/">Home</a>
            </Button>
            <Button asChild variant="ghost">
              <a href="/login">Dashboard</a>
            </Button>
          </div>
        </div>
      </div>
    );
  }
}
