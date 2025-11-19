"use client";

import React, { useState } from "react";
import { buttonVariants } from "@/components/ui/button";
import { PlusIcon } from "lucide-react";
import { CreateProjectForm } from "./createProjectForm";

export default function ProjectHeaderClient() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <div className="flex items-center gap-3">
        <button
          type="button"
          className={buttonVariants()}
          onClick={() => setOpen(true)}
        >
          <PlusIcon className="mr-2 h-4 w-4" />
          Create project
        </button>

        {/* Controlled dialog form — pass open & setOpen */}
        <CreateProjectForm open={open} setOpen={setOpen} />
      </div>
    </>
  );
}
