/**
 * @jest-environment jsdom
 */

import { renderHook, act } from "@testing-library/react";
import { useWalletSession } from "./useWalletSession";

// ── Mock useWalletConnection ────────────────────────────────────────────────
let mockWalletState = {
  status: "disconnected",
  isConnected: false,
  isExtensionInstalled: true,
  address: null,
  network: null,
  unsupportedNetwork: false,
  error: null,
  connect: jest.fn(),
  refresh: jest.fn(),
  disconnect: jest.fn(),
};

jest.mock("./useWalletConnection", () => ({
  useWalletConnection: () => mockWalletState,
  WALLET_STATUS: {
    DISCONNECTED: "disconnected",
    CONNECTING: "connecting",
    CONNECTED: "connected",
    ERROR: "error",
  },
}));

// ── Mock Zustand store ──────────────────────────────────────────────────────
const mockResetAll = jest.fn();
const mockGetStore = () => ({ resetAll: mockResetAll });

// ── Helpers ─────────────────────────────────────────────────────────────────
function makeController() {
  return new AbortController();
}

function renderSession(storeFactory = mockGetStore) {
  return renderHook(() => useWalletSession({ getStore: storeFactory }));
}

// ── Tests ────────────────────────────────────────────────────────────────────
describe("useWalletSession", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockWalletState = {
      status: "disconnected",
      isConnected: false,
      isExtensionInstalled: true,
      address: null,
      network: null,
      unsupportedNetwork: false,
      error: null,
      connect: jest.fn(),
      refresh: jest.fn(),
      disconnect: jest.fn(),
    };
  });

  // ── initial state ──────────────────────────────────────────────────────────

  it("exposes all useWalletConnection fields in initial state", () => {
    const { result } = renderSession();
    expect(result.current.isConnected).toBe(false);
    expect(result.current.address).toBeNull();
    expect(result.current.status).toBe("disconnected");
  });

  it("exposes pendingTxCount as 0 initially", () => {
    const { result } = renderSession();
    expect(result.current.pendingTxCount).toBe(0);
  });

  it("exposes registerTx and abortAllTx functions", () => {
    const { result } = renderSession();
    expect(typeof result.current.registerTx).toBe("function");
    expect(typeof result.current.abortAllTx).toBe("function");
  });

  // ── registerTx / pendingTxCount ─────────────────────────────────────────

  it("increments pendingTxCount when a tx is registered", () => {
    const { result } = renderSession();
    const ctrl = makeController();

    act(() => {
      result.current.registerTx("tx-1", ctrl);
    });

    expect(result.current.pendingTxCount).toBe(1);
  });

  it("tracks multiple in-flight txs", () => {
    const { result } = renderSession();

    act(() => {
      result.current.registerTx("tx-1", makeController());
      result.current.registerTx("tx-2", makeController());
      result.current.registerTx("tx-3", makeController());
    });

    expect(result.current.pendingTxCount).toBe(3);
  });

  it("does not blow up when a non-AbortController is passed", () => {
    const { result } = renderSession();
    // Should log a warning but not throw
    expect(() => {
      act(() => {
        result.current.registerTx("bad-tx", { signal: null });
      });
    }).not.toThrow();
    // Should not register the entry
    expect(result.current.pendingTxCount).toBe(0);
  });

  // ── abortAllTx ─────────────────────────────────────────────────────────────

  it("aborts all controllers and resets count on abortAllTx()", () => {
    const { result } = renderSession();
    const ctrl1 = makeController();
    const ctrl2 = makeController();

    act(() => {
      result.current.registerTx("tx-1", ctrl1);
      result.current.registerTx("tx-2", ctrl2);
    });

    act(() => {
      result.current.abortAllTx("manual");
    });

    expect(ctrl1.signal.aborted).toBe(true);
    expect(ctrl2.signal.aborted).toBe(true);
    expect(result.current.pendingTxCount).toBe(0);
  });

  it("abortAllTx is a no-op when no txs are registered", () => {
    const { result } = renderSession();
    expect(() => {
      act(() => {
        result.current.abortAllTx();
      });
    }).not.toThrow();
    expect(result.current.pendingTxCount).toBe(0);
  });

  // ── disconnect ──────────────────────────────────────────────────────────────

  it("calls resetAll and baseDisconnect when disconnect() is called", () => {
    const { result } = renderSession();

    act(() => {
      result.current.disconnect();
    });

    expect(mockResetAll).toHaveBeenCalledTimes(1);
    expect(mockWalletState.disconnect).toHaveBeenCalledTimes(1);
  });

  it("aborts all in-flight txs on manual disconnect", () => {
    const { result } = renderSession();
    const ctrl = makeController();

    act(() => {
      result.current.registerTx("tx-1", ctrl);
    });

    act(() => {
      result.current.disconnect();
    });

    expect(ctrl.signal.aborted).toBe(true);
    expect(result.current.pendingTxCount).toBe(0);
  });

  it("dispatches session-changed event on disconnect", () => {
    const { result } = renderSession();
    const listener = jest.fn();
    window.addEventListener("session-changed", listener);

    act(() => {
      result.current.disconnect();
    });

    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener.mock.calls[0][0].detail.reason).toBe("manual-disconnect");
    window.removeEventListener("session-changed", listener);
  });

  // ── account-change detection ─────────────────────────────────────────────

  it("aborts in-flight txs when address changes (account switch)", () => {
    // Start with an address connected
    mockWalletState = {
      ...mockWalletState,
      status: "connected",
      isConnected: true,
      address: "GAAAA",
    };

    const { result, rerender } = renderSession();
    const ctrl = makeController();

    act(() => {
      result.current.registerTx("tx-1", ctrl);
    });
    expect(result.current.pendingTxCount).toBe(1);

    // Simulate account switch
    mockWalletState = { ...mockWalletState, address: "GBBBB" };
    rerender();

    expect(ctrl.signal.aborted).toBe(true);
    expect(result.current.pendingTxCount).toBe(0);
  });

  it("dispatches session-changed event on account change", () => {
    mockWalletState = {
      ...mockWalletState,
      status: "connected",
      isConnected: true,
      address: "GAAAA",
    };

    const { rerender } = renderSession();
    const listener = jest.fn();
    window.addEventListener("session-changed", listener);

    mockWalletState = { ...mockWalletState, address: "GBBBB" };
    rerender();

    expect(listener).toHaveBeenCalledWith(
      expect.objectContaining({
        detail: expect.objectContaining({ reason: "account-changed" }),
      })
    );
    window.removeEventListener("session-changed", listener);
  });

  // ── wallet disconnect detection (address → null) ─────────────────────────

  it("resets app store when wallet disconnects (address drops to null)", () => {
    mockWalletState = {
      ...mockWalletState,
      status: "connected",
      isConnected: true,
      address: "GAAAA",
    };

    const { rerender } = renderSession();

    // Wallet disconnects
    mockWalletState = {
      ...mockWalletState,
      status: "disconnected",
      isConnected: false,
      address: null,
    };
    rerender();

    expect(mockResetAll).toHaveBeenCalledTimes(1);
  });

  it("aborts in-flight txs when wallet disconnects externally", () => {
    mockWalletState = {
      ...mockWalletState,
      status: "connected",
      isConnected: true,
      address: "GAAAA",
    };

    const { result, rerender } = renderSession();
    const ctrl = makeController();

    act(() => {
      result.current.registerTx("tx-pending", ctrl);
    });

    // External disconnect
    mockWalletState = {
      ...mockWalletState,
      status: "disconnected",
      isConnected: false,
      address: null,
    };
    rerender();

    expect(ctrl.signal.aborted).toBe(true);
  });

  // ── store missing resetAll ────────────────────────────────────────────────

  it("does not throw when store has no resetAll method", () => {
    const badStore = () => ({ someOtherMethod: jest.fn() });
    const { result } = renderHook(() =>
      useWalletSession({ getStore: badStore })
    );

    expect(() => {
      act(() => {
        result.current.disconnect();
      });
    }).not.toThrow();
  });

  it("does not throw when getStore throws", () => {
    const throwingStore = () => {
      throw new Error("store unavailable");
    };
    const { result } = renderHook(() =>
      useWalletSession({ getStore: throwingStore })
    );

    expect(() => {
      act(() => {
        result.current.disconnect();
      });
    }).not.toThrow();
  });
});