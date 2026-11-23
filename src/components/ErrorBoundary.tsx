import React from 'react';
import { AlertTriangle, RotateCcw } from 'lucide-react';

interface ErrorBoundaryState {
  hasError: boolean;
  errorMessage: string;
}

export class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  ErrorBoundaryState
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, errorMessage: '' };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return {
      hasError: true,
      errorMessage: error.message || 'Terjadi kesalahan saat memproses data aplikasi.',
    };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('ErrorBoundary menangkap kesalahan:', error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-[#FAF7F0] flex items-center justify-center p-4">
          <div className="max-w-md w-full rounded-2xl border border-[#FECACA] bg-white p-6 space-y-4">
            <div className="w-11 h-11 rounded-xl bg-[#FEE2E2] text-[#991B1B] flex items-center justify-center">
              <AlertTriangle className="w-5 h-5" aria-hidden="true" />
            </div>
            <div className="space-y-1.5">
              <h1 className="text-lg font-bold text-[#1A211D]">
                Terjadi Gangguan pada Aplikasi
              </h1>
              <p className="text-sm text-[#55625A]">
                Operasi database atau tampilan mengalami kendala. Muat ulang halaman untuk mencoba kembali.
              </p>
              {this.state.errorMessage && (
                <p className="text-xs font-mono bg-[#FAF7F0] border border-[#E5DFD0] rounded-lg p-2.5 text-[#36413B] break-words">
                  {this.state.errorMessage}
                </p>
              )}
            </div>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="min-h-[44px] w-full px-4 py-2.5 rounded-xl bg-[#1B4332] text-white text-sm font-semibold hover:bg-[#255A43] inline-flex items-center justify-center gap-2"
            >
              <RotateCcw className="w-4 h-4" aria-hidden="true" />
              <span>Muat Ulang Halaman</span>
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
