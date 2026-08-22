import { isValidElement, type ReactNode } from "react";
import { toast as sonnerToast } from "sonner";

/**
 * sonner drops whatever it is handed straight into JSX, so `toast.error(obj)`
 * — e.g. an API that answers `error` with an object instead of a string —
 * throws "Objects are not valid as a React child" mid-render and takes the
 * whole page down with it. Coerce anything unrenderable to readable text.
 */
function renderable(value: unknown): ReactNode {
  if (value == null || typeof value === "string" || typeof value === "number") return value;
  if (isValidElement(value)) return value;
  if (typeof value === "object") {
    const { message, error } = value as { message?: unknown; error?: unknown };
    if (typeof message === "string") return message;
    if (typeof error === "string") return error;
  }
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

const guard = <T extends (message: any, ...rest: any[]) => any>(fn: T) =>
  ((message: unknown, ...rest: any[]) => fn(renderable(message), ...rest)) as T;

export const toast = Object.assign(guard(sonnerToast), sonnerToast, {
  message: guard(sonnerToast.message),
  success: guard(sonnerToast.success),
  error: guard(sonnerToast.error),
  info: guard(sonnerToast.info),
  warning: guard(sonnerToast.warning),
  loading: guard(sonnerToast.loading),
});
