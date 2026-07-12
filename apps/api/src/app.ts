import path from "node:path";
import cors from "cors";
import express from "express";
import { env } from "./config/env";
import { errorHandler } from "./middlewares/error-handler";
import { notFoundMiddleware } from "./middlewares/not-found";
import { apiRouter } from "./routes";

function buildAllowedOrigins(frontendUrls: string[]) {
  const allowedOrigins = new Set<string>();

  for (const frontendUrl of frontendUrls) {
    const normalizedUrl = frontendUrl.replace(/\/$/, "");
    allowedOrigins.add(normalizedUrl);

    try {
      const parsed = new URL(normalizedUrl);
      const hostname =
        parsed.hostname === "localhost"
          ? "127.0.0.1"
          : parsed.hostname === "127.0.0.1"
            ? "localhost"
            : null;

      if (hostname) {
        parsed.hostname = hostname;
        allowedOrigins.add(parsed.toString().replace(/\/$/, ""));
      }
    } catch {
      allowedOrigins.add(normalizedUrl);
    }
  }

  return Array.from(allowedOrigins);
}

export function createApp() {
  const app = express();
  const allowedOrigins = buildAllowedOrigins(env.frontendUrls);
  const publicDir = path.resolve(__dirname, "../public");

  app.use(
    cors({
      origin(origin, callback) {
        if (!origin || allowedOrigins.includes(origin)) {
          callback(null, true);
          return;
        }

        callback(new Error("Origin not allowed by CORS."));
      },
      credentials: true,
    }),
  );
  app.use(express.json({ limit: "2mb" }));
  app.use(express.urlencoded({ extended: true }));
  app.use("/assets", express.static(publicDir));

  app.get("/health", (_request, response) => {
    response.json({
      status: "ok",
      timestamp: new Date().toISOString(),
    });
  });

  app.use("/api", apiRouter);
  app.use(notFoundMiddleware);
  app.use(errorHandler);

  return app;
}
