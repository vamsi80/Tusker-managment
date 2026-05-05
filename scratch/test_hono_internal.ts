import { TasksService } from "../src/server/services/task/tasks.service";

async function test() {
  const workspaceId = "846e17c7-d85f-4453-9ca0-0acc7bfce49c";
  const slug = "tally-white-tusker-llp";
  
  console.log(`Internal Test: slug=${slug}, w=${workspaceId}`);
  
  try {
    const task = await TasksService.getTaskBySlugOrId(workspaceId, slug);
    console.log("SUCCESS: Task found internally!");
    console.log("Task ID:", task.id);
  } catch (err: any) {
    console.error("FAILURE: Internal lookup failed!");
    console.error("Error:", err.message);
    if (err.stack) console.error(err.stack);
  }
}

test();
