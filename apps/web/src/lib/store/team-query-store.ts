import { create } from 'zustand';

interface TeamQueryState {
    isQuerying: boolean;
    setIsQuerying: (isQuerying: boolean) => void;
}

export const useTeamQueryStore = create<TeamQueryState>((set) => ({
    isQuerying: false,
    setIsQuerying: (isQuerying: boolean) => set({ isQuerying }),
}));
