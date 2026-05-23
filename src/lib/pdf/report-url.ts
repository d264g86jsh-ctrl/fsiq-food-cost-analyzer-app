export function buildReportUrl(submissionId: string): string {
  const base = process.env.NEXT_PUBLIC_APP_URL ?? '';
  return `${base}/report/${submissionId}`;
}
