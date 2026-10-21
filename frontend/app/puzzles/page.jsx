"use client";

import { useState } from "react";
import CategorySidebar from "@/components/puzzles/CategorySidebar";
import { usePuzzleCategories } from "@/hooks/usePuzzleCategories";

export default function PuzzlesPage() {
  const [activeSlug, setActiveSlug] = useState(null);
  const { data, isLoading, error } = usePuzzleCategories();
  const categories = data ?? [];
  const active = categories.find((c) => c.slug === activeSlug);

  return (
    <main className="min-h-screen bg-gradient-to-b from-[#0f0c29] via-[#302b63] to-[#24243e] text-white py-12 px-4 md:px-16">
      <h1 className="text-4xl font-bold mb-8">Puzzles</h1>
      <div className="flex flex-col md:flex-row gap-8">
        <CategorySidebar
          categories={categories}
          activeSlug={activeSlug}
          onSelect={setActiveSlug}
          isLoading={isLoading}
          error={error}
        />
        <section className="flex-1" aria-live="polite">
          <h2 className="text-2xl font-semibold mb-2">
            {active ? active.name : "All puzzles"}
          </h2>
          {active?.description && <p className="text-gray-300">{active.description}</p>}
        </section>
      </div>
    </main>
  );
}
