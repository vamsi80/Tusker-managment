import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { TaskFilters } from '@/components/task/shared/types';

interface FilterState {
    filters: TaskFilters;
    searchQuery: string;
    
    // Actions
    setFilters: (filters: TaskFilters | ((prev: TaskFilters) => TaskFilters)) => void;
    setSearchQuery: (query: string) => void;
    clearFilters: () => void;
}

export const useFilterStore = create<FilterState>()(
    persist(
        (set) => ({
            filters: {},
            searchQuery: "",

            setFilters: (filters) => set((state) => ({
                filters: typeof filters === 'function' ? filters(state.filters) : filters
            })),

            setSearchQuery: (query) => set({ searchQuery: query }),

            clearFilters: () => set({ filters: {}, searchQuery: "" }),
        }),
        {
            name: 'tusker-task-filters',
            storage: createJSONStorage(() => localStorage),
        }
    )
);
