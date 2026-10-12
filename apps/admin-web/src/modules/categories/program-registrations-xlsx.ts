import { formatDate, formatDateTime } from "../core/date";
import type { ProgramRegistrationRecord } from "../core/types";
import {
  createFileNamePart,
  createWorksheetName,
  downloadWorkbook,
  styleHeaderRow,
  workbookMimeType,
} from "./category-players-xlsx";

/** Signups of one practice day of a program for non-members, one row per child. */
export async function downloadProgramRegistrationsWorkbook(
  programName: string,
  sessionDate: string,
  registrations: ProgramRegistrationRecord[],
) {
  const { Workbook } = await import("exceljs");
  const workbook = new Workbook();
  workbook.creator = "PVK Mladost Bjelovar";
  workbook.created = new Date();

  const [year, month, day] = sessionDate.split("-");
  const worksheet = workbook.addWorksheet(createWorksheetName(`${programName} ${day}.${month}.${year}.`), {
    views: [{ state: "frozen", ySplit: 1 }],
  });

  worksheet.columns = [
    { header: "Termin", key: "slot", width: 14 },
    { header: "Ime", key: "childFirstName", width: 18 },
    { header: "Prezime", key: "childLastName", width: 20 },
    { header: "Datum rođenja", key: "childDateOfBirth", width: 15 },
    { header: "Roditelj", key: "parentName", width: 26 },
    { header: "Telefon", key: "parentPhone", width: 18 },
    { header: "E-pošta", key: "parentEmail", width: 30 },
    { header: "Cijena (€)", key: "price", width: 11 },
    { header: "Poziv na broj", key: "paymentReference", width: 20 },
    { header: "Prijavljeno", key: "createdAt", width: 20 },
  ];
  worksheet.autoFilter = {
    from: { row: 1, column: 1 },
    to: { row: 1, column: worksheet.columns.length },
  };
  styleHeaderRow(worksheet);

  for (const registration of registrations) {
    const row = worksheet.addRow({
      slot: `${registration.startTime}–${registration.endTime}`,
      childFirstName: registration.childFirstName,
      childLastName: registration.childLastName,
      childDateOfBirth: formatDate(registration.childDateOfBirth),
      parentName: `${registration.parentFirstName} ${registration.parentLastName}`,
      parentPhone: registration.parentPhone,
      parentEmail: registration.parentEmail,
      price: registration.priceCents / 100,
      paymentReference: registration.paymentReference,
      createdAt: formatDateTime(registration.createdAt),
    });
    row.alignment = { vertical: "middle", wrapText: true };
    row.getCell("price").numFmt = "0.00";
    row.eachCell((cell) => {
      cell.border = { bottom: { style: "thin", color: { argb: "FFD7E0EA" } } };
    });
  }

  const output = await workbook.xlsx.writeBuffer();
  downloadWorkbook(
    new Blob([new Uint8Array(output)], { type: workbookMimeType }),
    `${createFileNamePart(programName)}-${sessionDate}-prijave.xlsx`,
  );
}
