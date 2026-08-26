"use client";

import { UserMinus } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";

interface ProjectMember {
  id: string;
  projectRole: string;
  workspaceMember: {
    id: string;
    userId: string;
    user: {
      id: string;
      name: string;
      surname: string | null;
      image: string | null;
    };
  };
}

interface AbsentRecord {
  workspaceMemberId: string;
  status: string;
}

interface AbsentMembersWidgetProps {
  allMembers: ProjectMember[];
  absentRecords: AbsentRecord[];
}

export function AbsentMembersWidget({ allMembers, absentRecords }: AbsentMembersWidgetProps) {
  // Map absent records to project members
  const absentMembers = allMembers
    .map((member) => {
      const record = absentRecords.find((r) => r.workspaceMemberId === member.workspaceMember.id);
      return {
        ...member,
        status: record?.status || null,
      };
    })
    .filter((m) => m.status !== null && !(new Date().getDay() === 0 && m.status === "ABSENT"));

  return (
    <div className="flex flex-col p-6 rounded-2xl border bg-card text-card-foreground shadow-sm h-full">
      <div className="flex items-center justify-between mb-6">
        <div className="flex flex-col gap-1">
          <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
            Absent / On Leave Today
          </h3>
          <span className="text-xs text-muted-foreground">Not in the office today</span>
        </div>
        <div className="p-1.5 rounded-xl bg-rose-500/10 text-rose-500">
          <UserMinus className="size-4.5" />
        </div>
      </div>

      <div className="flex-1 overflow-auto max-h-[300px] pr-1">
        {absentMembers.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-10 text-center text-muted-foreground/60">
            <p className="text-sm italic">All members are present today</p>
          </div>
        ) : (
          <div className="space-y-4">
            {absentMembers.map((member) => {
              const user = member.workspaceMember.user;
              const isLeave = member.status === "ON_LEAVE";
              const displayName = user.surname || user.name || "Member";

              return (
                <div key={member.id} className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Avatar className="size-9">
                      <AvatarImage src={user.image || ""} alt={displayName} />
                      <AvatarFallback className="bg-primary/10 text-primary">
                        {displayName.substring(0, 2).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex flex-col">
                      <span className="text-sm font-semibold text-foreground">
                        {displayName}
                      </span>
                      <span className="text-xs text-muted-foreground capitalize">
                        {member.projectRole.toLowerCase().replace("_", " ")}
                      </span>
                    </div>
                  </div>
                  <Badge
                    variant="secondary"
                    className={
                      isLeave
                        ? "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300 border-0"
                        : "bg-rose-100 text-rose-800 dark:bg-rose-900/30 dark:text-rose-300 border-0"
                    }
                  >
                    {isLeave ? "On Leave" : "Absent"}
                  </Badge>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
