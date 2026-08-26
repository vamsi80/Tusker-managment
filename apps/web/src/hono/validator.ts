import { zValidator as baseZValidator } from "@hono/zod-validator";
import { AppError } from "@tusker/core/lib/errors/app-error";

/**
 * zValidator that routes failures through AppError, so a bad body answers with
 * the same `{ success, error: string }` shape onError produces. The stock
 * validator replies with a serialized ZodError object under `error`, which
 * clients drop straight into `toast.error(data.error)` — rendering an object as
 * a React child throws and takes the whole page down.
 */
export const zValidator = ((target: any, schema: any) =>
  baseZValidator(target, schema, (result: any) => {
    if (!result.success) {
      throw AppError.ValidationError(
        result.error.issues
          .map((i: any) => (i.path.length ? `${i.path.join(".")}: ${i.message}` : i.message))
          .join("; ")
      );
    }
  })) as typeof baseZValidator;
