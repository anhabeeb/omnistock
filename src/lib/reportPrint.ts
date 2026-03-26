import type { AppSettings, ReportPrintTemplate } from "../../shared/types";
import type { WorkbookSheet } from "./export";

interface ReportDocumentOptions {
  title: string;
  subtitle: string;
  companyName: string;
  generatedBy: string;
  generatedAt: string;
  filtersLabel?: string;
  settings: AppSettings;
  sheets: WorkbookSheet[];
  autoPrint?: boolean;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function cellValue(value: unknown): string {
  if (value === null || value === undefined || value === "") {
    return "--";
  }
  return String(value);
}

function densityValues(density: ReportPrintTemplate["density"]) {
  return density === "compact"
    ? {
        baseFontSize: "11px",
        headingSize: "22px",
        bodyGap: "16px",
        cellPadding: "8px 10px",
        sectionPadding: "12px",
      }
    : {
        baseFontSize: "12px",
        headingSize: "24px",
        bodyGap: "20px",
        cellPadding: "10px 12px",
        sectionPadding: "16px",
      };
}

function buildSectionMarkup(sheet: WorkbookSheet): string {
  const rows = sheet.rows ?? [];
  const columns = rows[0] ? Object.keys(rows[0]) : [];
  const metricsOnly =
    columns.length === 3 && columns.includes("Metric") && columns.includes("Value") && columns.includes("Window");

  if (metricsOnly) {
    return `
      <section class="report-section">
        <div class="report-section__header">
          <h2>${escapeHtml(sheet.name)}</h2>
        </div>
        <div class="metric-grid">
          ${rows
            .map((row) => {
              const label = cellValue(row.Metric);
              const value = cellValue(row.Value);
              const detail = cellValue(row.Window);
              return `
                <article class="metric-card">
                  <span class="metric-card__label">${escapeHtml(label)}</span>
                  <strong class="metric-card__value">${escapeHtml(value)}</strong>
                  <small class="metric-card__detail">${escapeHtml(detail)}</small>
                </article>
              `;
            })
            .join("")}
        </div>
      </section>
    `;
  }

  return `
    <section class="report-section">
      <div class="report-section__header">
        <h2>${escapeHtml(sheet.name)}</h2>
      </div>
      ${
        columns.length === 0
          ? `<p class="empty-copy">No rows were available for this section.</p>`
          : `
            <div class="table-shell">
              <table class="report-table">
                <thead>
                  <tr>${columns.map((column) => `<th>${escapeHtml(column)}</th>`).join("")}</tr>
                </thead>
                <tbody>
                  ${rows
                    .map(
                      (row) => `
                        <tr>
                          ${columns
                            .map((column) => `<td>${escapeHtml(cellValue(row[column]))}</td>`)
                            .join("")}
                        </tr>
                      `,
                    )
                    .join("")}
                </tbody>
              </table>
            </div>
          `
      }
    </section>
  `;
}

function buildSummaryMarkup(summaryMetrics: Record<string, unknown>[]): string {
  if (!summaryMetrics.length) {
    return "";
  }

  return `
    <section class="report-section">
      <div class="report-section__header">
        <h2>Summary</h2>
      </div>
      <div class="summary-grid">
        ${summaryMetrics
          .slice(0, 6)
          .map(
            (row) => `
              <article class="summary-card">
                <span class="metric-card__label">${escapeHtml(cellValue(row.Metric))}</span>
                <strong class="summary-card__value">${escapeHtml(cellValue(row.Value))}</strong>
                <small class="summary-card__detail">${escapeHtml(cellValue(row.Window))}</small>
              </article>
            `,
          )
          .join("")}
      </div>
    </section>
  `;
}

function buildTextBlock(label: string, content: string, title = false): string {
  if (!content.trim()) {
    return "";
  }

  return `
    <section class="designer-text-block${title ? " designer-text-block--title" : ""}">
      <span class="${title ? "report-kicker" : "designer-text-block__label"}">${escapeHtml(label)}</span>
      ${title ? `<h1>${escapeHtml(content)}</h1>` : `<p>${escapeHtml(content)}</p>`}
    </section>
  `;
}

function buildMetaBlock(label: string, value: string): string {
  if (!value.trim()) {
    return "";
  }

  return `
    <article class="report-meta__card designer-meta-card">
      <span class="report-meta__label">${escapeHtml(label)}</span>
      <strong class="report-meta__value">${escapeHtml(value)}</strong>
    </article>
  `;
}

function buildSignatureMarkup(template: ReportPrintTemplate): string {
  return `
    <section class="report-section">
      <div class="report-section__header">
        <h2>Sign-Off</h2>
      </div>
      <div class="signature-grid">
        <div class="signature-card">
          <strong>${escapeHtml(template.signatureLabelLeft)}</strong>
        </div>
        <div class="signature-card">
          <strong>${escapeHtml(template.signatureLabelRight)}</strong>
        </div>
      </div>
    </section>
  `;
}

function wrapPlacedBlock(
  block: ReportPrintTemplate["layoutBlocks"][number],
  content: string,
): string {
  if (!content.trim()) {
    return "";
  }

  return `
    <section
      class="report-placed-block"
      style="
        left: ${block.x}%;
        top: ${block.y}%;
        width: ${block.width}%;
        z-index: ${block.z};
        min-height: ${block.minHeight}px;
      "
    >
      ${content}
    </section>
  `;
}

function buildLayoutMarkup(
  options: ReportDocumentOptions,
  summaryMetrics: Record<string, unknown>[],
): string {
  const template = options.settings.reportPrintTemplate;
  return template.layoutBlocks
    .filter((block) => block.enabled)
    .sort((left, right) => left.z - right.z || left.y - right.y || left.x - right.x)
    .map((block) => {
      let content = "";
      switch (block.type) {
        case "company-name":
          content = buildMetaBlock(block.label, options.companyName);
          break;
        case "generated-by":
          content = buildMetaBlock(block.label, options.generatedBy);
          break;
        case "generated-at":
          content = buildMetaBlock(block.label, options.generatedAt);
          break;
        case "filters":
          content = buildMetaBlock(block.label, options.filtersLabel ?? "");
          break;
        case "report-title":
          content = buildTextBlock(block.label, options.title, true);
          break;
        case "report-subtitle":
          content = buildTextBlock(block.label, options.subtitle);
          break;
        case "header-note":
          content = buildTextBlock(block.label, template.headerNote || block.content);
          break;
        case "summary":
          content = buildSummaryMarkup(summaryMetrics);
          break;
        case "report-sections":
          content = options.sheets.map((sheet) => buildSectionMarkup(sheet)).join("");
          break;
        case "footer-note":
          content = buildTextBlock(block.label, template.footerNote || block.content);
          break;
        case "signatures":
          content = template.showSignatures ? buildSignatureMarkup(template) : "";
          break;
        case "custom-text":
          content = buildTextBlock(block.label, block.content);
          break;
        default:
          content = "";
      }
      return wrapPlacedBlock(block, content);
    })
    .join("");
}

function buildReportDocumentHtml(options: ReportDocumentOptions): string {
  const template = options.settings.reportPrintTemplate;
  const density = densityValues(template.density);
  const paperSize = template.paperSize === "letter" ? "Letter" : "A4";
  const summarySheet = template.showSummary ? options.sheets[0] : undefined;
  const summaryMetrics =
    summarySheet?.rows?.filter(
      (row) => "Metric" in row && "Value" in row && "Window" in row,
    ) ?? [];
  const layoutMarkup = buildLayoutMarkup(options, summaryMetrics);

  return `<!DOCTYPE html>
  <html lang="en">
    <head>
      <meta charset="utf-8" />
      <title>${escapeHtml(options.title)}</title>
      <style>
        @page {
          size: ${paperSize} ${template.orientation};
          margin: ${template.marginMm}mm;
        }

        :root {
          --accent: ${template.accentColor};
          --text: #0f172a;
          --muted: #5b6475;
          --line: #d8dfec;
          --panel: #f8fbff;
          --panel-strong: #eef4ff;
        }

        * {
          box-sizing: border-box;
        }

        body {
          margin: 0;
          color: var(--text);
          background: #ffffff;
          font-family: "Inter", "Segoe UI", sans-serif;
          font-size: ${density.baseFontSize};
          line-height: 1.55;
        }

        .report-shell {
          display: grid;
          gap: ${density.bodyGap};
          min-height: 100%;
        }

        .report-canvas {
          position: relative;
          min-height: 1180px;
        }

        .report-placed-block {
          position: absolute;
          display: block;
          padding-right: 8px;
          break-inside: avoid;
        }

        .report-kicker,
        .designer-text-block__label,
        .report-meta__label,
        .metric-card__label {
          display: block;
          color: var(--muted);
          font-size: 11px;
          letter-spacing: 0.08em;
          text-transform: uppercase;
          font-weight: 700;
        }

        .report-kicker {
          color: var(--accent);
          letter-spacing: 0.16em;
          font-weight: 800;
        }

        .designer-text-block,
        .report-meta__card,
        .metric-card,
        .summary-card {
          border: 1px solid var(--line);
          border-radius: 14px;
          background: var(--panel);
        }

        .designer-text-block {
          display: grid;
          gap: 6px;
          padding: ${density.sectionPadding};
        }

        .designer-text-block--title {
          border-top: 3px solid var(--accent);
        }

        .designer-text-block p,
        .designer-text-block h1 {
          margin: 0;
        }

        .designer-text-block h1 {
          font-size: ${density.headingSize};
          line-height: 1.15;
        }

        .report-meta__card {
          padding: 12px 14px;
        }

        .report-meta__value,
        .metric-card__value,
        .summary-card__value {
          display: block;
          margin-top: 4px;
          font-size: 16px;
          font-weight: 800;
        }

        .metric-card__detail,
        .summary-card__detail {
          display: block;
          margin-top: 6px;
          color: var(--muted);
        }

        .report-section {
          display: grid;
          gap: 12px;
        }

        .report-section__header h2 {
          margin: 0;
          font-size: 18px;
        }

        .summary-grid,
        .metric-grid,
        .signature-grid {
          display: grid;
          gap: 12px;
          grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
        }

        .summary-card,
        .metric-card {
          padding: ${density.sectionPadding};
        }

        .table-shell {
          overflow: hidden;
          border: 1px solid var(--line);
          border-radius: 14px;
        }

        .report-table {
          width: 100%;
          border-collapse: collapse;
        }

        .report-table th,
        .report-table td {
          padding: ${density.cellPadding};
          border-bottom: 1px solid var(--line);
          text-align: left;
          vertical-align: top;
        }

        .report-table th {
          background: var(--panel-strong);
          font-size: 11px;
          text-transform: uppercase;
          letter-spacing: 0.08em;
        }

        .report-table tr:last-child td {
          border-bottom: 0;
        }

        .signature-card {
          padding-top: 18px;
          border-top: 1px solid var(--line);
        }

        .report-footer {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 16px;
          border-top: 1px solid var(--line);
          padding-top: 12px;
          color: var(--muted);
          font-size: 11px;
        }

        .page-count::after {
          content: counter(page);
        }

        .empty-copy {
          margin: 0;
          color: var(--muted);
        }
      </style>
    </head>
      <body>
        <main class="report-shell">
          <section class="report-canvas">
            ${layoutMarkup}
          </section>
          <footer class="report-footer">
          <span>${escapeHtml(template.templateName)}</span>
          <span>${escapeHtml(options.settings.timezone)} · Page <span class="page-count"></span></span>
        </footer>
      </main>
    </body>
  </html>`;
}

export function openReportDocument(options: ReportDocumentOptions) {
  const popup = window.open("", "_blank", "noopener,noreferrer");
  if (!popup) {
    throw new Error("Your browser blocked the report window. Allow popups and try again.");
  }

  popup.document.open();
  popup.document.write(buildReportDocumentHtml(options));
  popup.document.close();

  if (options.autoPrint) {
    popup.focus();
    popup.print();
  }
}
