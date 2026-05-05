
const { Hono } = require('hono');

async function test() {
    const app = new Hono().basePath("/api/v1");
    app.get("/tasks", (c) => c.text("tasks"));

    // Case 1: Full path including basePath
    const req1 = new Request("http://localhost/api/v1/tasks");
    const res1 = await app.fetch(req1);
    console.log(`Req: /api/v1/tasks -> Status: ${res1.status}, Body: ${await res1.text()}`);

    // Case 2: Path without /api (what Next.js might pass if mounted at /api)
    const req2 = new Request("http://localhost/v1/tasks");
    const res2 = await app.fetch(req2);
    console.log(`Req: /v1/tasks -> Status: ${res2.status}, Body: ${await res2.text()}`);
}

test();
