"use client";

import { useState } from "react";

/**
 * Sidebar for browsing puzzle categories. Categories come from the API (or the
 * `categories` prop), the active one is highlighted, and on small screens the
 * list collapses behind a toggle button.
 */
export default function CategorySidebar({
  categories = [],
  activeSlug = null,
  onSelect = () => {},
  isLoading = false,
  error = null,
}) {
  const [open, setOpen] = useState(false);

  const select = (slug) => {
    onSelect(slug);
    setOpen(false);
  };

  return (
    <nav aria-label="Puzzle categories" className="w-full md:w-64 shrink-0">
      <button
        type="button"
        className="md:hidden w-full rounded-lg border border-white/20 px-4 py-2 text-left text-white"
        aria-expanded={open}
        aria-controls="puzzle-category-list"
        onClick={() => setOpen((v) => !v)}
      >
        Categories
      </button>

      <div
        id="puzzle-category-list"
        className={`${open ? "block" : "hidden"} md:block mt-2 md:mt-0`}
      >
        {isLoading && <p className="px-4 py-2 text-sm text-gray-400">Loading categories...</p>}
        {error && !isLoading && (
          <p role="alert" className="px-4 py-2 text-sm text-red-300">
            Could not load categories.
          </p>
        )}
        {!isLoading && !error && categories.length === 0 && (
          <p className="px-4 py-2 text-sm text-gray-400">No categories yet.</p>
        )}

        <ul className="space-y-1">
          <li>
            <button
              type="button"
              onClick={() => select(null)}
              aria-current={activeSlug === null ? "page" : undefined}
              className={`w-full rounded-lg px-4 py-2 text-left text-sm transition ${
                activeSlug === null
                  ? "bg-purple-600 text-white"
                  : "text-gray-300 hover:bg-white/10"
              }`}
            >
              All puzzles
            </button>
          </li>
          {categories.map((category) => {
            const active = category.slug === activeSlug;
            return (
              <li key={category.id ?? category.slug}>
                <button
                  type="button"
                  onClick={() => select(category.slug)}
                  aria-current={active ? "page" : undefined}
                  className={`w-full rounded-lg px-4 py-2 text-left text-sm transition ${
                    active ? "bg-purple-600 text-white" : "text-gray-300 hover:bg-white/10"
                  }`}
                >
                  {category.icon ? <span aria-hidden="true">{category.icon} </span> : null}
                  {category.name}
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    </nav>
  );
}
