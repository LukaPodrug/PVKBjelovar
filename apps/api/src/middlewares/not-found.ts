import type { NextFunction, Request, Response } from "express";
import { AppError } from "../errors/app-error";

export function notFoundMiddleware(request: Request, _response: Response, next: NextFunction) {
  next(new AppError(`Ruta ${request.method} ${request.originalUrl} nije pronađena.`, 404));
}
