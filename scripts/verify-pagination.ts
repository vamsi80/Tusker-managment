import { PrismaClient } from '../src/generated/prisma';
import { getTasks } from '../src/data/task/get-tasks';

// Mock userId since we can't easily run with real auth in a script
const MOCK_USER_ID = "cm70w5x2c0000uxm3f9g6u4z5"; 
const WORKSPACE_ID = "f0857321-4f39-4458-ba8f-2f7413f1737e";

async function testPagination() {
  console.log('--- Pagination Verification Test ---');
  
  try {
    // 1. Fetch first page
    console.log('Fetching Page 1...');
    const page1 = await getTasks({
      workspaceId: WORKSPACE_ID,
      limit: 2,
      view_mode: 'list',
      sorts: [{ field: 'createdAt', direction: 'desc' }]
    }, MOCK_USER_ID);

    const tasks1 = page1.tasks || [];
    console.log(`Page 1 Tasks: ${tasks1.length}`);
    tasks1.forEach(t => console.log(` - ${t.id} (${t.createdAt})`));

    if (!page1.hasMore || !page1.nextCursor) {
      console.log('Not enough tasks to test pagination. Please ensure you have at least 3 tasks.');
      return;
    }

    // 2. Fetch second page using cursor
    console.log('\nFetching Page 2 using cursor...');
    const page2 = await getTasks({
      workspaceId: WORKSPACE_ID,
      limit: 2,
      cursor: page1.nextCursor,
      view_mode: 'list',
      sorts: [{ field: 'createdAt', direction: 'desc' }]
    }, MOCK_USER_ID);

    const tasks2 = page2.tasks || [];
    console.log(`Page 2 Tasks: ${tasks2.length}`);
    tasks2.forEach(t => console.log(` - ${t.id} (${t.createdAt})`));

    // 3. Verify no overlap
    const p1Ids = new Set(tasks1.map(t => t.id));
    const overlap = tasks2.filter(t => p1Ids.has(t.id));

    if (overlap.length > 0) {
      console.error('❌ BUG DETECTED: Page 2 contains tasks from Page 1!');
    } else if (tasks2.length > 0) {
      console.log('✅ SUCCESS: Pagination is working correctly with no overlap.');
    } else {
      console.log('⚠️ Page 2 is empty. Verify if there are more tasks in the DB.');
    }

  } catch (error) {
    console.error('Error during verification:', error);
  }
}

testPagination();
