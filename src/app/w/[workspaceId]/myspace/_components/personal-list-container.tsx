"use client";

import { useState, useEffect, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { 
  Plus, 
  Trash2, 
  Loader2, 
  CheckCircle2, 
  Circle, 
  Check
} from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface Todo {
  id: string;
  text: string;
  completed: boolean;
  createdAt: string;
  completedAt: string | null;
}

export function PersonalListContainer({ 
  workspaceId, 
  hideHeader = false 
}: { 
  workspaceId: string;
  hideHeader?: boolean;
}) {
  const [todos, setTodos] = useState<Todo[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [newTodoText, setNewTodoText] = useState("");
  const [isAdding, setIsAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingText, setEditingText] = useState("");

  // Alert Dialog State
  const [alertOpen, setAlertOpen] = useState(false);
  const [pendingAction, setPendingAction] = useState<{ id: string, type: 'delete' | 'untick' } | null>(null);

  const fetchTodos = async () => {
    try {
      const res = await fetch(`/api/v1/member-todos/${workspaceId}`);
      const data = await res.json();
      if (data.success) {
        setTodos(data.data);
      }
    } catch (error) {
      toast.error("Failed to load todos");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchTodos();
  }, [workspaceId]);

  const activeTodos = useMemo(() => todos.filter(t => !t.completed), [todos]);
  const completedTodos = useMemo(() => todos.filter(t => t.completed), [todos]);

  const handleAddTodo = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTodoText.trim() || isAdding) return;

    setIsAdding(true);
    try {
      const res = await fetch(`/api/v1/member-todos/${workspaceId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: newTodoText.trim() }),
      });
      const data = await res.json();
      if (data.success) {
        setTodos(prev => [data.data, ...prev]);
        setNewTodoText("");
      }
    } catch (error) {
      toast.error("Failed to add todo");
    } finally {
      setIsAdding(false);
    }
  };

  const handleToggleTodo = async (id: string) => {
    const todo = todos.find(t => t.id === id);
    if (!todo) return;

    // If un-ticking (moving from completed to active), ask for confirmation
    if (todo.completed) {
      setPendingAction({ id, type: 'untick' });
      setAlertOpen(true);
      return;
    }

    // Normal ticking (active to completed) - no confirmation needed
    performToggle(id);
  };

  const performToggle = async (id: string) => {
    setTodos(prev => prev.map(t => t.id === id ? { ...t, completed: !t.completed } : t));

    try {
      const res = await fetch(`/api/v1/member-todos/${workspaceId}/${id}`, {
        method: "PATCH",
      });
      const data = await res.json();
      if (!data.success) throw new Error();
      setTodos(prev => prev.map(t => t.id === id ? data.data : t));
    } catch (error) {
      toast.error("Failed to update status");
      fetchTodos();
    }
  };

  const handleEditTodo = async (id: string) => {
    if (!editingText.trim()) return;

    try {
      const res = await fetch(`/api/v1/member-todos/${workspaceId}/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: editingText.trim() }),
      });
      const data = await res.json();
      if (data.success) {
        setTodos(prev => prev.map(t => t.id === id ? data.data : t));
        setEditingId(null);
      }
    } catch (error) {
      toast.error("Failed to save changes");
    }
  };

  const handleDeleteClick = (id: string) => {
    setPendingAction({ id, type: 'delete' });
    setAlertOpen(true);
  };

  const performDelete = async (id: string) => {
    try {
      const res = await fetch(`/api/v1/member-todos/${workspaceId}/${id}`, {
        method: "DELETE",
      });
      const data = await res.json();
      if (data.success) {
        setTodos(prev => prev.filter(t => t.id !== id));
        toast.success("Task deleted");
      }
    } catch (error) {
      toast.error("Failed to delete task");
    }
  };

  const handleConfirmAction = () => {
    if (!pendingAction) return;

    if (pendingAction.type === 'delete') {
      performDelete(pendingAction.id);
    } else if (pendingAction.type === 'untick') {
      performToggle(pendingAction.id);
    }
    setAlertOpen(false);
    setPendingAction(null);
  };

  const renderTodoItem = (todo: Todo) => (
    <div 
      key={todo.id}
      className={cn(
        "group flex items-start gap-3 py-1.5 transition-all duration-200",
        todo.completed ? "opacity-60" : "opacity-100"
      )}
    >
      <button 
        onClick={() => handleToggleTodo(todo.id)}
        className={cn(
          "mt-1 shrink-0 transition-all active:scale-90",
          todo.completed ? "text-emerald-500" : "text-muted-foreground/60 hover:text-primary"
        )}
      >
        {todo.completed ? <CheckCircle2 className="h-4.5 w-4.5" /> : <Circle className="h-4.5 w-4.5 stroke-[2px]" />}
      </button>
      
      <div className="flex-1 min-w-0">
        {editingId === todo.id ? (
          <div className="flex items-center gap-2">
            <Input
              autoFocus
              value={editingText}
              onChange={(e) => setEditingText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleEditTodo(todo.id);
                if (e.key === "Escape") setEditingId(null);
              }}
              className="h-auto p-0 bg-transparent border-0 focus-visible:ring-0 text-base font-medium shadow-none"
            />
            <button onClick={() => handleEditTodo(todo.id)} className="text-primary hover:text-primary/80 transition-colors">
              <Check className="h-3.5 w-3.5" />
            </button>
          </div>
        ) : (
          <p 
            onClick={() => {
              setEditingId(todo.id);
              setEditingText(todo.text);
            }}
            className={cn(
              "text-base font-medium leading-relaxed transition-all cursor-text",
              todo.completed && "line-through text-muted-foreground/80 font-normal"
            )}
          >
            {todo.text}
          </p>
        )}
      </div>

      {editingId !== todo.id && (
        <div className="flex items-center gap-1 opacity-20 group-hover:opacity-100 transition-opacity">
          <Button
            variant="ghost"
            size="icon"
            className="h-5 w-5 p-0 rounded-full text-muted-foreground hover:text-destructive hover:bg-destructive/10 cursor-pointer flex items-center justify-center"
            onClick={(e) => {
              e.stopPropagation();
              handleDeleteClick(todo.id);
            }}
          >
            <Trash2 className="h-2 w-2" />
          </Button>
        </div>
      )}
    </div>
  );

  return (
    <div className="flex flex-col h-full w-full">
      {isLoading ? (
        <div className="flex flex-col items-center justify-center py-20 gap-3 text-muted-foreground/20">
          <Loader2 className="h-6 w-6 animate-spin" />
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 h-full">
          {/* Column 1: Active Tasks + Input */}
          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-2 mb-4">
               <span className="text-xs font-bold uppercase tracking-widest text-primary">Ongoing</span>
               <div className="h-px flex-1 bg-primary/30" />
            </div>

            {/* Input Row */}
            <div className="group flex items-start gap-3 py-1.5 transition-all mb-2">
               <div className="mt-1 shrink-0 text-muted-foreground/50">
                 {isAdding ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4.5 w-4.5 stroke-[2px]" />}
               </div>
               <form onSubmit={handleAddTodo} className="flex-1 flex items-center gap-2">
                 <Input
                   placeholder="Add a new task..."
                   value={newTodoText}
                   onChange={(e) => setNewTodoText(e.target.value)}
                   disabled={isAdding}
                   className="h-auto p-0 bg-transparent border-0 focus-visible:ring-0 text-base font-medium placeholder:text-muted-foreground/50 shadow-none flex-1"
                 />
                 {newTodoText.trim() && !isAdding && (
                   <button 
                     type="submit"
                     className="p-1 rounded-lg bg-emerald-500/10 text-emerald-600 hover:bg-emerald-500/20 transition-all active:scale-90 animate-in fade-in slide-in-from-right-2 duration-200"
                   >
                     <Check className="h-4 w-4 stroke-[2.5px]" />
                   </button>
                 )}
               </form>
            </div>

            <ScrollArea className="flex-1">
              <div className="flex flex-col">
                {activeTodos.length === 0 ? (
                  <p className="text-sm text-muted-foreground/40 italic py-4">No pending tasks. You're all caught up!</p>
                ) : (
                  activeTodos.map(renderTodoItem)
                )}
              </div>
            </ScrollArea>
          </div>

          {/* Column 2: Completed Tasks */}
          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-2 mb-4">
               <span className="text-xs font-bold uppercase tracking-widest text-emerald-500/80">Completed</span>
               <div className="h-px flex-1 bg-emerald-500/20" />
            </div>
            
            <ScrollArea className="flex-1">
              <div className="flex flex-col">
                {completedTodos.length === 0 ? (
                  <p className="text-sm text-muted-foreground/40 italic py-4">No completed tasks yet.</p>
                ) : (
                  completedTodos.map(renderTodoItem)
                )}
              </div>
            </ScrollArea>
          </div>
        </div>
      )}

      {/* Reusable Alert Dialog */}
      <AlertDialog open={alertOpen} onOpenChange={setAlertOpen}>
        <AlertDialogContent className="rounded-3xl border-none">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-xl font-bold tracking-tight">
              {pendingAction?.type === 'delete' ? "Delete Task?" : "Restore Task?"}
            </AlertDialogTitle>
            <AlertDialogDescription className="text-base font-medium text-muted-foreground">
              {pendingAction?.type === 'delete' 
                ? "This action cannot be undone. This task will be permanently removed from your personal space." 
                : "This task will be moved back to your ongoing list."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2">
            <AlertDialogCancel className="rounded-xl border-none bg-muted hover:bg-muted/80 font-bold">Cancel</AlertDialogCancel>
            <AlertDialogAction 
              onClick={handleConfirmAction}
              className={cn(
                "rounded-xl font-bold",
                pendingAction?.type === 'delete' ? "bg-destructive text-destructive-foreground hover:bg-destructive/90" : "bg-primary text-primary-foreground hover:bg-primary/90"
              )}
            >
              {pendingAction?.type === 'delete' ? "Yes, Delete" : "Yes, Restore"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
