
async function testApi() {
    const slug = "baanphad-thai-2nd-nfjfjfjjfjfjf";
    const workspaceId = "846e17c7-d85f-4453-9ca0-0acc7bfce49c";
    const url = `http://localhost:3000/api/v1/tasks/slug/${slug}?w=${workspaceId}`;
    
    console.log(`Testing URL: ${url}`);
    try {
        const res = await fetch(url);
        console.log(`Status: ${res.status}`);
        const text = await res.text();
        console.log(`Body (first 100 chars): ${text.substring(0, 100)}`);
    } catch (err) {
        console.error("Fetch failed:", err);
    }
}

testApi();
