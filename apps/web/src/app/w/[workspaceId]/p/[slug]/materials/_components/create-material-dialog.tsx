"use client";

import React, { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

interface CreateMaterialDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    workspaceId: string;
    units: string[];
    initialName?: string;
    initialUnit?: string;
    onSuccess?: (material: { id: string; name: string; unit: string; defaultUnit?: { abbreviation: string } }) => void;
}

export function CreateMaterialDialog({
    open,
    onOpenChange,
    workspaceId,
    units,
    initialName = "",
    initialUnit = "",
    onSuccess,
}: CreateMaterialDialogProps) {
    const [name, setName] = useState("");
    const [unit, setUnit] = useState(units[0] || "PCS");
    const [isSubmitting, setIsSubmitting] = useState(false);

    useEffect(() => {
        if (open) {
            setName(initialName);
            if (initialUnit) {
                setUnit(initialUnit);
            } else {
                setUnit(units[0] || "PCS");
            }
        }
    }, [open, initialName, initialUnit, units]);

    const handleSubmit = async () => {
        if (!name.trim()) return;
        try {
            setIsSubmitting(true);
            const res = await fetch(`/api/v1/materials`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    workspaceId,
                    name: name.trim(),
                    unit: unit,
                }),
            });
            const resJson = await res.json();
            if (resJson.success) {
                toast.success(`Material "${name.trim()}" created successfully in catalog`);
                if (onSuccess) {
                    onSuccess(resJson.data);
                }
                onOpenChange(false);
            } else {
                toast.error(resJson.error || "Failed to create material");
            }
        } catch (err) {
            toast.error("An error occurred while creating the material catalog entry");
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-[400px]">
                <DialogHeader>
                    <DialogTitle className="text-sm font-bold uppercase tracking-wider text-foreground">
                        Create New Material
                    </DialogTitle>
                </DialogHeader>
                <div className="flex flex-col gap-4 py-4">
                    <div className="flex flex-col gap-1.5">
                        <Label htmlFor="new-material-name" className="text-xs font-bold text-muted-foreground uppercase">
                            Material Name
                        </Label>
                        <Input
                            id="new-material-name"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            placeholder="e.g. TMT Steel 10mm"
                            className="h-9 text-xs"
                        />
                    </div>
                    <div className="flex flex-col gap-1.5">
                        <Label htmlFor="new-material-unit" className="text-xs font-bold text-muted-foreground uppercase">
                            Default Unit
                        </Label>
                        <select
                            id="new-material-unit"
                            value={unit}
                            onChange={(e) => setUnit(e.target.value)}
                            className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-xs shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                        >
                            {units.map((u) => (
                                <option key={u} value={u} className="bg-background text-foreground">
                                    {u.toUpperCase()}
                                </option>
                            ))}
                        </select>
                    </div>
                </div>
                <DialogFooter>
                    <Button
                        type="button"
                        variant="outline"
                        onClick={() => onOpenChange(false)}
                        className="h-8 text-xs px-3"
                    >
                        Cancel
                    </Button>
                    <Button
                        type="button"
                        onClick={handleSubmit}
                        disabled={isSubmitting || !name.trim()}
                        className="h-8 text-xs px-3 bg-primary text-primary-foreground hover:bg-primary/90 font-semibold"
                    >
                        {isSubmitting ? "Creating..." : "Confirm"}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
