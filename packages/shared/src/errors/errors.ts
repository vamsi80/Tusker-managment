import { ErrorCode } from "./error-codes";

export class AppError extends Error {
    public readonly code: ErrorCode;
    public readonly statusCode: number;

    constructor(code: ErrorCode, message: string, statusCode: number = 400) {
        super(message);
        this.name = "AppError";
        this.code = code;
        this.statusCode = statusCode;
        if (Error.captureStackTrace) {
            Error.captureStackTrace(this, this.constructor);
        }
    }

    static NotFound(message: string = "Resource not found") {
        return new AppError(ErrorCode.NOT_FOUND, message, 404);
    }

    static Unauthorized(message: string = "Unauthorized") {
        return new AppError(ErrorCode.UNAUTHORIZED, message, 401);
    }

    static Forbidden(message: string = "Forbidden") {
        return new AppError(ErrorCode.FORBIDDEN, message, 403);
    }

    static ValidationError(message: string) {
        return new AppError(ErrorCode.VALIDATION_ERROR, message, 400);
    }

    static Conflict(message: string) {
        return new AppError(ErrorCode.CONFLICT, message, 409);
    }

    static Internal(message: string = "Internal Server Error") {
        return new AppError(ErrorCode.INTERNAL_SERVER_ERROR, message, 500);
    }
}

export class AuthError extends Error {
    constructor(message = "Unauthenticated") {
        super(message);
        this.name = "AuthError";
    }
}

export class NotFoundError extends Error {
    constructor(message = "Not Found") {
        super(message);
        this.name = "NotFoundError";
    }
}
