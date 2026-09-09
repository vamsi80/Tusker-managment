import { ProjectCategory } from "../types";

/** Mirrors packages/core/src/lib/zodSchemas.ts PROJECT_CATEGORY_LABELS. */
export const PROJECT_CATEGORY_LABELS: Record<ProjectCategory, string> = {
    WHITE_TUSKER: "White Tusker",
    LATTICE_LANE: "Lattice Lane",
    MISCELLANEOUS: "Miscellaneous",
};

export const PROJECT_CATEGORY_OPTIONS: { value: ProjectCategory; label: string }[] = [
    { value: "WHITE_TUSKER", label: PROJECT_CATEGORY_LABELS.WHITE_TUSKER },
    { value: "LATTICE_LANE", label: PROJECT_CATEGORY_LABELS.LATTICE_LANE },
    { value: "MISCELLANEOUS", label: PROJECT_CATEGORY_LABELS.MISCELLANEOUS },
];

/** Short chip labels — mirrors web's sidebar CATEGORY_CHIPS (nav-projects.tsx). */
export const PROJECT_CATEGORY_CHIP_LABELS: Record<ProjectCategory, string> = {
    WHITE_TUSKER: "TWT",
    LATTICE_LANE: "PL/LL",
    MISCELLANEOUS: "Others",
};
