import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { renderHook, waitFor as waitForHook } from "@testing-library/react";
import { Networks } from "@stellar/stellar-sdk";

const contract = vi.hoisted(() => ({
  submitting: false,
  hintLoading: false,
  error: null,
  feedback: null,
  lastHint: null,
  walletConnected: true,
  walletAddress: "GABC123456789",
  walletNetwork: null,
  expectedNetwork: null,
  isExtensionInstalled: true,
  unsupportedNetwork: false,
  switchSupported: false,
  switchNetwork: vi.fn(),
  walletError: null,
  connectWallet: vi.fn(),
  submitAnswer: vi.fn(),
  requestHint: vi.fn(),
  clearFeedback: vi.fn(),
  checkWallet: vi.fn(),
}));

vi.mock("@/hooks/usePuzzleContract", () => ({
  usePuzzleContract: () => contract,
}));

const mockIsConnected = vi.fn();
const mockGetPublicKey = vi.fn();
const mockRequestAccess = vi.fn();
const mockGetNetwork = vi.fn();

vi.mock("@stellar/freighter-api", () => ({
  isConnected: (...args) => mockIsConnected(...args),
  getPublicKey: (...args) => mockGetPublicKey(...args),
  requestAccess: (...args) => mockRequestAccess(...args),
  getNetwork: (...args) => mockGetNetwork(...args),
}));

import NetworkMismatchBanner from "@/components/NetworkMismatchBanner";
import PuzzleComponent from "@/components/PuzzleComponent";

beforeEach(() => {
  vi.clearAllMocks();
  window.localStorage.clear();
  window.matchMedia = vi.fn().mockImplementation((query) => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }));
  contract.unsupportedNetwork = false;
  contract.walletNetwork = null;
  contract.expectedNetwork = null;
  contract.switchSupported = false;
  contract.submitAnswer.mockResolvedValue({
    correct: false,
    submitted: true,
    message: "Incorrect answer. Try again!",
  });
});

afterEach(cleanup);

describe("NetworkMismatchBanner", () => {
  it("shows current and expected networks plus manual instructions", () => {
    render(
      <NetworkMismatchBanner
        currentNetwork={Networks.PUBLIC}
        expectedNetwork={Networks.TESTNET}
        canSwitch={false}
      />,
    );

    const alert = screen.getByRole("alert");
    expect(alert).toHaveTextContent(/wrong network/i);
    expect(alert).toHaveTextContent(/Mainnet/);
    expect(alert).toHaveTextContent(/Testnet/);
    expect(alert).toHaveTextContent(/submissions are disabled/i);
    expect(
      screen.queryByRole("button", { name: /switch to testnet/i }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /retry/i })).toBeInTheDocument();
  });

  it("offers a one-click switch when the wallet supports it", async () => {
    const onSwitch = vi.fn().mockResolvedValue({ supported: true, switched: true });

    render(
      <NetworkMismatchBanner
        currentNetwork={Networks.PUBLIC}
        expectedNetwork={Networks.TESTNET}
        canSwitch
        onSwitch={onSwitch}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /switch to testnet/i }));

    expect(onSwitch).toHaveBeenCalledTimes(1);
    expect(await screen.findByText(/switched to testnet/i)).toBeInTheDocument();
  });
});

describe("PuzzleComponent network guard", () => {
  it("disables submission and renders the warning on the wrong network", () => {
    contract.unsupportedNetwork = true;
    contract.walletNetwork = Networks.PUBLIC;
    contract.expectedNetwork = Networks.TESTNET;

    render(<PuzzleComponent puzzleData={{ id: "puzzle-1", type: "number" }} />);

    expect(screen.getByRole("alert")).toHaveTextContent(/wrong network/i);
    expect(
      screen.getByRole("button", { name: /submit answer/i }),
    ).toBeDisabled();

    fireEvent.change(screen.getByLabelText("Your answer"), {
      target: { value: "42" },
    });
    fireEvent.click(screen.getByRole("button", { name: /submit answer/i }));

    expect(contract.submitAnswer).not.toHaveBeenCalled();
  });
});

describe("useWalletConnection switchNetwork", () => {
  beforeEach(() => {
    mockIsConnected.mockResolvedValue(true);
    mockGetPublicKey.mockResolvedValue(
      "GAHJJJKMOKYE4RVPZEWZTKH5FVI4PA3VL7GK2LFNUBSGBRZLVIXWOI5",
    );
    mockGetNetwork.mockResolvedValue(Networks.TESTNET);
    mockRequestAccess.mockResolvedValue(
      "GAHJJJKMOKYE4RVPZEWZTKH5FVI4PA3VL7GK2LFNUBSGBRZLVIXWOI5",
    );
  });

  it("calls the wallet switch API and refreshes when supported", async () => {
    const changeNetwork = vi.fn().mockResolvedValue(undefined);
    window.freighter = { changeNetwork };

    const { useWalletConnection } = await import("@/hooks/useWalletConnection");
    const { result } = renderHook(() =>
      useWalletConnection({ pollInterval: 60_000 }),
    );

    await waitForHook(() => expect(result.current.unsupportedNetwork).toBe(true));

    let outcome;
    await act(async () => {
      outcome = await result.current.switchNetwork();
    });
    expect(outcome.switched).toBe(true);
    expect(changeNetwork).toHaveBeenCalledWith("PUBLIC");

    delete window.freighter;
  });

  it("reports unsupported when no switching API exists", async () => {
    delete window.freighter;
    delete window.stellarWallets;
    delete window.stellarWalletsKit;
    delete window.freighterApi;

    const { useWalletConnection } = await import("@/hooks/useWalletConnection");
    const { result } = renderHook(() =>
      useWalletConnection({ pollInterval: 60_000 }),
    );

    await waitForHook(() => expect(result.current.unsupportedNetwork).toBe(true));

    let outcome;
    await act(async () => {
      outcome = await result.current.switchNetwork();
    });
    expect(outcome.supported).toBe(false);
  });
});
