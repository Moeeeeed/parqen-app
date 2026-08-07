import React from 'react';
import { RefreshCw, AlertTriangle } from 'lucide-react';

const C = { forest: '#1B4332', green: '#2D6A4F', g500: '#64748B', g200: '#E2E8F0' };

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error, info) {
    // Without this, an uncaught render error unmounts the whole tree and the
    // page just goes blank with nothing in the console pointing at why.
    console.error('[ErrorBoundary] caught render error:', error, info?.componentStack);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex flex-col items-center justify-center text-center px-6 py-20" style={{ minHeight: '50vh' }}>
          <AlertTriangle size={40} style={{ color: '#F59E0B' }} className="mb-3" />
          <p className="font-black text-lg" style={{ color: C.forest }}>Something went wrong</p>
          <p className="text-sm mt-1 mb-5" style={{ color: C.g500 }}>
            This page hit an unexpected error. Reloading usually fixes it.
          </p>
          <button
            onClick={() => window.location.reload()}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-white font-bold text-sm hover:opacity-90 transition"
            style={{ backgroundColor: C.green }}
          >
            <RefreshCw size={15} /> Reload page
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

export default ErrorBoundary;
