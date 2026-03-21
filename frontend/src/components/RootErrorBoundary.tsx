import { Component, ErrorInfo, ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

export default class RootErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('RootErrorBoundary', error, info.componentStack);
  }

  render() {
    if (this.state.error) {
      return (
        <div style={{ padding: '2rem', fontFamily: 'sans-serif', maxWidth: '600px' }}>
          <h1 style={{ color: '#b91c1c' }}>Something went wrong</h1>
          <pre style={{ overflow: 'auto', background: '#f3f4f6', padding: '1rem', borderRadius: '4px' }}>
            {this.state.error.message}
          </pre>
          <p>
            <button
              type="button"
              onClick={() => this.setState({ error: null })}
              style={{ marginTop: '1rem', padding: '0.5rem 1rem' }}
            >
              Try again
            </button>
          </p>
        </div>
      );
    }
    return this.props.children;
  }
}
