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

    // If filters are actually changing, invalidate caches
    const prevHasFilters = hasActiveFilterValues(prevFilters);
    const newHasFilters = hasActiveFilterValues(newFilters);

    if (
      prevHasFilters !== newHasFilters ||
      JSON.stringify(prevFilters) !== JSON.stringify(newFilters)
    ) {
      // Dynamically import to avoid circular dependency
      import("@/lib/store/task-cache-store")
        .then(({ useTaskCacheStore }) => {
          useTaskCacheStore.getState().clearCache();
        })
        .catch(console.error);
    }

    set({ filters: newFilters });
  },

  setSearchQuery: (query) => {
    const prevQuery = get().searchQuery;
    if (prevQuery !== query) {
      import("@/lib/store/task-cache-store")
        .then(({ useTaskCacheStore }) => {
          useTaskCacheStore.getState().clearCache();
        })
        .catch(console.error);
    }
    set({ searchQuery: query });
  },

  clearFilters: () => {
    import("@/lib/store/task-cache-store")
      .then(({ useTaskCacheStore }) => {
        useTaskCacheStore.getState().clearCache();
      })
      .catch(console.error);
    set({ filters: {}, searchQuery: "" });
  },
}));
