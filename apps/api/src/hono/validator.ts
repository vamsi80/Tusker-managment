import { zValidator as baseZValidator } from "@hono/zod-validator";
import { createMiddleware } from "hono/factory";
import { HTTPException } from "hono/http-exception";
import { AppError } from "@tusker/core/lib/errors/app-error";

const toAppError = (error: any) =>
  AppError.ValidationError(
    error.issues
      .map((i: any) => (i.path.length ? `${i.path.join(".")}: ${i.message}` : i.message))
      .join("; ")
  );

/**
 * zValidator that routes failures through AppError, so a bad body answers with
 * the same `{ success, error: string }` shape onError produces. The stock
 * validator replies with a serialized ZodError object under `error`, which
 * clients drop straight into `toast.error(data.error)` — rendering an object as
 * a React child throws and takes the whole page down.
 *
 * JSON bodies are read whatever the Content-Type says. The stock validator
 * treats any header that isn't exactly `application/json` as "no body" and
 * validates `{}` instead: desktop app <= 1.2.2 sends the header twice, which
 * fetch merges into "application/json, application/json", so every field came
 * through as undefined ("projectId: expected string, received undefined").
 */
export const zValidator = ((target: any, schema: any) => {
  if (target !== "json") {
    return baseZValidator(target, schema, (result: any) => {
      if (!result.success) throw toAppError(result.error);
    });
  }

  return createMiddleware(async (c, next) => {
    const text = await c.req.text();
    let body: unknown = {};
    if (text.trim()) {
      try {
        body = JSON.parse(text);
      } catch {
        throw new HTTPException(400, { message: "Malformed JSON in request body" });
      }
    }
    const result = await schema.safeParseAsync(body);
    if (!result.success) throw toAppError(result.error);
    c.req.addValidatedData("json", result.data);
    await next();
  });
}) as typeof baseZValidator;
