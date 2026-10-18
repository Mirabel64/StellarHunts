import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

const motion = vi.hoisted(() => ({ reduced: false }));
vi.mock("@/hooks/useReducedMotion", () => ({
  useReducedMotion: () => motion.reduced,
}));

import Confetti from "@/components/puzzles/Confetti";
import ShareCompletion from "@/components/puzzles/ShareCompletion";
import CategorySidebar from "@/components/puzzles/CategorySidebar";
import { buildShareText, buildXShareUrl } from "@/lib/share";

afterEach(() => {
  cleanup();
  motion.reduced = false;
});

describe("Confetti", () => {
  it("renders non-interactive pieces when active", () => {
    render(<Confetti active />);
    const layer = screen.getByTestId("confetti");
    expect(layer.className).toContain("pointer-events-none");
  });

  it("renders nothing when inactive or when reduced motion is preferred", () => {
    const { rerender } = render(<Confetti active={false} />);
    expect(screen.queryByTestId("confetti")).toBeNull();
    motion.reduced = true;
    rerender(<Confetti active />);
    expect(screen.queryByTestId("confetti")).toBeNull();
  });

  it("calls onDone after the duration", async () => {
    const onDone = vi.fn();
    render(<Confetti active durationMs={20} onDone={onDone} />);
    await waitFor(() => expect(onDone).toHaveBeenCalled());
  });
});

describe("share helpers", () => {
  it("never leaks the puzzle id or answer in the share text", () => {
    expect(buildShareText("Simple Math")).toContain("Simple Math");
  });

  it("builds an X intent URL", () => {
    const url = buildXShareUrl("Simple Math", "https://example.com");
    expect(url.startsWith("https://twitter.com/intent/tweet?")).toBe(true);
    expect(url).toContain("url=https%3A%2F%2Fexample.com");
  });
});

describe("ShareCompletion", () => {
  it("opens X through a plain link with safe rel", () => {
    render(<ShareCompletion puzzleTitle="Simple Math" />);
    const link = screen.getByRole("link", { name: "Share on X" });
    expect(link).toHaveAttribute("target", "_blank");
    expect(link.getAttribute("rel")).toContain("noopener");
  });

  it("copies the link and reports success, or a fallback message on failure", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });
    render(<ShareCompletion puzzleTitle="Simple Math" />);
    fireEvent.click(screen.getByRole("button", { name: "Copy link" }));
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Link copied"));

    writeText.mockRejectedValueOnce(new Error("denied"));
    fireEvent.click(screen.getByRole("button", { name: "Copy link" }));
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Copy failed"));
  });
});

describe("CategorySidebar", () => {
  const categories = [
    { id: "1", name: "Cryptography", slug: "cryptography" },
    { id: "2", name: "Soroban", slug: "soroban" },
  ];

  it("lists categories and marks the active one", () => {
    render(<CategorySidebar categories={categories} activeSlug="soroban" />);
    expect(screen.getByRole("button", { name: "Soroban" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("button", { name: "Cryptography" })).not.toHaveAttribute("aria-current");
  });

  it("reports selections and supports the mobile toggle", () => {
    const onSelect = vi.fn();
    render(<CategorySidebar categories={categories} onSelect={onSelect} />);
    const toggle = screen.getByRole("button", { name: "Categories" });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    fireEvent.click(screen.getByRole("button", { name: "Cryptography" }));
    expect(onSelect).toHaveBeenCalledWith("cryptography");
  });

  it("shows loading, error and empty states", () => {
    const { rerender } = render(<CategorySidebar isLoading />);
    expect(screen.getByText("Loading categories...")).toBeInTheDocument();
    rerender(<CategorySidebar error={new Error("x")} />);
    expect(screen.getByRole("alert")).toHaveTextContent("Could not load categories.");
    rerender(<CategorySidebar categories={[]} />);
    expect(screen.getByText("No categories yet.")).toBeInTheDocument();
  });
});
