
import { updateSubTaskStatus } from "../src/actions/task/kanban/update-subtask-status";

async function quickTest() {
    const subTaskId = "ce5294c1-3fe5-4cbf-bb00-e0e905e048f0";
    const workspaceId = "52dd2e07-c2a0-46ce-960a-65299f72eebc";
    const projectId = "9229afca-0063-4923-916a-810b5ee479c8";

    console.log("Running optimized action...");
    const start = performance.now();
    try {
        const result = await updateSubTaskStatus(
            subTaskId,
            "IN_PROGRESS",
            workspaceId,
            projectId
        );
        const end = performance.now();
        console.log(`RESULT: ${result.success ? "SUCCESS" : "FAILED"}`);
        console.log(`DURATION: ${(end - start).toFixed(2)}ms`);
        if (!result.success) console.log(`ERROR: ${result.error}`);
    } catch (e: any) {
        console.log(`CRASH: ${e.message}`);
    }
}

quickTest();
