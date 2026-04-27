"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { formatIST, cn } from "@/lib/utils";
import { CalendarIcon, Loader2, Send } from "lucide-react";
import { toast } from "sonner";

import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/dialog";
import {
    Form,
    FormControl,
    FormField,
    FormItem,
    FormLabel,
    FormMessage,
} from "@/components/ui/form";
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Textarea } from "@/components/ui/textarea";
import { leaveRequestSchema, LeaveRequestFormType } from "@/lib/zodSchemas";

interface LeaveRequestDialogProps {
    workspaceId: string;
    children?: React.ReactNode;
}

export function LeaveRequestDialog({ workspaceId, children }: LeaveRequestDialogProps) {
    const [open, setOpen] = useState(false);
    const [isCalendarOpen, setIsCalendarOpen] = useState(false);
    const [isLoading, setIsLoading] = useState(false);

    const form = useForm<LeaveRequestFormType>({
        resolver: zodResolver(leaveRequestSchema),
        defaultValues: {
            reason: "",
        },
    });

    async function onSubmit(values: LeaveRequestFormType) {
        setIsLoading(true);
        try {
            const res = await fetch(`/api/v1/attendance/leave-request`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "x-workspace-id": workspaceId,
                },
                body: JSON.stringify({
                    startDate: values.dateRange.from.toISOString(),
                    endDate: values.dateRange.to.toISOString(),
                    reason: values.reason,
                }),
            });

            const data = await res.json();

            if (!data.success) {
                toast.error(data.error || "Failed to submit leave request");
                return;
            }

            toast.success("Leave request submitted successfully!");
            setOpen(false);
            form.reset();
        } catch (error) {
            toast.error("An error occurred. Please try again.");
        } finally {
            setIsLoading(false);
        }
    }

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
                {children || (
                    <Button variant="outline" className="gap-2">
                        <CalendarIcon className="h-4 w-4" />
                        Apply for Leave
                    </Button>
                )}
            </DialogTrigger>
            <DialogContent className="sm:max-w-[425px] overflow-hidden rounded-2xl border-none shadow-2xl">
                <DialogHeader className="bg-primary/5 p-6 pb-4">
                    <DialogTitle className="text-xl font-bold flex items-center gap-2">
                        <Send className="h-5 w-5 text-primary" />
                        New Leave Request
                    </DialogTitle>
                    <DialogDescription>
                        Fill out the details below to apply for a leave. Your manager will review it.
                    </DialogDescription>
                </DialogHeader>
                <div className="p-6 pt-2">
                    <Form {...form}>
                        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
                            <FormField
                                control={form.control}
                                name="dateRange"
                                render={({ field }) => (
                                    <FormItem className="flex flex-col">
                                        <FormLabel className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Select Dates</FormLabel>
                                        <Popover open={isCalendarOpen} onOpenChange={setIsCalendarOpen}>
                                            <PopoverTrigger asChild>
                                                <Button
                                                    id="date"
                                                    variant={"outline"}
                                                    className={cn(
                                                        "w-full justify-start text-left font-normal h-11 bg-muted/30 border-muted-foreground/20 hover:bg-muted/50 transition-all",
                                                        !field.value && "text-muted-foreground"
                                                    )}
                                                >
                                                    <CalendarIcon className="mr-2 h-4 w-4 opacity-70" />
                                                    <span className="truncate">
                                                        {field.value?.from ? (
                                                            field.value.to ? (
                                                                <>
                                                                    {formatIST(field.value.from)} -{" "}
                                                                    {formatIST(field.value.to)}
                                                                </>
                                                            ) : (
                                                                formatIST(field.value.from)
                                                            )
                                                        ) : (
                                                            "Select start & end dates"
                                                        )}
                                                    </span>
                                                </Button>
                                            </PopoverTrigger>
                                            <PopoverContent className="w-auto p-0 border-none shadow-2xl rounded-2xl overflow-hidden" align="start">
                                                <div className="bg-background">
                                                    <div className="bg-primary/5 p-3 border-b flex items-center justify-between">
                                                        <h4 className="text-[10px] font-bold uppercase tracking-wider text-primary">Select Date Range</h4>
                                                        <Button 
                                                            variant="ghost" 
                                                            size="sm" 
                                                            className="h-6 px-2 text-[10px] font-bold text-primary hover:bg-primary/10"
                                                            onClick={() => setIsCalendarOpen(false)}
                                                        >
                                                            Done
                                                        </Button>
                                                    </div>
                                                    <Calendar
                                                        initialFocus
                                                        mode="range"
                                                        defaultMonth={field.value?.from || new Date()}
                                                        selected={field.value}
                                                        onSelect={field.onChange}
                                                        numberOfMonths={2}
                                                        disabled={{ before: new Date() }}
                                                        className="p-3"
                                                    />
                                                    <div className="border-t p-3 bg-muted/20 flex items-center justify-between gap-4">
                                                        <p className="text-[10px] text-muted-foreground font-medium italic">
                                                            * Click the first day, then the last day.
                                                        </p>
                                                        <div className="flex items-center gap-2">
                                                            <Button 
                                                                variant="ghost" 
                                                                size="sm" 
                                                                className="h-7 px-2 text-[10px] font-bold text-destructive hover:bg-destructive/10"
                                                                onClick={(e) => {
                                                                    e.preventDefault();
                                                                    field.onChange(undefined);
                                                                }}
                                                            >
                                                                Clear
                                                            </Button>
                                                            <Button 
                                                                variant="default" 
                                                                size="sm" 
                                                                className="h-7 px-4 text-[10px] font-bold shadow-md shadow-primary/20"
                                                                onClick={(e) => {
                                                                    e.preventDefault();
                                                                    setIsCalendarOpen(false);
                                                                }}
                                                            >
                                                                Done
                                                            </Button>
                                                        </div>
                                                    </div>
                                                </div>
                                            </PopoverContent>
                                        </Popover>
                                        <FormMessage className="text-[10px]" />
                                    </FormItem>
                                )}
                            />
                            <FormField
                                control={form.control}
                                name="reason"
                                render={({ field }) => (
                                    <FormItem>
                                        <FormLabel className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Reason for Leave</FormLabel>
                                        <FormControl>
                                            <Textarea
                                                placeholder="Please provide a brief reason for your leave request..."
                                                className="resize-none min-h-[100px] bg-muted/30 border-muted-foreground/20 focus:ring-primary/20"
                                                {...field}
                                            />
                                        </FormControl>
                                        <FormMessage className="text-[10px]" />
                                    </FormItem>
                                )}
                            />
                            <div className="flex gap-3 pt-2">
                                <Button
                                    type="button"
                                    variant="ghost"
                                    className="flex-1 font-bold"
                                    onClick={() => setOpen(false)}
                                >
                                    Cancel
                                </Button>
                                <Button
                                    type="submit"
                                    className="flex-[2] font-bold shadow-lg shadow-primary/20 transition-all active:scale-95"
                                    disabled={isLoading}
                                >
                                    {isLoading ? (
                                        <>
                                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                            Submitting...
                                        </>
                                    ) : (
                                        "Submit Request"
                                    )}
                                </Button>
                            </div>
                        </form>
                    </Form>
                </div>
            </DialogContent>
        </Dialog>
    );
}
