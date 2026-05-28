"use client";

import { useRouter, useParams } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

interface VendorHeaderProps {
  name: string;
  status: string;
}

export function VendorHeader({ name, status }: VendorHeaderProps) {
  const router = useRouter();
  const params = useParams();
  const workspaceId = params.workspaceId as string;

  return (
    <div className="flex items-center gap-4">
      <Button
        variant="ghost"
        size="icon"
        className="size-9 rounded-full"
        onClick={() => router.push(`/w/${workspaceId}/vendors`)}
      >
        <ArrowLeft className="size-5" />
      </Button>
      <div className="flex items-center gap-2">
        <h1 className="text-2xl font-normal leading-tight tracking-tighter md:text-2xl text-foreground flex items-center gap-2">
          {name}
        </h1>
        <Badge
          variant={status === "ACTIVE" ? "outline" : "destructive"}
          className={
            status === "ACTIVE"
              ? "bg-emerald-500/10 text-emerald-500 border-emerald-500/20"
              : "bg-destructive/10 text-destructive border-destructive/20"
          }
        >
          {status}
        </Badge>
      </div>
    </div>
  );
}
