import { handle } from "hono/vercel";
import app from "@/hono";

export const runtime = "nodejs";

export const GET = (req: Request) => {
    console.log(`[NEXT_API_CATCHALL] GET ${req.url}`);
    return handle(app)(req);
};
export const POST = (req: Request) => {
    console.log(`[NEXT_API_CATCHALL] POST ${req.url}`);
    return handle(app)(req);
};
export const PUT = (req: Request) => {
    console.log(`[NEXT_API_CATCHALL] PUT ${req.url}`);
    return handle(app)(req);
};
export const DELETE = (req: Request) => {
    console.log(`[NEXT_API_CATCHALL] DELETE ${req.url}`);
    return handle(app)(req);
};
export const PATCH = (req: Request) => {
    console.log(`[NEXT_API_CATCHALL] PATCH ${req.url}`);
    return handle(app)(req);
};
export const OPTIONS = (req: Request) => {
    console.log(`[NEXT_API_CATCHALL] OPTIONS ${req.url}`);
    return handle(app)(req);
};
