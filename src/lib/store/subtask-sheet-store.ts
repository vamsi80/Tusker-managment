import { create } from 'zustand';

interface SubTaskSheetState {
    subTask: any | null;
    isOpen: boolean;
    openSubTaskSheet: (subTask: any) => void;
    openSubTaskSheetLoading: () => void;
    closeSubTaskSheet: () => void;
    patchSubTask: (updatedData: any) => void;
}

export const useSubTaskSheetStore = create<SubTaskSheetState>((set) => ({
    subTask: null,
    isOpen: false,

    openSubTaskSheet: (task: any) => {
        if (typeof window !== 'undefined') {
            (window as any).lastSheetOpenClick = performance.now();
        }

        // Defensive check: Ensure status is not an object (DateRange corruption)
        if (task && task.status && typeof task.status !== 'string') {
            console.warn("🚨 [SubTaskSheetStore] Sanitizing corrupted status (object -> string):", task.status);
            task = { ...task, status: 'TO_DO' };
        }

        set({ subTask: task, isOpen: true });
    },

    openSubTaskSheetLoading: () => {
        if (typeof window !== 'undefined') {
            (window as any).lastSheetOpenClick = performance.now();
        }
        set({ subTask: null, isOpen: true });
    },

    closeSubTaskSheet: () => {
        set({ isOpen: false });
        // Delay clearing the task to allow for smooth exit animation
        setTimeout(() => {
            set({ subTask: null });
        }, 250);
    },

    patchSubTask: (updatedData: any) => {
        set((state) => {
            if (!state.subTask) return state;

            let sanitizedData = updatedData;
            // Defensive check: Ensure incoming patch doesn't corrupt the status
            if (updatedData && updatedData.status && typeof updatedData.status !== 'string') {
                console.warn("🚨 [SubTaskSheetStore] Rejecting corrupted status patch:", updatedData.status);
                const { status, ...rest } = updatedData;
                sanitizedData = rest;
            }

            return {
                subTask: {
                    ...state.subTask,
                    ...sanitizedData
                }
            };
        });
    },
}));
