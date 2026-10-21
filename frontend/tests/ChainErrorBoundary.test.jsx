import React, { useState } from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import ChainErrorBoundary, { withChainErrorBoundary } from "@/components/ChainErrorBoundary";

// Component that conditionally throws a simulated blockchain RPC failure
function FlakyChainComponent({ shouldThrow, errorMessage = "Soroban RPC call timed out" }) {
  if (shouldThrow) {
    throw new Error(errorMessage);
  }
  return <div data-testid="chain-content">Connected to Stellar Ledger 489210</div>;
}

// Stateful wrapper to test recovery on retry
function RecoverableParent({ initialFail = true }) {
  const [fail, setFail] = useState(initialFail);

  return (
    <ChainErrorBoundary
      name="TestChainBoundary"
      onReset={() => setFail(false)}
    >
      <FlakyChainComponent shouldThrow={fail} />
    </ChainErrorBoundary>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  // Silence console.error from error boundary during expected test errors
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("ChainErrorBoundary (#705)", () => {
  it("renders children normally when there is no error", () => {
    render(
      <ChainErrorBoundary>
        <FlakyChainComponent shouldThrow={false} />
      </ChainErrorBoundary>,
    );

    expect(screen.getByTestId("chain-content")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("renders fallback UI with retry button when RPC call throws", () => {
    render(
      <ChainErrorBoundary>
        <FlakyChainComponent shouldThrow={true} errorMessage="Horizon RPC rate limit exceeded (429)" />
      </ChainErrorBoundary>,
    );

    const alert = screen.getByRole("alert");
    expect(alert).toBeInTheDocument();
    expect(screen.getByText("Blockchain Connection Error")).toBeInTheDocument();
    expect(
      screen.getByText(/Failed to communicate with the Stellar network. Whole-app crash prevented./i),
    ).toBeInTheDocument();
    expect(screen.getByText(/Horizon RPC rate limit exceeded \(429\)/i)).toBeInTheDocument();

    const retryButton = screen.getByRole("button", { name: /retry blockchain connection/i });
    expect(retryButton).toBeInTheDocument();
  });

  it("logs errors to monitoring callback and window.reportErrorToMonitoring", () => {
    const onCatchMock = vi.fn();
    const onErrorMock = vi.fn();
    window.reportErrorToMonitoring = vi.fn();

    render(
      <ChainErrorBoundary
        name="ContractCallBoundary"
        onCatch={onCatchMock}
        onError={onErrorMock}
      >
        <FlakyChainComponent shouldThrow={true} errorMessage="Simulation failed: Error(Contract, #2)" />
      </ChainErrorBoundary>,
    );

    expect(onCatchMock).toHaveBeenCalledTimes(1);
    expect(onCatchMock).toHaveBeenCalledWith(
      expect.objectContaining({ message: "Simulation failed: Error(Contract, #2)" }),
      expect.anything(),
    );

    expect(onErrorMock).toHaveBeenCalledTimes(1);

    expect(window.reportErrorToMonitoring).toHaveBeenCalledTimes(1);
    expect(window.reportErrorToMonitoring).toHaveBeenCalledWith(
      expect.objectContaining({ message: "Simulation failed: Error(Contract, #2)" }),
      expect.objectContaining({ boundary: "ContractCallBoundary" }),
    );

    delete window.reportErrorToMonitoring;
  });

  it("recovers on retry when user clicks the retry button", () => {
    render(<RecoverableParent initialFail={true} />);

    // Initially in error state
    expect(screen.getByRole("alert")).toBeInTheDocument();
    expect(screen.queryByTestId("chain-content")).not.toBeInTheDocument();

    // Click retry button
    const retryBtn = screen.getByRole("button", { name: /retry blockchain connection/i });
    fireEvent.click(retryBtn);

    // After retry, boundary resets and content successfully renders
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.getByTestId("chain-content")).toBeInTheDocument();
    expect(screen.getByText("Connected to Stellar Ledger 489210")).toBeInTheDocument();
  });

  it("supports withChainErrorBoundary HOC", () => {
    const WrappedComponent = withChainErrorBoundary(FlakyChainComponent, {
      title: "Custom HOC Title",
    });

    render(<WrappedComponent shouldThrow={true} errorMessage="HOC caught error" />);

    expect(screen.getByText("Custom HOC Title")).toBeInTheDocument();
    expect(screen.getByText(/HOC caught error/)).toBeInTheDocument();
  });
});
