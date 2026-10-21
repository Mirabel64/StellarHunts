import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";

/**
 * Wallet rejection and network failure paths — issue #762.
 *
 * These tests drive the real `usePuzzleContract` hook and `PuzzleComponent`
 * with a mocked Freighter extension and a mocked Soroban RPC transport. They
 * are end-to-end from the component's perspective: the user types an answer,
 * submits, and the UI must show the correct error and leave the submit/hint
 * controls interactive (no stuck spinner).
 */

vi.hoisted(() => {
  // Must run before the hook module is imported: `EXPECTED_NETWORK` is
  // computed once from this value at module load.
  process.env.NEXT_PUBLIC_STELLAR_NETWORK = "testnet";
});

const STELLAR_PK = "GD6N3NIEU6GEN325OV4RL4QIFTM6WQKDC3HZGSZ7POWYNBNIAA5C6FOG";
const CONTRACT_ID =
  "CA3D5KRYM6CB7OWQ6TWYRR3Z4T7GNZLKERYNZGGA5SOAOPIFY6YQGAXE";

const mocks = vi.hoisted(() => ({
  isConnected: vi.fn(),
  getPublicKey: vi.fn(),
  requestAccess: vi.fn(),
  getNetwork: vi.fn(),
  signTransaction: vi.fn(),
  getAccount: vi.fn(),
  prepareTransaction: vi.fn(),
  sendTransaction: vi.fn(),
  getTransaction: vi.fn(),
}));

vi.mock("@stellar/freighter-api", () => ({
  isConnected: (...args) => mocks.isConnected(...args),
  getPublicKey: (...args) => mocks.getPublicKey(...args),
  requestAccess: (...args) => mocks.requestAccess(...args),
  getNetwork: (...args) => mocks.getNetwork(...args),
  signTransaction: (...args) => mocks.signTransaction(...args),
}));

// A self-contained test double for the parts of the SDK the hook touches.
// The real SDK is ESM and its XDR code rejects jsdom-realm typed arrays, so
// the transport is faked explicitly rather than partially patched.
vi.mock("@stellar/stellar-sdk", () => {
  class FakeTransactionBuilder {
    constructor(source, options) {
      this.source = source;
      this.options = options;
      this.operations = [];
    }
    addOperation(operation) {
      this.operations.push(operation);
      return this;
    }
    setTimeout() {
      return this;
    }
    build() {
      return this;
    }
    toXDR() {
      return "fake-prepared-xdr";
    }
    static fromXDR(xdr) {
      if (typeof xdr !== "string") {
        throw new TypeError(
          `fromXdr: expected a string or Uint8Array, got ${typeof xdr}`,
        );
      }
      return { xdr };
    }
  }

  class FakeServer {
    getAccount(...args) {
      return mocks.getAccount(...args);
    }
    prepareTransaction(...args) {
      return mocks.prepareTransaction(...args);
    }
    sendTransaction(...args) {
      return mocks.sendTransaction(...args);
    }
    getTransaction(...args) {
      return mocks.getTransaction(...args);
    }
  }

  class FakeContract {
    constructor(contractId) {
      this.contractId = contractId;
    }
    call(method, ...args) {
      return { contractId: this.contractId, method, args };
    }
  }

  return {
    Networks: {
      TESTNET: "Test SDF Network ; September 2015",
      PUBLIC: "Public Global Stellar Network ; September 2015",
    },
    TransactionBuilder: FakeTransactionBuilder,
    Address: { fromString: (pk) => ({ toScVal: () => ({ address: pk }) }) },
    nativeToScVal: (value) => ({ native: value }),
    scValToNative: (value) => (value && "native" in value ? value.native : true),
    xdr: { ScVal: { scvBytes: (bytes) => ({ bytes }) } },
    SorobanRpc: { Server: FakeServer, Contract: FakeContract },
  };
});

import PuzzleComponent from "@/components/PuzzleComponent";

const puzzle = {
  id: "puzzle-762",
  type: "text",
  title: "Wallet error paths",
  question: "What is the answer?",
  hint: "Local fallback hint",
  level: "Easy",
  puzzleNumber: 1,
};

function renderPuzzle() {
  return render(
    <PuzzleComponent
      puzzleData={puzzle}
      questionId={762}
      contractOpts={{ contractId: CONTRACT_ID }}
    />,
  );
}

async function submitAnswer(answer = "orbit") {
  fireEvent.change(screen.getByLabelText("Your answer"), {
    target: { value: answer },
  });
  fireEvent.click(screen.getByRole("button", { name: /submit answer/i }));
}

beforeEach(() => {
  vi.clearAllMocks();
  window.localStorage.clear();

  if (!window.matchMedia) {
    Object.defineProperty(window, "matchMedia", {
      writable: true,
      value: vi.fn().mockImplementation((query) => ({
        matches: false,
        media: query,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      })),
    });
  }

  mocks.isConnected.mockResolvedValue(false);
  mocks.getPublicKey.mockResolvedValue(STELLAR_PK);
  mocks.requestAccess.mockResolvedValue(STELLAR_PK);
  mocks.getNetwork.mockResolvedValue("Test SDF Network ; September 2015");
  mocks.getAccount.mockResolvedValue({ accountId: STELLAR_PK });
  mocks.prepareTransaction.mockImplementation(async (tx) => tx);
  mocks.signTransaction.mockImplementation(async (xdr) => xdr);
  mocks.sendTransaction.mockResolvedValue({ status: "PENDING", hash: "abc" });
  mocks.getTransaction.mockResolvedValue({
    status: "SUCCESS",
    returnValue: { native: true },
  });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("wallet rejection and network error paths (e2e)", () => {
  it("shows a rejection message instead of an incorrect-answer toast and clears the spinner", async () => {
    mocks.signTransaction.mockRejectedValue(
      Object.assign(new Error("User rejected the request"), { code: 4001 }),
    );

    renderPuzzle();
    await submitAnswer();

    expect(
      await screen.findByText(/Transaction was rejected in Freighter/i),
    ).toBeInTheDocument();
    expect(screen.queryByText(/^Incorrect$/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Verifying on-chain/i)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /submit answer/i })).toBeEnabled();
  });

  it("shows a network error and re-enables submit when the RPC account lookup fails", async () => {
    mocks.getAccount.mockRejectedValue(new TypeError("Failed to fetch"));

    renderPuzzle();
    await submitAnswer();

    expect(
      await screen.findByText(
        /Network error: could not reach the Stellar network/i,
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText(/Verifying on-chain/i)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /submit answer/i })).toBeEnabled();
  });

  it("shows a network error when the RPC rejects the submitted transaction", async () => {
    mocks.sendTransaction.mockResolvedValue({
      status: "ERROR",
      error: { message: "RPC unavailable" },
    });

    renderPuzzle();
    await submitAnswer();

    expect(
      await screen.findByText(
        /Network error: could not reach the Stellar network/i,
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText(/Verifying on-chain/i)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /submit answer/i })).toBeEnabled();
  });

  it("stops the hint spinner and falls back to the local hint when the RPC fails", async () => {
    mocks.getAccount.mockRejectedValue(new Error("Network Error"));

    renderPuzzle();
    fireEvent.click(screen.getByRole("button", { name: /need a hint/i }));

    expect(await screen.findByText("Local fallback hint")).toBeInTheDocument();
    expect(screen.queryByText(/Loading hint/i)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /hide hint/i })).toBeDisabled();
  });

  it("reports a rejected wallet connection prompt without leaving the connect CTA in a loading state", async () => {
    mocks.requestAccess.mockRejectedValue(
      Object.assign(new Error("User rejected the request"), { code: 4001 }),
    );

    renderPuzzle();
    fireEvent.click(screen.getByRole("button", { name: /connect wallet/i }));

    await waitFor(() => {
      expect(
        screen.getByText("Wallet connection was rejected."),
      ).toBeInTheDocument();
    });
    expect(screen.queryByText(/Verifying on-chain/i)).not.toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /connect wallet/i }),
    ).toBeEnabled();
  });
});
