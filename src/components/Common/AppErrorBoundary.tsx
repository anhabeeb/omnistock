import React from 'react';

type Props = {
  children: React.ReactNode;
  resetKey?: string;
};

type State = {
  hasError: boolean;
  message: string;
};

export class AppErrorBoundary extends React.Component<Props, State> {
  state: State = {
    hasError: false,
    message: '',
  };

  static getDerivedStateFromError(error: Error): State {
    return {
      hasError: true,
      message: error.message || 'Something went wrong while rendering this page.',
    };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('Route render failed:', error, info);
  }

  componentDidUpdate(prevProps: Props) {
    if (this.props.resetKey !== prevProps.resetKey && this.state.hasError) {
      this.setState({ hasError: false, message: '' });
    }
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex min-h-[50vh] items-center justify-center p-8">
          <div className="max-w-lg rounded-3xl border border-red-500/20 bg-red-500/5 p-6 text-center">
            <h2 className="text-2xl font-bold text-white">This page hit an error</h2>
            <p className="mt-3 text-sm text-slate-300">
              {this.state.message || 'Please try navigating away and back, or refresh after the latest deploy.'}
            </p>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
