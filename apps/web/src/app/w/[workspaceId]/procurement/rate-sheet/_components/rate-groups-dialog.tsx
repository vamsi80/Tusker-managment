"use client";

import { useState } from "react";
import { Check, CornerDownRight, Pencil, Plus, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { apiJson, toastError, type RateGroup } from "../../_components/boq-shared";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  workspaceId: string;
  /** The list being organised: null = material list, else a department. */
  tradeId: string | null;
  listLabel: string;
  groups: RateGroup[];
  onChanged: () => void;
}

/** Categories and one level of subcategories for one rate-sheet list. Grouping only: rates stay on the rows. */
export function RateGroupsDialog({ open, onOpenChange, workspaceId, tradeId, listLabel, groups, onChanged }: Props) {
  const [newName, setNewName] = useState("");
  const [editing, setEditing] = useState<{ id: string; name: string } | null>(null);
  const [adding, setAdding] = useState<{ parentId: string; name: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const categories = groups.filter((g) => g.tradeId === tradeId && !g.parentId);
  const childrenOf = (id: string) => groups.filter((g) => g.parentId === id);
  const base = `/api/v1/procurement/rate-groups`;

  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    try {
      await fn();
      onChanged();
    } catch (e) {
      toastError(e, "Could not update categories");
    } finally {
      setBusy(false);
    }
  };

  const remove = (g: RateGroup) => {
    const subs = g.parentId ? "" : " and its subcategories";
    if (!confirm(`Delete "${g.name}"${subs}? Rates in it stay on the sheet, uncategorised.`)) return;
    run(() => apiJson(`${base}/${g.id}?w=${workspaceId}`, { method: "DELETE" }));
  };

  const row = (g: RateGroup, depth: 0 | 1) => (
    <li key={g.id} className={`flex items-center gap-2 p-2 ${depth ? "pl-6" : ""}`}>
      {depth === 1 && <CornerDownRight className="size-3.5 shrink-0 text-muted-foreground" />}
      {editing?.id === g.id ? (
        <>
          <Input value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} className="h-8" autoFocus />
          <Button
            size="icon"
            variant="ghost"
            className="size-8"
            disabled={busy || !editing.name.trim()}
            aria-label="Save name"
            onClick={() =>
              run(async () => {
                await apiJson(`${base}/${g.id}?w=${workspaceId}`, { method: "PATCH", json: { name: editing.name.trim() } });
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
          <span className={`flex-1 text-sm ${depth ? "" : "font-medium"}`}>{g.name}</span>
          {depth === 1 && categories.length > 1 && (
            <Select
              value={g.parentId!}
              onValueChange={(parentId) => run(() => apiJson(`${base}/${g.id}?w=${workspaceId}`, { method: "PATCH", json: { parentId } }))}
              disabled={busy}
            >
              <SelectTrigger className="h-8 w-36" aria-label={`Move ${g.name} to another category`}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {categories.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          {depth === 0 && (
            <Button size="icon" variant="ghost" className="size-8" onClick={() => setAdding({ parentId: g.id, name: "" })} aria-label={`Add a subcategory to ${g.name}`}>
              <Plus className="size-4" />
            </Button>
          )}
          <Button size="icon" variant="ghost" className="size-8" onClick={() => setEditing({ id: g.id, name: g.name })} aria-label={`Rename ${g.name}`}>
            <Pencil className="size-4" />
          </Button>
          <Button size="icon" variant="ghost" className="size-8 text-destructive" disabled={busy} onClick={() => remove(g)} aria-label={`Delete ${g.name}`}>
            <Trash2 className="size-4" />
          </Button>
        </>
      )}
    </li>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Categories</DialogTitle>
          <DialogDescription>{listLabel}. Group rates as category › subcategory, e.g. Plywood › 18mm BWP.</DialogDescription>
        </DialogHeader>

        <ul className="max-h-[50vh] divide-y overflow-y-auto rounded-md border">
          {categories.length === 0 && <li className="p-3 text-sm text-muted-foreground">No categories yet.</li>}
          {categories.map((c) => (
            <li key={c.id}>
              <ul className="divide-y">
                {row(c, 0)}
                {childrenOf(c.id).map((s) => row(s, 1))}
                {adding?.parentId === c.id && (
                  <li>
                    <form
                      className="flex items-center gap-2 p-2 pl-6"
                      onSubmit={(e) => {
                        e.preventDefault();
                        if (!adding.name.trim()) return;
                        run(async () => {
                          await apiJson(`${base}?w=${workspaceId}`, { method: "POST", json: { parentId: c.id, name: adding.name.trim() } });
                          setAdding(null);
                        });
                      }}
                    >
                      <CornerDownRight className="size-3.5 shrink-0 text-muted-foreground" />
                      <Input value={adding.name} onChange={(e) => setAdding({ ...adding, name: e.target.value })} className="h-8" placeholder="Subcategory name" autoFocus />
                      <Button type="submit" size="icon" variant="ghost" className="size-8" disabled={busy || !adding.name.trim()} aria-label="Add subcategory">
                        <Check className="size-4" />
                      </Button>
                      <Button type="button" size="icon" variant="ghost" className="size-8" onClick={() => setAdding(null)} aria-label="Cancel">
                        <X className="size-4" />
                      </Button>
                    </form>
                  </li>
                )}
              </ul>
            </li>
          ))}
        </ul>

        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (!newName.trim()) return;
            run(async () => {
              await apiJson(`${base}?w=${workspaceId}`, { method: "POST", json: { tradeId, name: newName.trim() } });
              setNewName("");
            });
          }}
        >
          <Input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="New category name" />
          <Button type="submit" disabled={busy || !newName.trim()}>
            <Plus className="mr-1 size-4" /> Add
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
