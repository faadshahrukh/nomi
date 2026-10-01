import { Component, type ReactNode } from 'react';
import { ErrorState } from './ui/ErrorState';

/**
 * Catches render errors so a bug shows a calm recovery screen instead of a blank app.
 * The error is deliberately NOT rendered or logged with its message, which could contain financial values.
 */
export class ErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() {
    if (this.state.failed) {
      return <ErrorState title="This screen hit a problem" message="Your data is safe. Reload the screen to continue." onRetry={() => this.setState({ failed: false })} retryLabel="Reload" />;
    }
    return this.props.children;
  }
}
