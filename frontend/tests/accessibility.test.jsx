import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import React from "react";

import Navbar from "@/components/Navbar";
import SearchBar from "@/components/SearchBar";
import Pagination from "@/components/Pagination";
import {
  LoadingState,
  ErrorState,
  EmptyState,
} from "@/components/ui/StateDisplay";
import HomePage from "@/app/page.tsx";

vi.mock("next-auth/react", () => ({
  useSession: () => ({ data: null, status: "unauthenticated" }),
}));

describe("Skip link and landmarks", () => {
  it("offers a skip link before the navigation", () => {
    const { container } = render(<Navbar />);

    const skipLink = screen.getByRole("link", {
      name: /skip to main content/i,
    });

    expect(skipLink).toHaveAttribute("href", "#main-content");
    expect(container.querySelector("header")?.firstElementChild).toBe(skipLink);
  });

  it("renders the home page as a main landmark", () => {
    render(<HomePage />);

    expect(screen.getByRole("main")).toHaveAttribute("id", "main-content");
  });
});

describe("Navigation", () => {
  it("names the mobile menu control and exposes its state", () => {
    render(<Navbar />);

    const toggle = screen.getByRole("button", {
      name: /open navigation menu/i,
    });

    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(toggle).toHaveAttribute("aria-controls", "mobile-navigation");

    fireEvent.click(toggle);

    expect(
      screen.getByRole("button", { name: /close navigation menu/i }),
    ).toHaveAttribute("aria-expanded", "true");
    const mobileMenu = document.getElementById("mobile-navigation");
    expect(mobileMenu).not.toBeNull();
    expect(
      within(mobileMenu).getByRole("link", { name: /invite friends/i }),
    ).toBeInTheDocument();
  });

  it("closes the mobile menu with Escape and restores focus to the toggle", () => {
    render(<Navbar />);

    const toggle = screen.getByRole("button", {
      name: /open navigation menu/i,
    });
    fireEvent.click(toggle);

    fireEvent.keyDown(document, { key: "Escape" });

    const reopened = screen.getByRole("button", {
      name: /open navigation menu/i,
    });
    expect(reopened).toHaveAttribute("aria-expanded", "false");
    expect(reopened).toHaveFocus();
  });

  it("does not nest a link inside a button", () => {
    render(<Navbar />);

    const connect = screen.getByRole("link", { name: /connect wallet/i });
    expect(connect.closest("button")).toBeNull();
  });
});

describe("Form and list semantics", () => {
  it("gives the search input an accessible name", () => {
    render(<SearchBar value="" onChange={() => {}} />);

    expect(
      screen.getByRole("searchbox", { name: /search/i }),
    ).toBeInTheDocument();
  });

  it("marks the current page and exposes pagination as a labelled list", () => {
    const onPageChange = vi.fn();
    render(
      <Pagination currentPage={2} totalPages={4} onPageChange={onPageChange} />,
    );

    expect(
      screen.getByRole("navigation", { name: /pagination/i }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Page 2" })).toHaveAttribute(
      "aria-current",
      "page",
    );

    fireEvent.click(screen.getByRole("button", { name: "Next page" }));
    expect(onPageChange).toHaveBeenCalledWith(3);
  });
});

describe("Status and error announcements", () => {
  it("announces loading state", () => {
    render(<LoadingState message="Loading your referrals..." />);

    expect(screen.getByRole("status")).toBeInTheDocument();
    expect(
      screen.getByText(/loading your referrals/i),
    ).toBeInTheDocument();
  });

  it("announces errors and offers a labelled retry control", () => {
    const onRetry = vi.fn();
    render(<ErrorState error="Network unavailable" onRetry={onRetry} />);

    expect(screen.getByRole("alert")).toHaveTextContent(/network unavailable/i);

    fireEvent.click(screen.getByRole("button", { name: /try again/i }));
    expect(onRetry).toHaveBeenCalled();
  });

  it("hides decorative empty-state icons from assistive technology", () => {
    render(<EmptyState title="Nothing here yet" />);

    expect(screen.getByText("Nothing here yet")).toBeInTheDocument();
    expect(document.querySelector(".lucide-inbox")).toHaveAttribute(
      "aria-hidden",
      "true",
    );
  });
});
