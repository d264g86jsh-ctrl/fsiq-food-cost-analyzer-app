import type { Submission, Prisma } from '@prisma/client';
import {
  QualifiedBadge,
  PdfStatusBadge,
  CrmSyncBadge,
  MetaStatusBadge,
} from './SubmissionStatusBadge';
import { WorkflowTimeline } from './WorkflowTimeline';
import { ManualReviewPanel } from './ManualReviewPanel';
import {
  formatDate,
  formatDollar,
  finalDecisionLabel,
  sanitizeErrorString,
} from '@/lib/admin/submission-formatters';

function Card({
  title,
  action,
  children,
  className = '',
}: {
  title: string;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`card-soft rounded-2xl p-5 ${className}`}>
      <div className={`flex items-center justify-between gap-3 ${action ? 'mb-4' : 'mb-3'}`}>
        <h2 className="text-[15px] font-semibold text-[#143225] tracking-[-0.01em]">{title}</h2>
        {action}
      </div>
      {children}
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="dl-row">
      <span>{label}</span>
      <span>{children}</span>
    </div>
  );
}

function Mono({ children }: { children: React.ReactNode }) {
  return (
    <span className="font-mono text-[12px] text-[#143225] bg-[#f8faf6] border border-[#eef0ea] px-1.5 py-0.5 rounded">
      {children}
    </span>
  );
}

interface SubmissionDetailProps {
  submission: Submission;
}

export function SubmissionDetail({ submission }: SubmissionDetailProps) {
  const internalFlags = Array.isArray(submission.internalFlags)
    ? (submission.internalFlags as string[])
    : [];
  const crmTags = Array.isArray(submission.crmTags)
    ? (submission.crmTags as string[])
    : [];
  const metaEventIds = Array.isArray(submission.metaEventIds)
    ? (submission.metaEventIds as string[])
    : [];

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

      {/* Identity */}
      <Card title="Identity">
        <Row label="ID"><Mono>{submission.id}</Mono></Row>
        <Row label="Restaurant">{submission.restaurantName}</Row>
        <Row label="Full name">{submission.fullName}</Row>
        <Row label="Email">{submission.email}</Row>
        <Row label="Phone">{submission.phone ?? '—'}</Row>
        <Row label="Website">{submission.website}</Row>
      </Card>

      {/* Restaurant Profile */}
      <Card title="Restaurant Profile">
        <Row label="Concept type">{submission.conceptType}</Row>
        <Row label="Locations">{submission.locations}</Row>
        <Row label="Annual food spend">{submission.annualFoodSpend}</Row>
        <Row label="Distributor type">{submission.distributorType}</Row>
        <Row label="Procurement">{submission.procurementStrategy}</Row>
        <Row label="Top SKUs">{submission.topSkus}</Row>
      </Card>

      {/* Validation Result */}
      <Card title="Validation Result">
        <Row label="Final decision">{finalDecisionLabel(submission.finalDecision)}</Row>
        <Row label="Country eligibility">
          <span className="font-mono text-[12px]">{submission.countryEligibility ?? '—'}</span>
        </Row>
        <Row label="Location confidence">
          {submission.locationConfidenceScore !== null
            ? `${submission.locationConfidenceScore} / 100`
            : '—'}
        </Row>
        <Row label="Manual review required">
          {submission.manualReviewRequired ? 'Yes' : 'No'}
        </Row>
        {internalFlags.length > 0 && (
          <Row label="Flags">
            <span className="flex flex-wrap gap-1.5">
              {internalFlags.map((flag) => (
                <span key={flag} className="tag">{flag}</span>
              ))}
            </span>
          </Row>
        )}
      </Card>

      {/* Qualification */}
      <Card title="Qualification">
        <Row label="Qualified"><QualifiedBadge qualified={submission.qualified} /></Row>
        <Row label="DQ reason">
          <span className="text-[#94a3b8]">{submission.dqReason ?? '—'}</span>
        </Row>
        <Row label="Spend bucket">{submission.spendBucket ?? '—'}</Row>
        <Row label="Final pct">
          {submission.finalPct !== null
            ? <strong className="text-[#143225] font-semibold">{submission.finalPct}%</strong>
            : '—'}
        </Row>
        <Row label="Dollar estimate">
          {submission.dollarEstimate !== null
            ? <strong className="text-[#143225] font-semibold tabular-nums">{formatDollar(submission.dollarEstimate)}</strong>
            : '—'}
        </Row>
        <Row label="Case study">{submission.caseStudy ?? '—'}</Row>
        <Row label="Year 1–5">
          <div className="flex flex-wrap gap-1.5 mt-0.5">
            {[submission.year1, submission.year2, submission.year3, submission.year4, submission.year5]
              .map((y, i) => (
                <span
                  key={i}
                  className="inline-flex items-baseline gap-1 px-2 py-0.5 rounded-md bg-[#f0fdf4] border border-[#52C275]/30"
                >
                  <span className="text-[10px] uppercase tracking-wider text-[#52C275] font-semibold">Y{i + 1}</span>
                  <span className="text-[12px] font-semibold text-[#143225] tabular-nums">
                    {y !== null ? formatDollar(y) : '—'}
                  </span>
                </span>
              ))}
          </div>
        </Row>
      </Card>

      {/* AI Content (full width) */}
      <Card title="AI Content" className="lg:col-span-2">
        <Row label="Business summary">
          {submission.businessSummary
            ? submission.businessSummary.slice(0, 300) +
              (submission.businessSummary.length > 300 ? '…' : '')
            : '—'}
        </Row>
        <Row label="Distributor narrative">
          {submission.narrativeDistributor
            ? submission.narrativeDistributor.slice(0, 200) +
              (submission.narrativeDistributor.length > 200 ? '…' : '')
            : '—'}
        </Row>
        <Row label="Procurement narrative">
          {submission.narrativeProcurement
            ? submission.narrativeProcurement.slice(0, 200) +
              (submission.narrativeProcurement.length > 200 ? '…' : '')
            : '—'}
        </Row>
        <Row label="SKU narrative">
          {submission.narrativeSku
            ? submission.narrativeSku.slice(0, 200) +
              (submission.narrativeSku.length > 200 ? '…' : '')
            : '—'}
        </Row>
        <Row label="Logo URL">
          {submission.logoUrl ? (
            <a
              href={submission.logoUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[#52C275] underline underline-offset-2 break-all"
            >
              {submission.logoUrl}
            </a>
          ) : '—'}
        </Row>
      </Card>

      {/* PDF */}
      <Card
        title="PDF"
        action={<PdfStatusBadge status={submission.pdfStatus} />}
      >
        <Row label="PDF mode">
          <span className="font-mono text-[12px]">{submission.pdfMode ?? '—'}</span>
        </Row>
        <Row label="PDF status"><PdfStatusBadge status={submission.pdfStatus} /></Row>
        <Row label="PDF URL">
          {submission.pdfDownloadUrl ? (
            <span>
              <a
                href={submission.pdfDownloadUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-[#52C275] underline underline-offset-2 break-all text-[12px] font-mono"
              >
                {submission.pdfDownloadUrl}
              </a>
              <span className="block mt-1 text-[11px] text-[#94a3b8]">
                Link may expire — PDFMonkey URLs are time-limited.
              </span>
            </span>
          ) : '—'}
        </Row>
        <Row label="PDF error">
          {submission.pdfError ? sanitizeErrorString(submission.pdfError) : '—'}
        </Row>
        <Row label="Retry count">{submission.pdfRetryCount}</Row>
        <Row label="PDFMonkey doc ID">
          <Mono>{submission.pdfMonkeyDocumentId ?? '—'}</Mono>
        </Row>
      </Card>

      {/* GHL / CRM */}
      <Card
        title="GHL / CRM"
        action={<CrmSyncBadge status={submission.crmSyncStatus} />}
      >
        <Row label="CRM sync status"><CrmSyncBadge status={submission.crmSyncStatus} /></Row>
        <Row label="GHL contact ID">
          <Mono>{submission.ghlContactId ?? '—'}</Mono>
        </Row>
        <Row label="CRM sync error">
          {submission.crmSyncError ? sanitizeErrorString(submission.crmSyncError) : '—'}
        </Row>
        <Row label="CRM tags">
          {crmTags.length > 0 ? (
            <span className="flex flex-wrap gap-1.5">
              {crmTags.map((tag) => (
                <span key={tag} className="tag">{tag}</span>
              ))}
            </span>
          ) : '—'}
        </Row>
      </Card>

      {/* Meta Tracking (full width) */}
      <Card
        title="Meta Tracking"
        action={<MetaStatusBadge status={submission.metaStatus} />}
        className="lg:col-span-2"
      >
        <Row label="Meta status"><MetaStatusBadge status={submission.metaStatus} /></Row>
        <Row label="Event IDs">
          {metaEventIds.length > 0 ? (
            <span className="flex flex-col gap-1">
              {metaEventIds.map((id) => (
                <Mono key={id}>{id}</Mono>
              ))}
            </span>
          ) : '—'}
        </Row>
        <Row label="Meta error">
          {submission.metaError ? sanitizeErrorString(submission.metaError) : '—'}
        </Row>
      </Card>

      {/* Workflow (full width) */}
      <Card title="Workflow" className="lg:col-span-2">
        <WorkflowTimeline
          workflowStage={submission.workflowStage}
          workflowStatus={submission.workflowStatus}
          workflowErrors={submission.workflowErrors as Prisma.JsonValue}
        />
      </Card>

      {/* Manual Review (full width) */}
      <Card title="Manual Review" className="lg:col-span-2">
        <ManualReviewPanel
          submissionId={submission.id}
          currentStatus={submission.manualReviewStatus}
          currentNotes={submission.manualReviewNotes}
          reviewedAt={submission.manualReviewedAt}
        />
      </Card>

      {/* Technical Details (full width, collapsible) */}
      <details className="card-soft rounded-2xl p-5 lg:col-span-2">
        <summary className="flex items-center gap-2 select-none cursor-pointer">
          <svg width="10" height="10" viewBox="0 0 16 16" fill="none" className="text-[#64748b] transition-transform" aria-hidden="true">
            <path d="M6 4l4 4-4 4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
          <span className="text-[15px] font-semibold text-[#143225] tracking-[-0.01em]">Technical Details</span>
          <span className="text-[11.5px] text-[#94a3b8]">internal use only</span>
        </summary>
        <div className="mt-4 pt-4 border-t border-[#f1f3ee] space-y-3">
          <Row label="IP address">{submission.ipAddress ?? '—'}</Row>
          <Row label="UTM source">{submission.utmSource ?? '—'}</Row>
          <Row label="UTM medium">{submission.utmMedium ?? '—'}</Row>
          <Row label="UTM campaign">{submission.utmCampaign ?? '—'}</Row>
          <Row label="UTM content">{submission.utmContent ?? '—'}</Row>
          <Row label="UTM term">{submission.utmTerm ?? '—'}</Row>
          {internalFlags.length > 0 && (
            <Row label="Internal flags">
              <span className="flex flex-wrap gap-1.5">
                {internalFlags.map((flag) => (
                  <span key={flag} className="tag tag-muted">{flag}</span>
                ))}
              </span>
            </Row>
          )}
        </div>
      </details>

      {/* Timestamps (full width) */}
      <Card title="Timestamps" className="lg:col-span-2">
        <Row label="Created at">{formatDate(submission.createdAt)}</Row>
        <Row label="Updated at">{formatDate(submission.updatedAt)}</Row>
      </Card>

    </div>
  );
}
