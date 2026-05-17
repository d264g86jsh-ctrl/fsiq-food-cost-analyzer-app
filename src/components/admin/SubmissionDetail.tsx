import type { Submission, Prisma } from '@prisma/client';
import {
  QualifiedBadge,
  PdfStatusBadge,
  CrmSyncBadge,
  MetaStatusBadge,
  ManualReviewBadge,
} from './SubmissionStatusBadge';
import { WorkflowTimeline } from './WorkflowTimeline';
import { ManualReviewPanel } from './ManualReviewPanel';
import {
  formatDate,
  formatDollar,
  finalDecisionLabel,
  sanitizeErrorString,
} from '@/lib/admin/submission-formatters';

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white border border-[#e2e8f0] rounded-xl p-5 space-y-3">
      <h2 className="text-sm font-semibold text-[#143225]">{title}</h2>
      {children}
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-2 text-sm">
      <span className="text-[#64748b] min-w-[140px] shrink-0">{label}</span>
      <span className="text-[#143225] break-all">{children}</span>
    </div>
  );
}

function Mono({ children }: { children: React.ReactNode }) {
  return <span className="font-mono text-xs bg-[#f8fafc] px-1.5 py-0.5 rounded">{children}</span>;
}

interface SubmissionDetailProps {
  submission: Submission;
}

export function SubmissionDetail({ submission }: SubmissionDetailProps) {
  // JsonValue helpers
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
    <div className="space-y-4">
      {/* Two-column grid on desktop */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Identity */}
        <Card title="Identity">
          <Row label="ID"><Mono>{submission.id}</Mono></Row>
          <Row label="Restaurant">{submission.restaurantName}</Row>
          <Row label="Full name">{submission.fullName}</Row>
          <Row label="Email">{submission.email}</Row>
          <Row label="Phone">{submission.phone ?? '—'}</Row>
          <Row label="Website">{submission.website}</Row>
          <Row label="ZIP">{submission.zipCode}</Row>
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
            {submission.countryEligibility ?? '—'}
          </Row>
          <Row label="Location confidence">
            {submission.locationConfidenceScore !== null
              ? `${submission.locationConfidenceScore}`
              : '—'}
          </Row>
          <Row label="Manual review required">
            {submission.manualReviewRequired ? 'Yes' : 'No'}
          </Row>
          {internalFlags.length > 0 && (
            <Row label="Flags">
              <span className="flex flex-wrap gap-1">
                {internalFlags.map((flag) => (
                  <span
                    key={flag}
                    className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-600"
                  >
                    {flag}
                  </span>
                ))}
              </span>
            </Row>
          )}
        </Card>

        {/* Qualification */}
        <Card title="Qualification">
          <Row label="Qualified"><QualifiedBadge qualified={submission.qualified} /></Row>
          <Row label="DQ reason">{submission.dqReason ?? '—'}</Row>
          <Row label="Spend bucket">{submission.spendBucket ?? '—'}</Row>
          <Row label="Final pct">
            {submission.finalPct !== null ? `${submission.finalPct}%` : '—'}
          </Row>
          <Row label="Dollar estimate">{formatDollar(submission.dollarEstimate)}</Row>
          <Row label="Case study">{submission.caseStudy ?? '—'}</Row>
          <Row label="Year 1–5">
            {[submission.year1, submission.year2, submission.year3, submission.year4, submission.year5]
              .map((y) => (y !== null ? formatDollar(y) : '—'))
              .join(' / ')}
          </Row>
        </Card>

        {/* AI Content */}
        <Card title="AI Content">
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
                className="text-[#52C275] underline break-all"
              >
                {submission.logoUrl}
              </a>
            ) : (
              '—'
            )}
          </Row>
        </Card>

        {/* PDF */}
        <Card title="PDF">
          <Row label="PDF mode">{submission.pdfMode ?? '—'}</Row>
          <Row label="PDF status"><PdfStatusBadge status={submission.pdfStatus} /></Row>
          <Row label="PDF URL">
            {submission.pdfDownloadUrl ? (
              <span className="space-y-0.5">
                <a
                  href={submission.pdfDownloadUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[#52C275] underline break-all"
                >
                  {submission.pdfDownloadUrl}
                </a>
                <span className="block text-xs text-[#94a3b8]">
                  Link may expire — PDFMonkey URLs are time-limited.
                </span>
              </span>
            ) : (
              '—'
            )}
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
        <Card title="GHL / CRM">
          <Row label="CRM sync status"><CrmSyncBadge status={submission.crmSyncStatus} /></Row>
          <Row label="GHL contact ID">
            <Mono>{submission.ghlContactId ?? '—'}</Mono>
          </Row>
          <Row label="CRM sync error">
            {submission.crmSyncError ? sanitizeErrorString(submission.crmSyncError) : '—'}
          </Row>
          <Row label="CRM tags">
            {crmTags.length > 0 ? (
              <span className="flex flex-wrap gap-1">
                {crmTags.map((tag) => (
                  <span
                    key={tag}
                    className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800"
                  >
                    {tag}
                  </span>
                ))}
              </span>
            ) : (
              '—'
            )}
          </Row>
        </Card>

        {/* Meta Tracking */}
        <Card title="Meta Tracking">
          <Row label="Meta status"><MetaStatusBadge status={submission.metaStatus} /></Row>
          <Row label="Event IDs">
            {metaEventIds.length > 0 ? (
              <span className="flex flex-col gap-0.5">
                {metaEventIds.map((id) => (
                  <Mono key={id}>{id}</Mono>
                ))}
              </span>
            ) : (
              '—'
            )}
          </Row>
          <Row label="Meta error">
            {submission.metaError ? sanitizeErrorString(submission.metaError) : '—'}
          </Row>
        </Card>
      </div>

      {/* Full-width sections */}
      <Card title="Workflow">
        <WorkflowTimeline
          workflowStage={submission.workflowStage}
          workflowStatus={submission.workflowStatus}
          workflowErrors={submission.workflowErrors as Prisma.JsonValue}
        />
      </Card>

      <Card title="Manual Review">
        <ManualReviewPanel
          submissionId={submission.id}
          currentStatus={submission.manualReviewStatus}
          currentNotes={submission.manualReviewNotes}
          reviewedAt={submission.manualReviewedAt}
        />
      </Card>

      {/* Technical Details (collapsed) */}
      <div className="bg-white border border-[#e2e8f0] rounded-xl p-5">
        <details>
          <summary className="text-sm font-semibold text-[#143225] cursor-pointer select-none">
            Technical Details (internal use only)
          </summary>
          <div className="mt-4 space-y-3">
            <Row label="IP address">{submission.ipAddress ?? '—'}</Row>
            <Row label="UTM source">{submission.utmSource ?? '—'}</Row>
            <Row label="UTM medium">{submission.utmMedium ?? '—'}</Row>
            <Row label="UTM campaign">{submission.utmCampaign ?? '—'}</Row>
            <Row label="UTM content">{submission.utmContent ?? '—'}</Row>
            <Row label="UTM term">{submission.utmTerm ?? '—'}</Row>
            {internalFlags.length > 0 && (
              <Row label="Internal flags">
                <span className="flex flex-wrap gap-1">
                  {internalFlags.map((flag) => (
                    <span
                      key={flag}
                      className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-600"
                    >
                      {flag}
                    </span>
                  ))}
                </span>
              </Row>
            )}
          </div>
        </details>
      </div>

      {/* Timestamps */}
      <Card title="Timestamps">
        <Row label="Created at">{formatDate(submission.createdAt)}</Row>
        <Row label="Updated at">{formatDate(submission.updatedAt)}</Row>
      </Card>
    </div>
  );
}
