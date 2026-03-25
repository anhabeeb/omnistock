import type {
  PrintDensity,
  PrintOrientation,
  PrintPaperSize,
  ReportPrintTemplate,
  TimeSource,
} from "./types";

export const DEFAULT_TIME_SOURCE: TimeSource = "system";
export const DEFAULT_PRINT_PAPER_SIZE: PrintPaperSize = "a4";
export const DEFAULT_PRINT_ORIENTATION: PrintOrientation = "portrait";
export const DEFAULT_PRINT_DENSITY: PrintDensity = "comfortable";

export function createDefaultReportPrintTemplate(companyName = "OmniStock"): ReportPrintTemplate {
  return {
    templateName: "OmniStock Standard",
    accentColor: "#2563eb",
    paperSize: DEFAULT_PRINT_PAPER_SIZE,
    orientation: DEFAULT_PRINT_ORIENTATION,
    density: DEFAULT_PRINT_DENSITY,
    marginMm: 14,
    headerNote: "Warehouse Intelligence Report",
    footerNote: `Prepared in ${companyName}`,
    showCompanyName: true,
    showGeneratedAt: true,
    showGeneratedBy: true,
    showFilters: true,
    showSummary: true,
    showSignatures: false,
    signatureLabelLeft: "Prepared by",
    signatureLabelRight: "Approved by",
  };
}
