"use client";

import { UserCheck } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";

interface ProjectMember {
  id: string;
  projectRole: string;
  workspaceMember: {
    id: string;
    userId: string;
    workspaceRole: string;
    user: {
      id: string;
      surname: string | null;
      image: string | null;
    };
  };
  assignedTasks: { id: string }[];
}

interface UnassignedMembersWidgetProps {
  allMembers: ProjectMember[];
}

export function UnassignedMembersWidget({ allMembers }: UnassignedMembersWidgetProps) {
  // Find project members who have 0 assigned tasks
  // Exclude OWNER/ADMIN in workspace unless they are the PROJECT_MANAGER of the project
  const unassignedMembers = allMembers.filter(
    (m) =>
      m.assignedTasks.length === 0 &&
      (m.projectRole === "PROJECT_MANAGER" ||
        (m.workspaceMember.workspaceRole !== "OWNER" &&
          m.workspaceMember.workspaceRole !== "ADMIN"))
  );

  return (
    <div className="flex flex-col p-6 rounded-2xl border bg-card text-card-foreground shadow-sm h-full">
      <div className="flex items-center justify-between mb-6">
        <div className="flex flex-col gap-1">
          <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
            Unassigned Members
          </h3>
          <span className="text-xs text-muted-foreground">Members with no tasks assigned</span>
        </div>
        <div className="p-1.5 rounded-xl bg-indigo-500/10 text-indigo-500">
          <UserCheck className="size-4.5" />
        </div>
      </div>

      <div className="flex-1 overflow-auto max-h-[300px] pr-1">
        {unassignedMembers.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-10 text-center text-muted-foreground/60">
            <p className="text-sm italic">All members have tasks assigned</p>
          </div>
        ) : (
          <div className="space-y-4">
            {unassignedMembers.map((member) => {
              const user = member.workspaceMember.user;
              const displayName = user.surname || "Member";

              return (
                <div key={member.id} className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Avatar className="size-9">
                      <AvatarFallback className="text-muted-foreground font-semibold text-xs">
                        {displayName.substring(0, 1).toUpperCase()}
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
                  <Badge variant="outline" className="text-[10px]">
                    No Tasks
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
