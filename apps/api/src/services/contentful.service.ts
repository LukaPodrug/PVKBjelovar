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

    const environment = await this.getEnvironment();
    const upload = await environment.createUpload({ file: file.buffer });

    let asset = await environment.createAsset({
      fields: {
        title: {
          [env.contentfulLocale]: title,
        },
        file: {
          [env.contentfulLocale]: {
            contentType: file.mimetype,
            fileName: file.originalname,
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
  }
}

export const contentfulService = new ContentfulService();
