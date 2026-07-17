---
trigger: always_on
---

# Real-Time UI Synchronization Standard

## Mandatory Rule

All CRUD operations (Create, Read, Update, Delete) must update the UI instantly for all active users without requiring a page refresh.

## Real-Time Architecture

* Pusher is the only approved real-time communication layer.
* Do not use Supabase Realtime.
* Do not implement custom WebSocket servers.
* All real-time updates must be broadcast through Pusher channels and events.

## Required Behavior

When any user:

* Creates a task
* Updates a task
* Deletes a task
* Changes task status
* Assigns or reassigns a task
* Adds comments
* Updates project data
* Updates dashboard data
* Updates notifications

The system must:

1. Persist changes to the database.
2. Trigger a Pusher event.
3. Notify all connected clients.
4. Update local state immediately.
5. Re-render only affected components.
6. Never require manual page refresh.

## User Synchronization

* The user performing the action must see updates immediately.
* All active users viewing related data must receive the update in real time.
* Kanban boards, task lists, dashboards, reports, comments, notifications, and detail views must stay synchronized across all sessions.

## State Management

* Maintain a centralized reactive state store.
* Update state from Pusher events.
* Avoid full page reloads.
* Avoid refetching entire screens when a single record changes.

## Optimistic Updates

* Apply UI updates immediately after user actions.
* Sync with server response.
* Roll back only when the operation fails.

## Performance Rules

* Update only affected records.
* Prevent duplicate events.
* Prevent unnecessary re-renders.
* Preserve filters, sorting, pagination, and user context during updates.

## Success Criteria

At no point should any user need to:

* Refresh the browser
* Reopen a page
* Navigate away and back

All data must remain synchronized in real time across all active sessions using Pusher.
