"use client";

import { authClient } from "@/lib/auth-client";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Mail, Shield, User as UserIcon, Calendar } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

import { useWorkspaceLayout } from "@/app/w/[workspaceId]/_components/workspace-layout-context";

export default function MySpaceInfoPage() {
  const { data: session, isPending: isSessionPending } = authClient.useSession();
  const { data: layoutData, isLoading: isLayoutLoading } = useWorkspaceLayout();

  const isPending = isSessionPending || isLayoutLoading;

  if (isPending) {
    return (
      <div className="w-full space-y-6 px-2">
        <Skeleton className="h-40 w-full rounded-3xl" />
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <Skeleton className="h-24 rounded-2xl" />
          <Skeleton className="h-24 rounded-2xl" />
          <Skeleton className="h-24 rounded-2xl" />
          <Skeleton className="h-24 rounded-2xl" />
        </div>
      </div>
    );
  }

  if (!session) return null;

  const user = session.user;
  const workspaceRole = layoutData?.permissions?.workspaceRole;

  return (
    <div className="w-full animate-in fade-in slide-in-from-bottom-4 duration-500 px-2">
      <Card className="border-none shadow-none bg-transparent">
        <CardHeader className="px-0 pt-0">
          <div className="flex items-center gap-6 mb-8">
            <Avatar className="h-24 w-24 border-4 border-background shadow-xl shrink-0">
              <AvatarImage src={user.image || ""} />
              <AvatarFallback className="text-2xl bg-primary text-primary-foreground">
                {user.name?.charAt(0) || user.email.charAt(0)}
              </AvatarFallback>
            </Avatar>
            <div>
              <CardTitle className="text-3xl font-bold">{user.name}</CardTitle>
              <p className="text-muted-foreground font-medium">{user.email}</p>
            </div>
          </div>
        </CardHeader>
        
        <CardContent className="px-0 space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="p-5 rounded-2xl bg-card border flex items-center gap-4 hover:shadow-sm transition-shadow">
              <div className="p-2 bg-primary/10 rounded-lg shrink-0">
                <Mail className="h-5 w-5 text-primary" />
              </div>
              <div className="min-w-0">
                <p className="text-xs text-muted-foreground font-bold uppercase tracking-wider">Email</p>
                <p className="text-sm font-semibold truncate">{user.email}</p>
              </div>
            </div>

            <div className="p-5 rounded-2xl bg-card border flex items-center gap-4 hover:shadow-sm transition-shadow">
              <div className="p-2 bg-blue-500/10 rounded-lg shrink-0">
                <Shield className="h-5 w-5 text-blue-500" />
              </div>
              <div className="min-w-0">
                <p className="text-xs text-muted-foreground font-bold uppercase tracking-wider">Workspace Role</p>
                <p className="text-sm font-semibold capitalize text-blue-600">{workspaceRole || "Member"}</p>
              </div>
            </div>

            <div className="p-5 rounded-2xl bg-card border flex items-center gap-4 hover:shadow-sm transition-shadow">
              <div className="p-2 bg-emerald-500/10 rounded-lg shrink-0">
                <Calendar className="h-5 w-5 text-emerald-500" />
              </div>
              <div className="min-w-0">
                <p className="text-xs text-muted-foreground font-bold uppercase tracking-wider">Joined</p>
                <p className="text-sm font-semibold whitespace-nowrap">
                  {new Date(user.createdAt).toLocaleDateString(undefined, { 
                    year: 'numeric', 
                    month: 'short', 
                    day: 'numeric' 
                  })}
                </p>
              </div>
            </div>

            <div className="p-5 rounded-2xl bg-card border flex items-center gap-4 hover:shadow-sm transition-shadow">
              <div className="p-2 bg-purple-500/10 rounded-lg shrink-0">
                <UserIcon className="h-5 w-5 text-purple-500" />
              </div>
              <div className="min-w-0">
                <p className="text-xs text-muted-foreground font-bold uppercase tracking-wider">ID</p>
                <p className="text-sm font-mono truncate">{user.id}</p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
