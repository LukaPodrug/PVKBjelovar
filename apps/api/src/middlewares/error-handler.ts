import { Prisma } from "@prisma/client";
import type { NextFunction, Request, Response } from "express";
import { AppError } from "../errors/app-error";

export function errorHandler(
  error: unknown,
  _request: Request,
  response: Response,
  _next: NextFunction,
) {
  if (error instanceof AppError) {
    response.status(error.statusCode).json({
      message: error.message,
      details: error.details,
    });
    return;
  }

  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === "P2002") {
      response.status(409).json({
        message: "Vrijednost jedinstvenog polja već postoji.",
        details: error.meta,
      });
      return;
    }

    if (error.code === "P2025") {
      response.status(404).json({
        message: "Traženi zapis nije pronađen.",
      });
      return;
    }
  }

  console.error(error);
  response.status(500).json({
    message: "Interna greška poslužitelja.",
  });
}
