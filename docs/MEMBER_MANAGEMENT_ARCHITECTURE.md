# Project Member Management - Architecture Overview

## System Architecture

\`\`\`
┌─────────────────────────────────────────────────────────────────┐
│                         USER INTERFACE                          │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌──────────────────┐         ┌──────────────────────────┐    │
│  │  nav-projects    │         │  Project Settings Page   │    │
│  │  Dropdown Menu   │         │  (Future Integration)    │    │
│  └────────┬─────────┘         └────────┬─────────────────┘    │
│           │                             │                       │
│           │  Click "Manage Members"     │                       │
│           └─────────────┬───────────────┘                       │
│                         │                                       │
│                         ▼                                       │
│           ┌─────────────────────────────┐                      │
│           │  ManageMembersButton        │                      │
│           │  (Reusable Component)       │                      │
│           └─────────────┬───────────────┘                      │
│                         │                                       │
│                         │ Opens Dialog                          │
│                         ▼                                       │
│           ┌─────────────────────────────┐                      │
│           │ ManageProjectMembersDialog  │                      │
│           │                             │                      │
│           │  ┌─────────────────────┐   │                      │
│           │  │ Add Members Section │   │                      │
│           │  │ - Multi-select      │   │                      │
│           │  │ - Add button        │   │                      │
│           │  └─────────────────────┘   │                      │
│           │                             │                      │
│           │  ┌─────────────────────┐   │                      │
│           │  │ Current Members     │   │                      │
│           │  │ - Member list       │   │                      │
│           │  │ - Role dropdown     │   │                      │
│           │  │ - Toggle access     │   │                      │
│           │  │ - Remove button     │   │                      │
│           │  └─────────────────────┘   0│                      │
│           └─────────────┬───────────────┘                      │
│                         │                                       │
└─────────────────────────┼───────────────────────────────────────┘
                          │
                          │ Calls Server Actions
                          ▼
┌─────────────────────────────────────────────────────────────────┐
│                      SERVER ACTIONS                             │
│                 (manage-members.ts)                             │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌──────────────────────┐  ┌──────────────────────┐           │
│  │ addProjectMembers    │  │ removeProjectMembers │           │
│  │ - Validate user auth │  │ - Validate user auth │           │
│  │ - Check duplicates   │  │ - Prevent last lead  │           │
│  │ - Add to DB          │  │ - Remove from DB     │           │
│  │ - Invalidate cache   │  │ - Invalidate cache   │           │
│  └──────────────────────┘  └──────────────────────┘           │
│                                                                 │
│  ┌──────────────────────┐  ┌──────────────────────┐           │
│  │ updateMemberRole     │  │ toggleMemberAccess   │           │
│  │ - Validate user auth │  │ - Validate user auth │           │
│  │ - Prevent last lead  │  │ - Toggle hasAccess   │           │
│  │ - Update role in DB  │  │ - Update DB          │           │
│  │ - Invalidate cache   │  │ - Invalidate cache   │           │
│  └──────────────────────┘  └──────────────────────┘           │
│                                                                 │
│                         │                                       │
│                         │ Uses                                  │
│                         ▼                                       │
│           ┌─────────────────────────────┐                      │
│           │    requireUser()            │                      │
│           │    - Get current user       │                      │
│           │    - Verify authentication  │                      │
│           └─────────────────────────────┘                      │
│                                                                 │
└─────────────────────────┬───────────────────────────────────────┘
                          │
                          │ Queries/Updates
                          ▼
┌─────────────────────────────────────────────────────────────────┐
│                         DATABASE                                │
│                      (Prisma/PostgreSQL)                        │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌──────────────┐   ┌──────────────────┐   ┌───────────────┐  │
│  │   Project    │   │  ProjectMember   │   │ WorkspaceMember│ │
│  ├──────────────┤   ├──────────────────┤   ├───────────────┤  │
│  │ id           │◄──┤ projectId        │   │ id            │  │
│  │ name         │   │ workspaceMemberId├──►│ userId        │  │
│  │ workspaceId  │   │ projectRole      │   │ workspaceId   │  │
│  │ ...          │   │ hasAccess        │   │ workspaceRole │  │
│  └──────────────┘   │ ...              │   │ ...           │  │
│                     └──────────────────┘   └───────┬───────┘  │
│                                                     │           │
│                                                     │           │
│                                            ┌────────▼────────┐  │
│                                            │      User       │  │
│                                            ├─────────────────┤  │
│                                            │ id              │  │
│                                            │ name            │  │
│                                            │ email           │  │
│                                            │ ...             │  │
│                                            └─────────────────┘  │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘

## Data Flow Sequence

1. User clicks "Manage Members" in dropdown
   ↓
2. nav-projects.tsx calls getFullProjectData(projectId)
   ↓
3. get-full-project-data.ts fetches project with members
   ↓
4. Dialog opens with current members displayed
   ↓
5. User performs action (add/remove/update)
   ↓
6. Dialog calls appropriate server action
   ↓
7. Server action validates authorization
   ↓
8. Server action validates business rules
   ↓
9. Server action updates database via Prisma
   ↓
10. Server action invalidates workspace cache
    ↓
11. Server action returns success/error response
    ↓
12. Dialog shows toast notification
    ↓
13. Router.refresh() updates UI
    ↓
14. User sees updated member list

## Authorization Flow

\`\`\`
User Action Request
        │
        ▼
┌───────────────────┐
│ requireUser()     │ ─── Not authenticated? ──► Error
└────────┬──────────┘
         │
         │ Authenticated
         ▼
┌───────────────────┐
│ Get Project Data  │
└────────┬──────────┘
         │
         ▼
┌───────────────────────────────────┐
│ Check Workspace Membership        │ ─── Not a member? ──► Error
└────────┬──────────────────────────┘
         │
         │ Is member
         ▼
┌───────────────────────────────────┐
│ Check if Admin or Project Lead    │ ─── Neither? ──► Error
└────────┬──────────────────────────┘
         │
         │ Authorized
         ▼
┌───────────────────────────────────┐
│ Validate Business Rules           │
│ - No duplicate members            │
│ - Keep at least one lead          │
│ - Valid role values               │
└────────┬──────────────────────────┘
         │
         │ Valid
         ▼
┌───────────────────────────────────┐
│ Execute Database Operation        │
└────────┬──────────────────────────┘
         │
         ▼
┌───────────────────────────────────┐
│ Invalidate Cache & Return Success │
└───────────────────────────────────┘
\`\`\`

## Component Hierarchy

\`\`\`
nav-projects.tsx (Parent)
│
├── EditProjectForm (Sibling)
│
├── ManageProjectMembersDialog (New)
│   │
│   ├── Dialog (shadcn/ui)
│   │   │
│   │   ├── DialogHeader
│   │   │
│   │   └── DialogContent
│   │       │
│   │       ├── Add Members Section
│   │       │   │
│   │       │   ├── Popover
│   │       │   │   └── Command (Multi-select)
│   │       │   │
│   │       │   └── Add Button
│   │       │
│   │       └── Current Members Section
│   │           │
│   │           └── Member Cards (map)
│   │               │
│   │               ├── Member Info + Badge
│   │               │
│   │               ├── Role Select Dropdown
│   │               │
│   │               ├── Toggle Access Button
│   │               │
│   │               └── Remove Button
│   │
│   └── Close Button
│
└── DeleteConfirmDialog (Existing)
\`\`\`

## File Dependencies

\`\`\`
nav-projects.tsx
├── imports ManageProjectMembersDialog
├── imports getFullProjectData
└── uses workspaceMembers prop

ManageProjectMembersDialog
├── imports server actions from manage-members.ts
├── imports UI components (Dialog, Button, Select, etc.)
└── uses tryCatch helper

manage-members.ts (Server Actions)
├── imports requireUser
├── imports prisma
└── imports invalidateWorkspaceProjects

get-full-project-data.ts
├── imports requireUser
├── imports prisma
└── exports FullProjectData type
\`\`\`

## Key Design Decisions

1. **Separation of Concerns**
   - Server actions handle all business logic
   - UI components only handle presentation
   - Data fetching separated into dedicated functions

2. **Authorization at Multiple Levels**
   - UI hides options for unauthorized users
   - Server actions validate every request
   - Database constraints enforce data integrity

3. **Optimistic UI with Validation**
   - Immediate feedback via toast notifications
   - Server-side validation prevents invalid states
   - Router refresh ensures UI consistency

4. **Reusable Components**
   - ManageMembersButton can be used anywhere
   - Dialog component is self-contained
   - Server actions are independent functions

5. **Type Safety**
   - TypeScript interfaces for all data structures
   - Prisma types for database operations
   - Zod schemas for input validation (future enhancement)

6. **Cache Management**
   - Automatic invalidation after changes
   - Workspace-level cache invalidation
   - Ensures all users see updated data
\`\`\`
