import multer from "multer";
import { env } from "../config/env";
import { AppError } from "../errors/app-error";

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: env.maxUploadSizeMb * 1024 * 1024,
  },
  fileFilter: (_request, file, callback) => {
    if (!file.mimetype.startsWith("image/")) {
      callback(new AppError("Podržan je samo prijenos slika.", 400));
      return;
    }

    callback(null, true);
  },
});

export const uploadCategoryLogo = upload.single("logo");
export const uploadClubLogo = upload.single("logo");
export const uploadProfileImage = upload.single("profileImage");
export const uploadSignupImages = upload.fields([
  { name: "parentOneProfileImage", maxCount: 1 },
  { name: "parentTwoProfileImage", maxCount: 1 },
  { name: "childProfileImage", maxCount: 1 },
]);
