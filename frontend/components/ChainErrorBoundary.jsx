"use client";

import React from "react";
import { AlertTriangle, RefreshCw, WifiOff } from "lucide-react";
import { Button } from "./ui/button";

/**
 * Error boundary specifically designed for chain-dependent components.
 * Prevents whole-app crashes when Stellar/Soroban RPC calls, wallet interactions,
 * or on-chain queries fail.
 *
 * Features:
 * - Fallback UI with a Retry button
 * - Automated logging to monitoring services / callbacks
 * - Clean state recovery upon retry
 */
export class ChainErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
    };
  }

  static getDerivedStateFromError(error) {
    return {
      hasError: true,
      error,
    };
  }

  componentDidCatch(error, errorInfo) {
    this.setState({ errorInfo });

    // 1. Notify external monitoring callback if provided via props
    if (typeof this.props.onCatch === "function") {
      this.props.onCatch(error, errorInfo);
    }
    if (typeof this.props.onError === "function") {
      this.props.onError(error, errorInfo);
    }

    // 2. Dispatch to global monitoring if available (e.g., Sentry, Datadog, custom telemetry)
    if (typeof window !== "undefined" && typeof window.reportErrorToMonitoring === "function") {
      try {
        window.reportErrorToMonitoring(error, {
          componentStack: errorInfo?.componentStack,
          boundary: this.props.name || "ChainErrorBoundary",
        });
      } catch (monitorErr) {
        console.error("[ChainErrorBoundary] Failed to report to window.reportErrorToMonitoring:", monitorErr);
      }
    }

    // 3. Log to standard console for debugging
    console.error(
      `[ChainErrorBoundary${this.props.name ? `:${this.props.name}` : ""}] Chain RPC / execution failure:`,
      error,
      errorInfo,
    );
  }

  handleRetry = () => {
    this.setState({
      hasError: false,
      error: null,
      errorInfo: null,
    });

    if (typeof this.props.onReset === "function") {
      this.props.onReset();
    }
  };

  render() {
    if (this.state.hasError) {
      if (typeof this.props.fallback === "function") {
        return this.props.fallback({
          error: this.state.error,
          resetErrorBoundary: this.handleRetry,
        });
      }

      if (this.props.fallback) {
        return this.props.fallback;
      }

      const errorMessage =
        this.state.error?.message ||
        (typeof this.state.error === "string" ? this.state.error : "Unknown blockchain RPC error");

      return (
        <div
          role="alert"
          aria-live="assertive"
          className="w-full my-4 rounded-xl border border-red-500/30 bg-black/60 p-6 text-white shadow-xl backdrop-blur-md"
        >
          <div className="flex flex-col items-center text-center sm:items-start sm:text-left sm:flex-row gap-4">
            <div className="p-3 rounded-full bg-red-500/20 text-red-400 shrink-0">
              <WifiOff className="w-8 h-8" aria-hidden="true" />
            </div>

            <div className="flex-1 space-y-2">
              <div className="flex items-center justify-center sm:justify-start gap-2">
                <AlertTriangle className="w-5 h-5 text-amber-400" aria-hidden="true" />
                <h3 className="text-lg font-semibold text-white">
                  {this.props.title || "Blockchain Connection Error"}
                </h3>
              </div>

              <p className="text-sm text-gray-300">
                Failed to communicate with the Stellar network. Whole-app crash prevented.
              </p>

              <div className="p-2.5 rounded-lg bg-black/40 border border-white/10 font-mono text-xs text-red-300 break-all max-h-24 overflow-y-auto">
                {errorMessage}
              </div>

              <div className="pt-2 flex flex-wrap gap-3 justify-center sm:justify-start">
                <Button
                  onClick={this.handleRetry}
                  className="bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600 text-white font-medium px-5 py-2 rounded-lg flex items-center gap-2 transition-all hover:scale-105"
                  aria-label="Retry blockchain connection"
                >
                  <RefreshCw className="w-4 h-4 animate-spin-hover" />
                  <span>Retry Connection</span>
                </Button>
              </div>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

/**
 * Higher-order component to wrap any chain-dependent component in ChainErrorBoundary.
 */
export function withChainErrorBoundary(Component, boundaryProps = {}) {
  const Wrapped = (props) => (
    <ChainErrorBoundary {...boundaryProps}>
      <Component {...props} />
    </ChainErrorBoundary>
  );
  Wrapped.displayName = `withChainErrorBoundary(${Component.displayName || Component.name || "Component"})`;
  return Wrapped;
}

export default ChainErrorBoundary;
