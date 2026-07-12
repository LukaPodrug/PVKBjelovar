import { Router } from "express";
import { authRouter } from "./auth.routes";
import { categoriesRouter } from "./categories.routes";
import { clubSettingsRouter } from "./club-settings.routes";
import { coachesRouter } from "./coaches.routes";
import { meRouter } from "./me.routes";
import { parentsRouter } from "./parents.routes";
import { playersRouter } from "./players.routes";
import { schedulesRouter } from "./schedules.routes";
import { signupsRouter } from "./signups.routes";
import { usersRouter } from "./users.routes";

export const apiRouter = Router();

apiRouter.use("/auth", authRouter);
apiRouter.use("/me", meRouter);
apiRouter.use("/club-settings", clubSettingsRouter);
apiRouter.use("/categories", categoriesRouter);
apiRouter.use("/coaches", coachesRouter);
apiRouter.use("/parents", parentsRouter);
apiRouter.use("/players", playersRouter);
apiRouter.use("/schedules", schedulesRouter);
apiRouter.use("/signups", signupsRouter);
apiRouter.use("/users", usersRouter);
