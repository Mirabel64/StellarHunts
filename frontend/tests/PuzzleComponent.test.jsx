import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

const contract = vi.hoisted(() => ({
  submitting: false,
  hintLoading: false,
  error: null,
  feedback: null,
  lastHint: null,
  walletConnected: true,
  walletAddress: "GABC123456789",
  isExtensionInstalled: true,
  unsupportedNetwork: false,
  walletError: null,
  connectWallet: vi.fn(),
  disconnectWallet: vi.fn(),
  submitAnswer: vi.fn(),
  requestHint: vi.fn(),
  clearFeedback: vi.fn(),
  checkWallet: vi.fn(),
}));

vi.mock("@/hooks/usePuzzleContract", () => ({
  usePuzzleContract: () => contract,
}));

import PuzzleComponent from "@/components/PuzzleComponent";

function renderPuzzle(puzzleData = { id: "puzzle-1", type: "number" }) {
  return render(<PuzzleComponent puzzleData={puzzleData} />);
}

beforeEach(() => {
  vi.clearAllMocks();
  window.localStorage.clear();
  contract.submitAnswer.mockResolvedValue({
    correct: false,
    submitted: true,
    message: "Incorrect answer. Try again!",
  });
});

afterEach(cleanup);

describe("PuzzleComponent answer validation and attempt history", () => {
  it("shows an inline numeric-format error without submitting", async () => {
    renderPuzzle();
    fireEvent.change(screen.getByLabelText("Your answer"), {
      target: { value: "not a number" },
    });
    fireEvent.click(screen.getByRole("button", { name: /submit answer/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Enter a valid number.");
    expect(contract.submitAnswer).not.toHaveBeenCalled();
  });

  it("submits valid answers and stores finalized attempts by puzzle", async () => {
    renderPuzzle();
    fireEvent.change(screen.getByLabelText("Your answer"), {
      target: { value: "42" },
    });
    fireEvent.click(screen.getByRole("button", { name: /submit answer/i }));

    await waitFor(() => {
      expect(screen.getByText("Incorrect")).toBeInTheDocument();
    });
    expect(contract.submitAnswer).toHaveBeenCalledWith("puzzle-1", "42");
    expect(
      JSON.parse(
        window.localStorage.getItem(
          "stellar-hunts:puzzle-attempts:puzzle-1",
        ),
      ),
    ).toMatchObject([{ answer: "42", correct: false }]);
  });

  it("renders a choice control and validates the selected option", async () => {
    renderPuzzle({
      id: "choice-1",
      content: {
        type: "multiple_choice",
        options: ["A", "B"],
      },
    });

    fireEvent.click(screen.getByRole("button", { name: /submit answer/i }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Enter an answer before submitting.",
    );
    expect(contract.submitAnswer).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText("Your answer"), {
      target: { value: "B" },
    });
    fireEvent.click(screen.getByRole("button", { name: /submit answer/i }));
    await waitFor(() => {
      expect(contract.submitAnswer).toHaveBeenCalledWith("choice-1", "B");
    });
  });

  it("prevents concurrent duplicate submits and restores saved history", async () => {
    let resolveSubmission;
    contract.submitAnswer.mockReturnValue(
      new Promise((resolve) => {
        resolveSubmission = resolve;
      }),
    );

    const { unmount } = renderPuzzle({ id: "history-1", type: "text" });
    fireEvent.change(screen.getByLabelText("Your answer"), {
      target: { value: "first try" },
    });
    const submitButton = screen.getByRole("button", { name: /submit answer/i });
    fireEvent.click(submitButton);
    fireEvent.click(submitButton);
    expect(contract.submitAnswer).toHaveBeenCalledTimes(1);

    resolveSubmission({ correct: true, submitted: true, message: "Correct" });
    await waitFor(() => {
      expect(screen.getByText("Correct")).toBeInTheDocument();
    });
    unmount();

    renderPuzzle({ id: "history-1", type: "text" });
    expect(await screen.findByText("first try")).toBeInTheDocument();
    expect(screen.getByText("Correct")).toBeInTheDocument();
  });
});
