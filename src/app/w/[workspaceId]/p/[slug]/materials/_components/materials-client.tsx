"use client";

import { useState, useMemo, useEffect } from "react";
import { Package, AlignLeft, Info, HelpCircle } from "lucide-react";
import { MaterialsFilters } from "./materials-filters";
import { MaterialsTable } from "./materials-table";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { toast } from "sonner";
import { AppLoader } from "@/components/shared/app-loader";

interface Material {
    id: string;
    name: string;
    unit: string;
    quantity: number;
    specifications?: string;
    status: "DRAFT" | "SUBMITTED" | "APPROVED" | "CANCELLED";
    addedBy: string;
    subtaskId: string | null;
    subtaskNameSnapshot?: string | null;
    parentTaskNameSnapshot?: string | null;
}

interface SubtaskHierarchy {
    id: string;
    name: string;
    taskName: string; // Parent task name
    status: "TODO" | "IN_PROGRESS" | "REVIEW" | "COMPLETED" | "DELETED";
    materials: Material[];
}

// interface MaterialsClientProps {
//     workspaceId: string;
//     projectId: string;
// }

export function MaterialsClient({ workspaceId, projectId }: { workspaceId: string; projectId: string }) {
    const [subtasks, setSubtasks] = useState<any[]>([]);
    const [materialItems, setMaterialItems] = useState<any[]>([]);
    const [unitsOfMeasure, setUnitsOfMeasure] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);

    const [searchQuery, setSearchQuery] = useState("");
    const [selectedTask, setSelectedTask] = useState("all");
    const [selectedStatus, setSelectedStatus] = useState("all");
    const [selectedUnit, setSelectedUnit] = useState("all");

    // Fetch materials, subtasks, and units
    const fetchData = async () => {
        try {
            const [materialsRes, unitsRes] = await Promise.all([
                fetch(`/api/v1/projects/${projectId}/materials?w=${workspaceId}`),
                fetch(`/api/v1/procurement/indents/units?w=${workspaceId}`),
            ]);

            const materialsData = await materialsRes.json();
            const unitsData = await unitsRes.json();

            if (materialsData.success) {
                setSubtasks(materialsData.data.subtasks || []);
                setMaterialItems(materialsData.data.materialItems || []);
            }
            if (unitsData.success) {
                setUnitsOfMeasure(unitsData.data || []);
            }
        } catch (error) {
            console.error("Error loading planning materials:", error);
            toast.error("Failed to load project materials");
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchData();
    }, [projectId, workspaceId]);

    // Grouping logic (Distribute materials under their subtasks)
    const groupedData = useMemo(() => {
        const subtaskMap = new Map<string, SubtaskHierarchy>();

        // Pre-populate all matching subtasks
        subtasks.forEach((st) => {
            subtaskMap.set(st.id, {
                id: st.id,
                name: st.name,
                taskName: st.parentTask?.name || "Uncategorized Work",
                status: st.status || "TODO",
                materials: [],
            });
        });

        const orphanedMaterials: Material[] = [];

        materialItems.forEach((item) => {
            const shapedMaterial: Material = {
                id: item.id,
                name: item.materialName,
                unit: item.unit,
                quantity: item.quantity,
                specifications: item.notes || "",
                status: "DRAFT", // Planning materials are always draft/planned by default
                addedBy: `${item.addedBy?.user?.name || ""} ${item.addedBy?.user?.surname || ""}`.trim(),
                subtaskId: item.subtaskId,
                subtaskNameSnapshot: item.subtaskNameSnapshot,
                parentTaskNameSnapshot: item.parentTaskNameSnapshot,
            };

            if (item.subtaskId && subtaskMap.has(item.subtaskId)) {
                subtaskMap.get(item.subtaskId)!.materials.push(shapedMaterial);
            } else {
                orphanedMaterials.push(shapedMaterial);
            }
        });

        const hierarchy = Array.from(subtaskMap.values());

        // If there are orphaned materials, add a special virtual subtask parent row
        if (orphanedMaterials.length > 0) {
            hierarchy.push({
                id: "orphaned",
                name: "Orphaned Materials (Associated Tasks Deleted)",
                taskName: "Deleted Tasks",
                status: "DELETED",
                materials: orphanedMaterials,
            });
        }

        return hierarchy;
    }, [subtasks, materialItems]);

    // Dynamically extract lists for filters
    const taskOptions = useMemo(() => {
        const tasks = new Set<string>();
        groupedData.forEach((item) => {
            if (item.taskName) tasks.add(item.taskName);
        });
        return Array.from(tasks).sort();
    }, [groupedData]);

    const statusOptions = useMemo(() => {
        const statuses = new Set<string>();
        groupedData.forEach((item) => {
            item.materials.forEach((m) => {
                if (m.status) statuses.add(m.status);
            });
        });
        return Array.from(statuses).sort();
    }, [groupedData]);

    const unitOptions = useMemo(() => {
        if (unitsOfMeasure.length > 0) {
            return unitsOfMeasure.map((u) => u.abbreviation).sort();
        }
        const units = new Set<string>();
        groupedData.forEach((item) => {
            item.materials.forEach((m) => {
                if (m.unit) units.add(m.unit);
            });
        });
        return Array.from(units).sort();
    }, [groupedData, unitsOfMeasure]);

    // Filter logic
    const filteredData = useMemo(() => {
        return groupedData
            .map((subtask) => {
                // Filter individual materials first
                const matchedMaterials = subtask.materials.filter((material) => {
                    const matchesSearch =
                        material.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                        (material.specifications &&
                            material.specifications.toLowerCase().includes(searchQuery.toLowerCase()));
                    const matchesStatus = selectedStatus === "all" || material.status === selectedStatus;
                    const matchesUnit = selectedUnit === "all" || material.unit === selectedUnit;

                    return matchesSearch && matchesStatus && matchesUnit;
                });

                // Check if the subtask/parent row itself matches search query
                const subtaskNameMatches =
                    subtask.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                    subtask.taskName.toLowerCase().includes(searchQuery.toLowerCase());

                // If subtask name matches and we haven't filtered materials out, keep all materials or filtered ones
                const finalMaterials = subtaskNameMatches && searchQuery !== "" && matchedMaterials.length === 0
                    ? subtask.materials.filter((m) => {
                        const matchesStatus = selectedStatus === "all" || m.status === selectedStatus;
                        const matchesUnit = selectedUnit === "all" || m.unit === selectedUnit;
                        return matchesStatus && matchesUnit;
                    })
                    : matchedMaterials;

                // Parent filter checks
                const matchesTask = selectedTask === "all" || subtask.taskName === selectedTask;

                return {
                    ...subtask,
                    materials: finalMaterials,
                    matchesTask
                };
            })
            .filter((subtask) => {
                if (!subtask.matchesTask) return false;

                // Show empty procurement subtasks only when not searching/filtering
                if (searchQuery !== "" || selectedStatus !== "all" || selectedUnit !== "all") {
                    return subtask.materials.length > 0;
                }
                return true;
            });
    }, [groupedData, searchQuery, selectedTask, selectedStatus, selectedUnit]);

    // const totalMaterialsCount = useMemo(() => {
    //     return filteredData.reduce((acc, curr) => acc + curr.materials.length, 0);
    // }, [filteredData]);

    const handleReset = () => {
        setSearchQuery("");
        setSelectedTask("all");
        setSelectedStatus("all");
        setSelectedUnit("all");
    };

    // CRUD Callbacks
    const handleAddMaterial = async (subtaskId: string | null, materialName: string, unit: string, quantity: number, notes?: string) => {
        try {
            const res = await fetch(`/api/v1/projects/${projectId}/materials?w=${workspaceId}`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    subtaskId: subtaskId === "orphaned" ? null : subtaskId,
                    materialName,
                    unit,
                    quantity,
                    notes: notes || null,
                }),
            });
            const data = await res.json();
            if (data.success) {
                toast.success("Material requirement added");
                fetchData();
            } else {
                toast.error(data.error || "Failed to add material requirement");
            }
        } catch (error) {
            toast.error("An error occurred while saving the material requirement");
        }
    };

    const handleEditMaterial = async (itemId: string, materialName: string, unit: string, quantity: number, notes?: string) => {
        try {
            const res = await fetch(`/api/v1/projects/${projectId}/materials/${itemId}?w=${workspaceId}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    materialName,
                    unit,
                    quantity,
                    notes: notes || null,
                }),
            });
            const data = await res.json();
            if (data.success) {
                toast.success("Material requirement updated");
                fetchData();
            } else {
                toast.error(data.error || "Failed to update material requirement");
            }
        } catch (error) {
            toast.error("An error occurred while updating the material requirement");
        }
    };

    const handleDeleteMaterial = async (itemId: string) => {
        try {
            const res = await fetch(`/api/v1/projects/${projectId}/materials/${itemId}?w=${workspaceId}`, {
                method: "DELETE",
            });
            const data = await res.json();
            if (data.success) {
                toast.success("Material requirement deleted");
                fetchData();
            } else {
                toast.error(data.error || "Failed to delete material requirement");
            }
        } catch (error) {
            toast.error("An error occurred while deleting the material requirement");
        }
    };

    if (loading) {
        return (
            <div className="flex-1 flex items-center justify-center h-96">
                <AppLoader />
            </div>
        );
    }

    return (
        <div className="flex-1 flex flex-col gap-5 min-h-0">
            {/* Filter Toolbar */}
            <MaterialsFilters
                searchQuery={searchQuery}
                onSearchChange={setSearchQuery}
                selectedTask={selectedTask}
                onTaskChange={setSelectedTask}
                selectedStatus={selectedStatus}
                onStatusChange={setSelectedStatus}
                selectedUnit={selectedUnit}
                onUnitChange={setSelectedUnit}
                tasks={taskOptions}
                statuses={statusOptions}
                units={unitOptions}
                onReset={handleReset}
            />

            {/* Hierarchy Table */}
            <div className="flex-1 min-h-0 overflow-y-auto">
                <MaterialsTable
                    data={filteredData}
                    workspaceId={workspaceId}
                    units={unitOptions.length > 0 ? unitOptions : ["KG", "PCS", "MTR", "BAGS", "TONS", "CFT", "CUM", "REELS"]}
                    onAddMaterial={handleAddMaterial}
                    onEditMaterial={handleEditMaterial}
                    onDeleteMaterial={handleDeleteMaterial}
                />
            </div>
        </div>
    );
}
