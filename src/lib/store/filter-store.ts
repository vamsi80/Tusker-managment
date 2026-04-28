import { create } from "zustand";
import { TaskFilters } from "@/components/task/shared/types";

interface FilterState {
  filters: TaskFilters;
  searchQuery: string;

  // Actions
  setFilters: (
    filters: TaskFilters | ((prev: TaskFilters) => TaskFilters),
  ) => void;
  setSearchQuery: (query: string) => void;
  clearFilters: () => void;
}

// Helper to check if filters have any active values
function hasActiveFilterValues(filters: TaskFilters): boolean {
  return Object.values(filters).some(
    (v) =>
      v !== undefined &&
      v !== "" &&
      v !== null &&
      (Array.isArray(v) ? v.length > 0 : true),
  );
}

export const useFilterStore = create<FilterState>()((set, get) => ({
  filters: {},
  searchQuery: "",

  setFilters: (filters) => {
    const prevFilters = get().filters;
    const newFilters =
      typeof filters === "function" ? filters(prevFilters) : filters;
    set({ filters: newFilters });
  },

  setSearchQuery: (query) => {
    set({ searchQuery: query });
  },

  clearFilters: () => {
    set({ filters: {}, searchQuery: "" });
  },
}));
