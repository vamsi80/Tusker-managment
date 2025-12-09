import { NextRequest, NextResponse } from "next/server";
import { updateSubTaskStatus } from "@/app/actions/subtask-status-actions";
import { generateMoveOperationId } from "@/utils/operation-id";

type TaskStatus = "TO_DO" | "IN_PROGRESS" | "BLOCKED" | "REVIEW" | "HOLD" | "COMPLETED";

interface MoveCardRequest {
    subTaskId: string;
    newStatus: TaskStatus;
    operationId?: string;
    workspaceId: string;
    projectId: string;
}

/**
 * API Route: Move Kanban Card
 * 
 * POST /api/kanban/move
 * 
 * Moves a subtask to a new status column with permission validation and audit logging.
 * Supports idempotency via operationId to prevent duplicate moves.
 * 
 * Example Request:
 * ```json
 * {
 *   "subTaskId": "clx123abc",
 *   "newStatus": "IN_PROGRESS",
 *   "operationId": "move-clx123abc-IN_PROGRESS-1702123456789",
 *   "projectId": "proj_123",
 *   "workspaceId": "ws_456"
 * }
 * ```
 * 
 * Example Response (Success):
 * ```json
 * {
 *   "success": true,
 *   "subTask": {
 *     "id": "clx123abc",
 *     "status": "IN_PROGRESS",
 *     "updatedAt": "2025-12-09T11:21:33Z"
 *   },
 *   "auditLog": {
 *     "id": "audit_789",
 *     "operationId": "move-clx123abc-IN_PROGRESS-1702123456789",
 *     "action": "MOVE",
 *     "timestamp": "2025-12-09T11:21:33Z"
 *   }
 * }
 * ```
 * 
 * Example Response (Error):
 * ```json
 * {
 *   "success": false,
 *   "error": "You are not authorized to move this card to COMPLETED status. Only admins and leads can move cards to this status."
 * }
 * ```
 */
export async function POST(request: NextRequest) {
    try {
        const body: MoveCardRequest = await request.json();

        // Validate required fields
        if (!body.subTaskId || !body.newStatus || !body.workspaceId || !body.projectId) {
            return NextResponse.json(
                {
                    success: false,
                    error: "Missing required fields: subTaskId, newStatus, workspaceId, projectId",
                },
                { status: 400 }
            );
        }

        // Validate status
        const validStatuses: TaskStatus[] = ["TO_DO", "IN_PROGRESS", "BLOCKED", "REVIEW", "HOLD", "COMPLETED"];
        if (!validStatuses.includes(body.newStatus)) {
            return NextResponse.json(
                {
                    success: false,
                    error: `Invalid status: ${body.newStatus}. Must be one of: ${validStatuses.join(", ")}`,
                },
                { status: 400 }
            );
        }

        // Generate operation ID if not provided
        const operationId = body.operationId || generateMoveOperationId(body.subTaskId, body.newStatus);

        // Call server action
        const result = await updateSubTaskStatus(
            body.subTaskId,
            body.newStatus,
            body.workspaceId,
            body.projectId,
            operationId
        );

        if (!result.success) {
            return NextResponse.json(result, { status: 403 });
        }

        return NextResponse.json(result, { status: 200 });
    } catch (error) {
        console.error("Error in move card API:", error);
        return NextResponse.json(
            {
                success: false,
                error: "An unexpected error occurred while moving the card. Please try again.",
            },
            { status: 500 }
        );
    }
}
