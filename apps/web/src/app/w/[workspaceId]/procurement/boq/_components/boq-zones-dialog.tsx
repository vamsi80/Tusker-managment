"use client";

import { useState } from "react";
import { Check, Pencil, Plus, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { apiJson, toastError } from "../../_components/boq-shared";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  workspaceId: string;
  projectId: string;
  zones: { id: string; name: string }[];
  canEdit: boolean;
  onChanged: () => void;
}

/** Spaces are per project, so every BOQ and revision of the project shares them. */
export function BoqZonesDialog({ open, onOpenChange, workspaceId, projectId, zones, canEdit, onChanged }: Props) {
  const [newName, setNewName] = useState("");
  const [editing, setEditing] = useState<{ id: string; name: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    try {
      await fn();
      onChanged();
    } catch (e) {
      toastError(e, "Could not update zones");
    } finally {
      setBusy(false);
    }
  };

  const base = `/api/v1/procurement/boq/zones`;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Spaces / zones</DialogTitle>
          <DialogDescription>Reception, Room A, Canteen... Shared by every BOQ in this project.</DialogDescription>
        </DialogHeader>

        <ul className="divide-y rounded-md border">
          {zones.length === 0 && <li className="p-3 text-sm text-muted-foreground">No zones yet.</li>}
          {zones.map((z) => (
            <li key={z.id} className="flex items-center gap-2 p-2">
              {editing?.id === z.id ? (
                <>
                  <Input value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} className="h-8" autoFocus />
                  <Button
                    size="icon"
                    variant="ghost"
                    className="size-8"
                    disabled={busy || !editing.name.trim()}
                    aria-label="Save zone name"
                    onClick={() =>
                      run(async () => {
                        await apiJson(`${base}/${z.id}?w=${workspaceId}`, { method: "PATCH", json: { projectId, name: editing.name.trim() } });
                        setEditing(null);
                      })
                    }
                  >
                    <Check className="size-4" />
                  </Button>
                  <Button size="icon" variant="ghost" className="size-8" onClick={() => setEditing(null)} aria-label="Cancel">
                    <X className="size-4" />
                  </Button>
                </>
              ) : (
                <>
                  <span className="flex-1 text-sm">{z.name}</span>
                  {canEdit && (
                    <>
                      <Button size="icon" variant="ghost" className="size-8" onClick={() => setEditing({ id: z.id, name: z.name })} aria-label={`Rename ${z.name}`}>
                        <Pencil className="size-4" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="size-8 text-destructive"
                        disabled={busy}
                        aria-label={`Delete ${z.name}`}
                        onClick={() => {
                          if (!confirm(`Delete "${z.name}"? Its lines move to "No zone".`)) return;
                          run(() => apiJson(`${base}/${z.id}?w=${workspaceId}&projectId=${projectId}`, { method: "DELETE" }));
                        }}
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    </>
                  )}
                </>
              )}
            </li>
          ))}
        </ul>

        {canEdit && (
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (!newName.trim()) return;
              run(async () => {
                await apiJson(`${base}?w=${workspaceId}`, { method: "POST", json: { projectId, name: newName.trim() } });
                setNewName("");
              });
            }}
          >
            <Input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="New zone name" />
            <Button type="submit" disabled={busy || !newName.trim()}>
              <Plus className="mr-1 size-4" /> Add
            </Button>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
