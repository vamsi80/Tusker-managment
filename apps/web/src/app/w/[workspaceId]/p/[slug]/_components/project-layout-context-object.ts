import { createContext } from "react";
import type { ProjectLayoutContextType } from "@/types/project";

// Re-exported for existing importers; the canonical definition now lives in @/types/project.
export type { ProjectLayoutContextType };

export const ProjectLayoutContext = createContext<ProjectLayoutContextType | null>(null);
