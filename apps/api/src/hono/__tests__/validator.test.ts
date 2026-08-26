import { describe, it, expect } from "vitest";
import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "../validator";
import { AppError } from "@tusker/core/lib/errors/app-error";

/**
 * A rejected body must answer with `error` as a *string*. The stock validator
 * put a ZodError object there, and clients that do `toast.error(data.error)`
 * crashed the page rendering an object as a React child.
 */
describe("zValidator", () => {
  const app = new Hono()
    .onError((err, c) =>
      c.json({ success: false, error: err.message }, err instanceof AppError ? (err.statusCode as any) : 500)
    )
    .post("/", zValidator("json", z.object({ name: z.string().min(2) })), (c) =>
      c.json({ success: true, data: c.req.valid("json") })
    );

  const post = (body: unknown) =>
    app.request("/", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

  it("reports a rejected body as a string", async () => {
    const res = await post({ name: "x" });
    const json = (await res.json()) as { error?: string };

    expect(res.status).toBe(400);
    expect(typeof json.error).toBe("string");
    expect(json.error).toContain("name");
  });

  it("still passes a valid body through", async () => {
    const res = await post({ name: "Mahadev Steel" });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true, data: { name: "Mahadev Steel" } });
  });
});
