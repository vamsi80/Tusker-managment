"use client";

import { useEffect, useState } from "react";
import { Cake } from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { apiClient } from "@/lib/api-client";
import type { BirthdayMember } from "@/lib/api-client/workspaces";

export function BirthdaysWidget({ workspaceId }: { workspaceId: string }) {
  const [members, setMembers] = useState<BirthdayMember[] | null>(null);

  useEffect(() => {
    let active = true;
    apiClient.workspaces
      .getBirthdays(workspaceId)
      .then((data) => active && setMembers(data))
      .catch(() => active && setMembers([]));
    return () => {
      active = false;
    };
  }, [workspaceId]);

  const now = new Date();
  const monthLabel = now.toLocaleString("en-US", { month: "long" });
  const monthShort = now.toLocaleString("en-US", { month: "short" });

  return (
    <div className="flex flex-col p-6 rounded-2xl border bg-card text-card-foreground shadow-sm h-full">
      <div className="flex items-center justify-between mb-6">
        <div className="flex flex-col gap-1">
          <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
            Birthdays
          </h3>
          <span className="text-xs text-muted-foreground">{monthLabel} celebrations</span>
        </div>
        <div className="p-1.5 rounded-xl bg-pink-500/10 text-pink-500">
          <Cake className="size-4.5" />
        </div>
      </div>

      <div className="flex-1 overflow-auto max-h-[300px] pr-1">
        {members === null ? (
          <p className="text-sm italic text-muted-foreground/60 py-6 text-center">Loading…</p>
        ) : members.length === 0 ? (
          <p className="text-sm italic text-muted-foreground/60 py-6 text-center">
            No birthdays this month
          </p>
        ) : (
          <div className="space-y-4">
            {members.map((member) => (
              <div key={member.id} className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <Avatar className="size-9">
                    <AvatarFallback className="text-muted-foreground font-semibold text-xs">
                      {member.surname.substring(0, 1).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex flex-col min-w-0">
                    <span className="text-sm font-semibold text-foreground truncate">
                      {member.surname}
                    </span>
                    {member.designation && (
                      <span className="text-xs text-muted-foreground truncate">
                        {member.designation}
                      </span>
                    )}
                  </div>
                </div>
                <Badge
                  variant={member.isToday ? "default" : "outline"}
                  className="text-[10px] shrink-0"
                >
                  {member.isToday ? "Today" : `${member.day} ${monthShort}`}
                </Badge>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
