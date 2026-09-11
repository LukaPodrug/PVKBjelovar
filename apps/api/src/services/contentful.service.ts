import { createClient } from "contentful-management";
import type { Express } from "express";
import { env } from "../config/env";
import { AppError } from "../errors/app-error";

class ContentfulService {
  private readonly client = env.contentfulManagementToken
    ? createClient({
        accessToken: env.contentfulManagementToken,
      })
    : null;

  private environmentPromise: Promise<any> | null = null;

  isConfigured(): boolean {
    return Boolean(this.client && env.contentfulSpaceId);
  }

  private async getEnvironment(): Promise<any> {
    if (!this.client || !env.contentfulSpaceId) {
      throw new AppError("Contentful nije konfiguriran za prijenos datoteka.", 500);
    }

    if (!this.environmentPromise) {
      this.environmentPromise = this.client
        .getSpace(env.contentfulSpaceId)
        .then((space) => space.getEnvironment(env.contentfulEnvironment));
    }

    return this.environmentPromise;
  }

  async uploadImage(file: Express.Multer.File, title: string): Promise<string> {
    if (!this.isConfigured()) {
      throw new AppError("Contentful prijenos nije konfiguriran.", 500);
    }

    try {
      const environment = await this.getEnvironment();
      const upload = await environment.createUpload({ file: file.buffer });
      const fileName = createAssetFileName(title, file);

      let asset = await environment.createAsset({
        fields: {
          title: {
            [env.contentfulLocale]: title,
          },
          file: {
            [env.contentfulLocale]: {
              contentType: file.mimetype,
              fileName,
              uploadFrom: {
                sys: {
                  type: "Link",
                  linkType: "Upload",
                  id: upload.sys.id,
                },
              },
            },
          },
        },
      });

      asset = await asset.processForLocale(env.contentfulLocale, {
        processingCheckRetries: 10,
        processingCheckWait: 1000,
      });
      asset = await asset.publish();

      const uploadedFile = asset.fields.file?.[env.contentfulLocale];
      const url = uploadedFile?.url;

      if (!url) {
        throw new AppError("Contentful prijenos je uspio, ali URL nije vraćen.", 500);
      }

      return url.startsWith("//") ? `https:${url}` : url;
    } catch (error) {
      if (error instanceof AppError) {
        throw error;
      }

      if (isContentfulAuthError(error)) {
        throw new AppError(
          "Contentful Management API token nije ispravan. U Render env postavite CONTENTFUL_MANAGEMENT_TOKEN na Contentful Management API token, ne Delivery ili Preview token.",
          502,
        );
      }

      throw error;
    }
  }
}

function createAssetFileName(title: string, file: Express.Multer.File) {
  const name =
    title
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-zA-Z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "") || "image";
  const extension = resolveImageExtension(file);

  return `${name}${extension}`;
}

function resolveImageExtension(file: Express.Multer.File) {
  const extensionByMimeType: Record<string, string> = {
    "image/avif": ".avif",
    "image/gif": ".gif",
    "image/heic": ".heic",
    "image/heif": ".heif",
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/svg+xml": ".svg",
    "image/webp": ".webp",
  };
  const mappedExtension = extensionByMimeType[file.mimetype.toLowerCase()];

  if (mappedExtension) {
    return mappedExtension;
  }

  const originalExtension = /\.[a-zA-Z0-9]{1,8}$/.exec(file.originalname)?.[0];
  return originalExtension?.toLowerCase() ?? ".img";
}

function isContentfulAuthError(error: unknown): boolean {
  if (!error || typeof error !== "object") {
    return false;
  }

  const candidate = error as {
    name?: string;
    status?: number;
    statusCode?: number;
    message?: string;
  };
  const status = candidate.status ?? candidate.statusCode;
  const message = candidate.message ?? "";

  return (
    candidate.name === "AccessTokenInvalid" ||
    status === 401 ||
    status === 403 ||
    message.includes("access token")
  );
}

export const contentfulService = new ContentfulService();
