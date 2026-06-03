async function main() {
  const url = "http://127.0.0.1:8787/api/v1/auth/sign-in/email";
  console.log(`Sending POST to: ${url}`);
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Origin": "http://localhost:3000",
        "Referer": "http://localhost:3000/sign-in"
      },
      body: JSON.stringify({
        email: "sachin@thewhitetusker.com",
        password: "wrong"
      })
    });
    console.log(`Status: ${res.status}`);
    const json = await res.json();
    console.log("Response:", JSON.stringify(json, null, 2));
  } catch (err) {
    console.error("Request failed:", err);
  }
}
main();
