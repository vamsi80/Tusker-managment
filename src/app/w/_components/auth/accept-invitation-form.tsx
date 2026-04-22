"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "next/navigation";
import { useState, useTransition, useEffect } from "react";
import { Loader2, CheckCircle2, AlertCircle, Eye, EyeOff } from "lucide-react";
import { toast } from "sonner";
import {
    Form,
    FormControl,
    FormField,
    FormItem,
    FormLabel,
    FormMessage,
    FormDescription,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { acceptInvitationSchema } from "@/lib/zodSchemas";
import { apiClient } from "@/lib/api-client";
import { tryCatch } from "@/hooks/try-catch";
import { authClient } from "@/lib/auth-client";
import { cn } from "@/lib/utils";

interface AcceptInvitationFormProps {
    token: string;
    email: string;
    initialName?: string;
}

export function AcceptInvitationForm({ token, email, initialName = "" }: AcceptInvitationFormProps) {
    const router = useRouter();
    const [isPending, startTransition] = useTransition();
    const [showPassword, setShowPassword] = useState(false);

    const form = useForm({
        resolver: zodResolver(acceptInvitationSchema),
        defaultValues: {
            token,
            email,
            name: initialName,
            niceName: "",
            password: "",
            confirmPassword: "",
        },
    });

    const onSubmit = (values: any) => {
        startTransition(async () => {
            const { data: result, error } = await tryCatch(apiClient.auth.acceptInvitation(values));

            if (error) {
                toast.error(error.message || "Failed to set password");
                return;
            }

            if (result && result.status === "success") {
                toast.success(result.message || "Account activated successfully!");
                router.push("/sign-in");
            } else {
                toast.error(result?.message || "Something went wrong");
            }
        });
    };

    return (
        <Card className="w-full max-w-md mx-auto border-t-4 border-t-primary shadow-xl">
            <CardHeader>
                <CardTitle className="text-2xl font-bold">Welcome!</CardTitle>
                <CardDescription>
                    You've been invited to Tusker Management. Set your password to get started.
                </CardDescription>
            </CardHeader>
            <CardContent>
                <Form {...form}>
                    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                        <FormField
                            control={form.control}
                            name="email"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel>Email</FormLabel>
                                    <FormControl>
                                        <Input {...field} disabled={true} className="bg-muted" />
                                    </FormControl>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />

                        <FormField
                            control={form.control}
                            name="name"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel>Full Name</FormLabel>
                                    <FormControl>
                                        <Input 
                                            placeholder="John Doe" 
                                            {...field} 
                                            disabled={!!initialName || isPending} 
                                            className={cn(!!initialName && "bg-muted cursor-not-allowed")}
                                        />
                                    </FormControl>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />

                        <FormField
                            control={form.control}
                            name="password"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel>New Password</FormLabel>
                                    <FormControl>
                                        <div className="relative">
                                            <Input 
                                                type={showPassword ? "text" : "password"} 
                                                placeholder="••••••••" 
                                                {...field} 
                                                disabled={isPending} 
                                                className="pr-10"
                                            />
                                            <Button
                                                type="button"
                                                variant="ghost"
                                                size="sm"
                                                className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                                                onClick={() => setShowPassword(!showPassword)}
                                                disabled={isPending}
                                            >
                                                {showPassword ? (
                                                    <EyeOff className="h-4 w-4 text-muted-foreground" />
                                                ) : (
                                                    <Eye className="h-4 w-4 text-muted-foreground" />
                                                )}
                                            </Button>
                                        </div>
                                    </FormControl>
                                    <FormDescription className="text-[10px] leading-tight">
                                        Must be 8+ characters, with uppercase, lowercase, and a number.
                                    </FormDescription>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />

                        <FormField
                            control={form.control}
                            name="confirmPassword"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel>Confirm Password</FormLabel>
                                    <FormControl>
                                        <div className="relative">
                                            <Input 
                                                type={showPassword ? "text" : "password"} 
                                                placeholder="••••••••" 
                                                {...field} 
                                                disabled={isPending} 
                                                className="pr-10"
                                            />
                                            <Button
                                                type="button"
                                                variant="ghost"
                                                size="sm"
                                                className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent"
                                                onClick={() => setShowPassword(!showPassword)}
                                                disabled={isPending}
                                            >
                                                {showPassword ? (
                                                    <EyeOff className="h-4 w-4 text-muted-foreground" />
                                                ) : (
                                                    <Eye className="h-4 w-4 text-muted-foreground" />
                                                )}
                                            </Button>
                                        </div>
                                    </FormControl>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />

                        <Button type="submit" className="w-full" disabled={isPending}>
                            {isPending ? (
                                <>
                                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                    Setting Password...
                                </>
                            ) : (
                                "Create Account"
                            )}
                        </Button>
                    </form>
                </Form>
            </CardContent>
            <CardFooter className="flex justify-center flex-col gap-2">
                <p className="text-xs text-muted-foreground text-center px-6 leading-relaxed">
                    By creating an account, you agree to our Terms of Service and Privacy Policy.
                </p>
            </CardFooter>
        </Card>
    );
}
