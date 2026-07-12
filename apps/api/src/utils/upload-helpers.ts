import type { Express } from "express";
import { contentfulService } from "../services/contentful.service";
import { optionalString } from "./request-parsers";

export async function resolveUploadedImageUrl(
  file: Express.Multer.File | undefined,
  title: string,
  fallbackValue?: unknown,
): Promise<string | null> {
  if (file) {
    return contentfulService.uploadImage(file, title);
  }

  return optionalString(fallbackValue);
}

export function getUploadedFileMap(files: unknown): Record<string, Express.Multer.File[]> {
  return (files ?? {}) as Record<string, Express.Multer.File[]>;
}
