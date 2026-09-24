import { formatDate, formatDateTime } from "../core/date";
import type { CategoryPlayerAssignment, PlayerRecord } from "../core/types";

interface WorkbookExportResult {
  embeddedImageCount: number;
  failedImageCount: number;
}

interface CreatedWorkbook extends WorkbookExportResult {
  file: Blob;
}

type ProfileImageResult =
  | { status: "embedded"; dataUrl: string }
  | { status: "missing" }
  | { status: "failed" };

const workbookMimeType = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
const imageSize = 64;

export async function downloadCategoryPlayersWorkbook(
  categoryName: string,
  assignments: CategoryPlayerAssignment[],
): Promise<WorkbookExportResult> {
  const result = await createCategoryPlayersWorkbook(categoryName, assignments);
  downloadWorkbook(result.file, `${createFileNamePart(categoryName)}-igraci.xlsx`);

  return {
    embeddedImageCount: result.embeddedImageCount,
    failedImageCount: result.failedImageCount,
  };
}

export async function createCategoryPlayersWorkbook(
  categoryName: string,
  assignments: CategoryPlayerAssignment[],
): Promise<CreatedWorkbook> {
  const { Workbook } = await import("exceljs");
  const workbook = new Workbook();
  workbook.creator = "PVK Mladost Bjelovar";
  workbook.created = new Date();

  const worksheet = workbook.addWorksheet(createWorksheetName(categoryName), {
    views: [{ state: "frozen", ySplit: 1 }],
  });
  // Every assignment gets the same set of parent columns, sized to the child with the most parents.
  const parentColumnCount = Math.max(
    1,
    ...assignments.map(({ player }) => player.parents.length),
  );
  const parentColumns = Array.from({ length: parentColumnCount }, (_, index) => {
    const label = parentColumnCount === 1 ? "Roditelj" : `Roditelj ${index + 1}`;

    return [
      { header: label, key: `parent${index}Name`, width: 26 },
      { header: `${label} - telefon`, key: `parent${index}Phone`, width: 18 },
      { header: `${label} - e-pošta`, key: `parent${index}Email`, width: 30 },
    ];
  }).flat();

  worksheet.columns = [
    { header: "Ime", key: "firstName", width: 18 },
    { header: "Prezime", key: "lastName", width: 20 },
    { header: "Datum rođenja", key: "dateOfBirth", width: 15 },
    { header: "OIB", key: "oib", width: 14 },
    { header: "Adresa stanovanja", key: "address", width: 36 },
    { header: "Kategorije", key: "categories", width: 20 },
    { header: "E-pošta igrača", key: "email", width: 28 },
    { header: "Telefon igrača", key: "phone", width: 18 },
    { header: "Članarina vrijedi do", key: "membershipExpiresAt", width: 20 },
    ...parentColumns,
    { header: "GDPR suglasnost", key: "gdprConsent", width: 17 },
    { header: "Prijava zaprimljena", key: "signupSubmittedAt", width: 20 },
    { header: "Upisan u klub", key: "enrolledAt", width: 20 },
    { header: "Slika", key: "image", width: 15 },
  ];
  const imageColumnIndex = worksheet.columns.length - 1;
  worksheet.autoFilter = {
    from: { row: 1, column: 1 },
    to: { row: 1, column: worksheet.columns.length },
  };
  worksheet.getRow(1).height = 26;
  worksheet.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
  worksheet.getRow(1).fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FF1D4F91" },
  };
  worksheet.getRow(1).alignment = { vertical: "middle", horizontal: "center", wrapText: true };
  worksheet.getColumn("oib").numFmt = "@";

  const profileImages = await mapWithConcurrency(assignments, 6, ({ player }) =>
    loadProfileImage(player.user.profileImageUrl),
  );

  assignments.forEach(({ player }, index) => {
    const profileImage = profileImages[index];
    const row = worksheet.addRow({
      ...buildPlayerRowValues(player),
      image:
        profileImage?.status === "missing"
          ? "Nema slike"
          : profileImage?.status === "failed"
            ? "Slika nije dostupna"
            : "",
    });
    row.height = 54;
    row.alignment = { vertical: "middle", wrapText: true };
    row.getCell("oib").alignment = { vertical: "middle", horizontal: "center" };
    row.getCell("gdprConsent").alignment = { vertical: "middle", horizontal: "center" };
    row.getCell("image").alignment = { vertical: "middle", horizontal: "center" };

    if (profileImage?.status === "embedded") {
      const imageId = workbook.addImage({
        base64: profileImage.dataUrl,
        extension: "png",
      });
      worksheet.addImage(imageId, {
        tl: { col: imageColumnIndex + 0.25, row: row.number - 0.94 },
        ext: { width: imageSize, height: imageSize },
      });
    }
  });

  worksheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) {
      return;
    }

    row.eachCell((cell) => {
      cell.border = {
        bottom: { style: "thin", color: { argb: "FFD7E0EA" } },
      };
    });
  });

  const output = await workbook.xlsx.writeBuffer();

  return {
    file: new Blob([new Uint8Array(output)], { type: workbookMimeType }),
    embeddedImageCount: profileImages.filter((image) => image.status === "embedded").length,
    failedImageCount: profileImages.filter((image) => image.status === "failed").length,
  };
}

function buildPlayerRowValues(player: PlayerRecord): Record<string, string> {
  // Primary contact first so "Roditelj 1" is always the parent the club reaches out to.
  const parents = [...player.parents].sort(
    (left, right) => Number(right.isPrimaryContact) - Number(left.isPrimaryContact),
  );
  const parentValues = Object.fromEntries(
    parents.flatMap(({ parent }, index) => [
      [`parent${index}Name`, `${parent.user.firstName} ${parent.user.lastName}`.trim()],
      [`parent${index}Phone`, parent.user.phone ?? ""],
      [`parent${index}Email`, parent.user.email ?? ""],
    ]),
  );

  return {
    firstName: player.user.firstName,
    lastName: player.user.lastName,
    dateOfBirth: formatDate(player.dateOfBirth),
    oib: player.oib,
    address: player.address ?? "",
    categories: player.categories.map(({ category }) => category.name).join(", "),
    email: player.user.email ?? "",
    phone: player.user.phone ?? "",
    membershipExpiresAt: player.membershipExpiresAt ? formatDate(player.membershipExpiresAt) : "",
    ...parentValues,
    gdprConsent: player.gdprConsent ? "Da" : "Ne",
    // Players added by hand in the admin panel never went through the public signup form.
    signupSubmittedAt: player.sourceSignup ? formatDateTime(player.sourceSignup.createdAt) : "",
    enrolledAt: formatDateTime(player.createdAt),
  };
}

async function loadProfileImage(imageUrl: string | null | undefined): Promise<ProfileImageResult> {
  if (!imageUrl) {
    return { status: "missing" };
  }

  try {
    const response = await fetch(imageUrl);

    if (!response.ok) {
      return { status: "failed" };
    }

    const imageBlob = await response.blob();

    if (!imageBlob.type.startsWith("image/")) {
      return { status: "failed" };
    }

    return {
      status: "embedded",
      dataUrl: await cropImageToPng(imageBlob),
    };
  } catch {
    return { status: "failed" };
  }
}

function cropImageToPng(imageBlob: Blob): Promise<string> {
  const objectUrl = URL.createObjectURL(imageBlob);

  return new Promise((resolve, reject) => {
    const image = new Image();

    image.onload = () => {
      try {
        const canvas = document.createElement("canvas");
        const outputSize = 128;
        const sourceSize = Math.min(image.naturalWidth, image.naturalHeight);
        const sourceX = (image.naturalWidth - sourceSize) / 2;
        const sourceY = (image.naturalHeight - sourceSize) / 2;
        canvas.width = outputSize;
        canvas.height = outputSize;

        const context = canvas.getContext("2d");

        if (!context) {
          reject(new Error("Slika se ne može obraditi."));
          return;
        }

        context.drawImage(
          image,
          sourceX,
          sourceY,
          sourceSize,
          sourceSize,
          0,
          0,
          outputSize,
          outputSize,
        );
        resolve(canvas.toDataURL("image/png"));
      } catch (error) {
        reject(error);
      } finally {
        URL.revokeObjectURL(objectUrl);
      }
    };
    image.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error("Slika se ne može učitati."));
    };
    image.src = objectUrl;
  });
}

async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  mapper: (item: T) => Promise<R>,
) {
  const results = new Array<R>(items.length);
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < items.length) {
      const currentIndex = nextIndex;
      nextIndex += 1;
      results[currentIndex] = await mapper(items[currentIndex]);
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, () => worker()),
  );
  return results;
}

function downloadWorkbook(file: Blob, fileName: string) {
  const objectUrl = URL.createObjectURL(file);
  const link = document.createElement("a");
  link.href = objectUrl;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 0);
}

function createWorksheetName(value: string) {
  return value.replace(/[\\/?*[\]:]/g, " ").trim().slice(0, 31) || "Igrači";
}

function createFileNamePart(value: string) {
  return (
    value
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "kategorija"
  );
}
