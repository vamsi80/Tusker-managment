import { create } from "zustand";
import { TaskFilters } from "@/components/task/shared/types";

interface FilterState {
  filters: TaskFilters;
  searchQuery: string;
  tags: { id: string; name: string }[];
  tagsFetched: Record<string, boolean>;

  // Actions
  setFilters: (
    filters: TaskFilters | ((prev: TaskFilters) => TaskFilters),
  ) => void;
  setSearchQuery: (query: string) => void;
  clearFilters: () => void;
  setTags: (tags: { id: string; name: string }[], workspaceId: string) => void;
  isCurrentlyFiltered: boolean;
  setIsCurrentlyFiltered: (v: boolean) => void;
}

export const useFilterStore = create<FilterState>()((set, get) => ({
  filters: {},
  searchQuery: "",
  tags: [],
  tagsFetched: {},

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

  setTags: (tags, workspaceId) => {
    set((state) => ({
      tags,
      tagsFetched: { ...state.tagsFetched, [workspaceId]: true }
    }));
  },

  isCurrentlyFiltered: false,
  setIsCurrentlyFiltered: (v) => set({ isCurrentlyFiltered: v }),
}));
