import { AnalyzerPageV2 } from '@/components/analyzer/AnalyzerPageV2';

// Route Segment Config — sets the maximum execution duration for this route and
// all server actions invoked from it (submitAnalysis + waitUntil background work).
// Source: Next.js Route Segment Config docs:
//   nextjs.org/docs/app/api-reference/file-conventions/route-segment-config#maxduration
// Vercel Pro plan ceiling: 300 s. Worst observed pipeline run: ~75 s.
export const maxDuration = 300;

export default function Home() {
  return <AnalyzerPageV2 />;
}
