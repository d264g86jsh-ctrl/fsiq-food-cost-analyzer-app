// PDFMonkey template safety patching.
// The PDF template is remote, but the app owns the invariants that prevent
// broken restaurant-logo placeholders and dead CTA links.

export interface PdfMonkeyTemplatePatchResult {
  html: string;
  changed: boolean;
}

const OLD_CALENDLY_URL = 'https://calendly.com/neil-foodserviceiq/15-minute-meeting-clone-1';
const SAFETY_STYLE_MARKER    = 'fsiq-app-logo-safety';
const COND_BOX_MARKER        = 'fsiq-conditional-box-v1';

// Conditional logo block:
//   logoProcessed = true  → white-recolored logo rendered directly on gradient (no white box)
//   logoProcessed = false → original logo rendered inside white rounded box (fallback)
const SAFE_COVER_LOGO_BLOCK = `<div class="cover-logos">
      {% if hasLogo and logoUrl != blank %}
        {% if logoProcessed %}
          <div class="cover-operator-logo cover-operator-logo--processed">
            <img src="{{ logoUrl }}" alt="{{ restaurantName }}">
          </div>
        {% else %}
          <div class="cover-operator-logo">
            <img src="{{ logoUrl }}" alt="{{ restaurantName }}">
          </div>
        {% endif %}
      {% endif %}
      <div class="fsiq-cover-logo">`;

/**
 * Patches the PDFMonkey HTML template so the restaurant-logo white box only
 * exists when there is a validated restaurant logo. The FSIQ logo remains in
 * its own existing cover-logo block.
 */
export function patchPdfMonkeyTemplateHtml(html: string): PdfMonkeyTemplatePatchResult {
  let next = html;

  // Strip any previously-injected directional disclaimer before applying other patches.
  next = removeDirectionalDisclaimer(next);
  next = injectLogoSafetyStyle(next);
  next = injectProcessedLogoStyle(next);
  next = next.replaceAll(`href="${OLD_CALENDLY_URL}"`, 'href="{{ calendlyUrl }}"');
  next = ensureCtaTargetBlank(next);

  // Two patterns to handle:
  //   A) Old unsafe template: cover-operator-logo div BEFORE any if-hasLogo guard
  //   B) Current safe template (post prior patch): cover-logos > {% if hasLogo %} > cover-operator-logo
  // Both get replaced with SAFE_COVER_LOGO_BLOCK which adds the {% if logoProcessed %} inner branch.
  // The COND_BOX_MARKER in injectProcessedLogoStyle (above) is the idempotency guard for CSS;
  // for the Liquid block, we check for 'logoProcessed' already being present.
  if (!next.includes('logoProcessed')) {
    // Pattern A: old unsafe (legacy)
    next = next.replace(
      /<div class="cover-logos">\s*<div class="cover-operator-logo">[\s\S]*?{%\s*endif\s*%}\s*<\/div>\s*<div class="fsiq-cover-logo">/m,
      SAFE_COVER_LOGO_BLOCK,
    );
    // Pattern B: safe but no logoProcessed conditional yet (template already patched by prior version)
    next = next.replace(
      /<div class="cover-logos">\s*{%\s*if hasLogo[^%]*%}\s*<div class="cover-operator-logo">[\s\S]*?{%\s*endif\s*%}\s*<div class="fsiq-cover-logo">/m,
      SAFE_COVER_LOGO_BLOCK,
    );
  }

  return {
    html: next,
    changed: next !== html,
  };
}

// Removes the directional disclaimer paragraph that was injected by commit 34120e0.
// Matches the HTML comment marker + the following <p> tag containing the disclaimer text.
// Safe to run on templates that never had the disclaimer — returns html unchanged.
function removeDirectionalDisclaimer(html: string): string {
  return html.replace(
    /<!-- fsiq-directional-disclaimer --><p[^>]*>[\s\S]*?Your estimate is directional[\s\S]*?<\/p>/,
    '',
  );
}

// Adds target="_blank" to every <a> whose href is {{ calendlyUrl }}, so that
// PDFMonkey's preview viewer can open the Calendly link in a new browser tab.
// The negative lookahead on [^>]*target= makes the replacement idempotent.
function ensureCtaTargetBlank(html: string): string {
  return html.replace(
    /href="{{ calendlyUrl }}"(?![^>]*target=)/g,
    'href="{{ calendlyUrl }}" target="_blank"',
  );
}

/**
 * Injects CSS for the processed-logo variant (logoProcessed = true).
 * The --processed modifier removes the white box background so the white logo
 * renders directly on the dark cover gradient.
 * Idempotent: skips if COND_BOX_MARKER is already present.
 */
function injectProcessedLogoStyle(html: string): string {
  if (html.includes(COND_BOX_MARKER)) return html;

  const processedStyle = `
<style id="${COND_BOX_MARKER}">
  /* White-recolored logo: remove the white box, render directly on gradient */
  .cover-operator-logo--processed {
    background: transparent !important;
    border-radius: 0 !important;
    box-shadow: none !important;
  }
  .cover-operator-logo--processed img {
    max-width: 90% !important;
    max-height: 90% !important;
  }
</style>
`;

  if (html.includes('</head>')) {
    return html.replace('</head>', `${processedStyle}</head>`);
  }
  return `${processedStyle}${html}`;
}

function injectLogoSafetyStyle(html: string): string {
  if (html.includes(SAFETY_STYLE_MARKER)) return html;

  const safetyStyle = `
{% unless hasLogo and logoUrl != blank %}
<style id="${SAFETY_STYLE_MARKER}">
  .cover-operator-logo {
    display: none !important;
    width: 0 !important;
    height: 0 !important;
    min-width: 0 !important;
    min-height: 0 !important;
    margin: 0 !important;
    padding: 0 !important;
    border: 0 !important;
    background: transparent !important;
    overflow: hidden !important;
  }
  .cover-operator-logo img {
    display: none !important;
  }
</style>
{% endunless %}
`;

  if (html.includes('</head>')) {
    return html.replace('</head>', `${safetyStyle}</head>`);
  }

  return `${safetyStyle}${html}`;
}
