import { apiClient } from "@/lib/api";

/** Loads the puzzle categories (name, slug, icon) from the backend. */
export async function fetchPuzzleCategories() {
  const data = await apiClient.get("/puzzle-categories/categories");
  return Array.isArray(data) ? data : data?.data ?? [];
}
