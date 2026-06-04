// PDFMonkey template safety patching.
// The PDF template is remote, but the app owns the invariants that prevent
// broken restaurant-logo placeholders and dead CTA links.

export interface PdfMonkeyTemplatePatchResult {
  html: string;
  changed: boolean;
}

const OLD_CALENDLY_URL = 'https://calendly.com/neil-foodserviceiq/15-minute-meeting-clone-1';
const SAFETY_STYLE_MARKER = 'fsiq-app-logo-safety';
const DISCLAIMER_MARKER = 'fsiq-directional-disclaimer';

const SAFE_COVER_LOGO_BLOCK = `<div class="cover-logos">
      {% if hasLogo and logoUrl != blank %}
        <div class="cover-operator-logo">
          <img src="{{ logoUrl }}" alt="{{ restaurantName }}">
        </div>
      {% endif %}
      <div class="fsiq-cover-logo">`;

/**
 * Patches the PDFMonkey HTML template so the restaurant-logo white box only
 * exists when there is a validated restaurant logo. The FSIQ logo remains in
 * its own existing cover-logo block.
 */
export function patchPdfMonkeyTemplateHtml(html: string): PdfMonkeyTemplatePatchResult {
  let next = html;

  next = injectLogoSafetyStyle(next);
  next = next.replaceAll(`href="${OLD_CALENDLY_URL}"`, 'href="{{ calendlyUrl }}"');
  next = ensureCtaTargetBlank(next);
  next = injectDirectionalDisclaimer(next);

  next = next.replace(
    /<div class="cover-logos">\s*<div class="cover-operator-logo">[\s\S]*?{%\s*endif\s*%}\s*<\/div>\s*<div class="fsiq-cover-logo">/m,
    SAFE_COVER_LOGO_BLOCK,
  );

  return {
    html: next,
    changed: next !== html,
  };
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

// Injects a static directional-estimate disclaimer into the P6 footer area.
// Idempotent: the DISCLAIMER_MARKER string guards against double-injection.
// Not a payload variable — hardcoded text, does not affect the 29-variable count.
function injectDirectionalDisclaimer(html: string): string {
  if (html.includes(DISCLAIMER_MARKER)) return html;

  const disclaimerHtml = `<!-- ${DISCLAIMER_MARKER} --><p style="font-size:7.5pt;color:#64748b;line-height:1.4;text-align:left;margin-top:0.08in;margin-bottom:0;">Your estimate is directional and may vary based on distributor mix, specialty purchasing, local vendor usage, and category concentration.</p>`;

  // Locate the P6 footer / disclaimer area by the CONFIDENTIAL footer string.
  // Insert the disclaimer paragraph immediately before it so it sits in the
  // same footer region, left-aligned and styled consistently with the footer tone.
  const footerMarker = 'FoodServiceIQ — CONFIDENTIAL';
  if (html.includes(footerMarker)) {
    return html.replace(footerMarker, `${disclaimerHtml}${footerMarker}`);
  }

  // Fallback: append before </body> if the footer string isn't found.
  if (html.includes('</body>')) {
    return html.replace('</body>', `${disclaimerHtml}</body>`);
  }

  return html + disclaimerHtml;
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
