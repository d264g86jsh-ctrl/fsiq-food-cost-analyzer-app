export function buildReportUrl(submissionId: string): string {
  // Mirror meta-events.ts: strip trailing slashes and default to the prod host so a
  // misconfigured NEXT_PUBLIC_APP_URL (trailing slash, or unset) can't produce
  // `//report` or a host-less URL in customer-facing emails (fsiq_pdf_url).
  const base = (process.env.NEXT_PUBLIC_APP_URL ?? 'https://app.foodserviceiq.com').replace(/\/+$/, '');
  return `${base}/report/${submissionId}`;
}
