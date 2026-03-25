ALTER TABLE app_settings ADD COLUMN time_source TEXT NOT NULL DEFAULT 'system';
ALTER TABLE app_settings ADD COLUMN report_print_template_json TEXT NOT NULL DEFAULT '{}';

UPDATE app_settings
SET report_print_template_json = json_object(
  'templateName', 'OmniStock Standard',
  'accentColor', '#2563eb',
  'paperSize', 'a4',
  'orientation', 'portrait',
  'density', 'comfortable',
  'marginMm', 14,
  'headerNote', 'Warehouse Intelligence Report',
  'footerNote', 'Prepared in OmniStock',
  'showCompanyName', 1,
  'showGeneratedAt', 1,
  'showGeneratedBy', 1,
  'showFilters', 1,
  'showSummary', 1,
  'showSignatures', 0,
  'signatureLabelLeft', 'Prepared by',
  'signatureLabelRight', 'Approved by'
)
WHERE report_print_template_json IS NULL
   OR report_print_template_json = '{}'
   OR trim(report_print_template_json) = '';
