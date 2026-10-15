"use client";

import { useEffect, useState } from "react";
import { Cake } from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { apiClient } from "@tusker/api-client";
import type { BirthdayMember } from "@tusker/api-client/workspaces";

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
    <div className="flex flex-col p-6 rounded-3xl border border-white/70 bg-card text-card-foreground shadow-lg backdrop-blur-xl h-full dark:border-border">
      <div className="flex items-center justify-between gap-3 mb-5">
        <h3 className="flex items-center gap-2.5 text-base font-bold uppercase tracking-wide">
          <Cake className="size-5" />
          Birthdays
        </h3>
        <span className="text-sm text-muted-foreground text-right">
          {monthLabel} celebrations
        </span>
      </div>

      <div className="flex-1 overflow-auto max-h-[320px] pr-1">
        {members === null ? (
          <p className="text-sm italic text-muted-foreground/60 py-6 text-center">Loading…</p>
        ) : members.length === 0 ? (
          <p className="text-sm italic text-muted-foreground/60 py-6 text-center">
            No birthdays left this month
          </p>
        ) : (
          <div className="divide-y divide-border">
            {members.map((member) => (
              <div key={member.id} className="flex items-center justify-between gap-3 py-3 first:pt-0 last:pb-0">
                <div className="flex items-center gap-3 min-w-0">
                  <Avatar className="size-11">
                    <AvatarFallback className="text-muted-foreground font-semibold text-xs">
                      {member.surname.substring(0, 1).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <p className="min-w-0 truncate">
                    <span className="font-semibold text-foreground">{member.surname}</span>
                    {member.designation && (
                      <span className="text-muted-foreground"> - {member.designation}</span>
                    )}
                  </p>
                </div>
                <Badge
                  variant={member.isToday ? "default" : "outline"}
                  className="shrink-0 px-4 py-1.5 text-sm"
                >
                  {member.isToday ? "Today" : `${monthShort} ${member.day}`}
                </Badge>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
