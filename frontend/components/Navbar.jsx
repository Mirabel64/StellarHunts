"use client";
import React, { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Menu, X, Gamepad, Trophy, Book, User, Users } from "lucide-react";
import ThemeToggle from "@/components/ThemeToggle";

const NAV_LINKS = [
  { href: "/game", label: "Play Now", icon: Gamepad },
  { href: "/leaderboard", label: "Leaderboard", icon: Trophy },
  { href: "/learn", label: "Learn", icon: Book },
  { href: "/invite-friends", label: "Invite Friends", icon: Users },
];

const NavigationHeader = () => {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const toggleRef = useRef(null);

  // Escape closes the mobile menu and returns focus to the control that
  // opened it, so a keyboard user is never stranded inside a collapsed menu.
  useEffect(() => {
    if (!isMenuOpen) return undefined;

    const onKeyDown = (event) => {
      if (event.key === "Escape") {
        setIsMenuOpen(false);
        toggleRef.current?.focus();
      }
    };

    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [isMenuOpen]);

  const closeMenu = () => setIsMenuOpen(false);

  return (
    <header className="fixed top-0 left-0 right-0 z-50">
      {/* First focusable element on the page: lets keyboard users skip the
          navigation without tabbing through every link. */}
      <a href="#main-content" className="skip-link">
        Skip to main content
      </a>
      {/* Gradient border bottom */}
      <div className="absolute bottom-0 left-0 right-0 h-[1px] bg-gradient-to-r from-transparent via-purple-500/50 to-transparent" />

      {/* Blur backdrop */}
      {/* A near-opaque background keeps the light navigation text readable
          against light pages; black/20 over the white home page left the
          links at roughly 1.2:1 contrast. */}
      <div className="backdrop-blur-md bg-slate-950/90 border-b border-white/10">
        <nav aria-label="Main navigation" className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            {/* Logo and brand */}
            <Link href="/" className="flex items-center space-x-2">
              <div className="w-10 h-10 rounded-lg bg-gradient-to-r from-purple-500 to-pink-500 flex items-center justify-center">
                <Gamepad aria-hidden="true" focusable="false" className="w-6 h-6 text-white" />
              </div>
              <span className="text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-purple-400 to-pink-600">
                NFT Hunt
              </span>
            </Link>

            {/* Desktop navigation */}
            <div className="hidden md:flex md:items-center md:space-x-6">
              {NAV_LINKS.map(({ href, label, icon: Icon }) => (
                <Link
                  key={href}
                  href={href}
                  className="text-gray-300 hover:text-white transition-colors flex items-center space-x-2"
                >
                  <Icon aria-hidden="true" focusable="false" className="w-4 h-4" />
                  <span>{label}</span>
                </Link>
              ))}
              <Button
                asChild
                className="bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600"
              >
                <Link href="/connect-wallet" className="flex items-center space-x-2">
                  <User aria-hidden="true" focusable="false" className="w-4 h-4 mr-2" />
                  <span>Connect Wallet</span>
                </Link>
              </Button>
            </div>

            {/* Mobile menu button */}
            <div className="md:hidden">
              <Button
                ref={toggleRef}
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => setIsMenuOpen((open) => !open)}
                aria-label={isMenuOpen ? "Close navigation menu" : "Open navigation menu"}
                aria-expanded={isMenuOpen}
                aria-controls="mobile-navigation"
                className="text-gray-300 hover:text-white"
              >
                {isMenuOpen ? (
                  <X aria-hidden="true" focusable="false" className="w-6 h-6" />
                ) : (
                  <Menu aria-hidden="true" focusable="false" className="w-6 h-6" />
                )}
              </Button>
            </div>
          </div>
        </nav>

        {/* Mobile menu */}
        <div
          id="mobile-navigation"
          hidden={!isMenuOpen}
          className="md:hidden backdrop-blur-md bg-slate-950/95"
        >
          <div className="px-2 pt-2 pb-3 space-y-1">
            {NAV_LINKS.map(({ href, label, icon: Icon }) => (
              <Link
                key={href}
                href={href}
                onClick={closeMenu}
                className="block px-3 py-2 rounded-md text-gray-300 hover:text-white hover:bg-white/10 transition-colors flex items-center space-x-2"
              >
                <Icon aria-hidden="true" focusable="false" className="w-4 h-4" />
                <span>{label}</span>
              </Link>
            ))}
            <div className="px-3 py-2">
              <Button
                asChild
                className="w-full bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600"
              >
                <Link href="/connect-wallet" onClick={closeMenu}>
                  <User aria-hidden="true" focusable="false" className="w-4 h-4 mr-2" />
                  <span>Connect Wallet</span>
                </Link>
              </Button>
            </div>
          </div>
        </div>
      </div>
    </header>
  );
};

export default NavigationHeader;
