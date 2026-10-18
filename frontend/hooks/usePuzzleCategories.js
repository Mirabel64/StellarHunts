"use client";

import { useApiQuery } from "./useApiQuery";
import { fetchPuzzleCategories } from "../services/puzzleCategoryService";

/** Puzzle categories for the browse sidebar, cached for five minutes. */
export function usePuzzleCategories() {
  return useApiQuery({
    key: ["puzzles", "categories"],
    fn: fetchPuzzleCategories,
    staleTime: 5 * 60_000,
  });
}

export default usePuzzleCategories;
