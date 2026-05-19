// PDFMonkey template safety patching.
// The PDF template is remote, but the app owns the invariants that prevent
// broken restaurant-logo placeholders and dead CTA links.

export interface PdfMonkeyTemplatePatchResult {
  html: string;
  changed: boolean;
}

const OLD_CALENDLY_URL = 'https://calendly.com/neil-foodserviceiq/15-minute-meeting-clone-1';
const SAFETY_STYLE_MARKER = 'fsiq-app-logo-safety';

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

  next = next.replace(
    /<div class="cover-logos">\s*<div class="cover-operator-logo">[\s\S]*?{%\s*endif\s*%}\s*<\/div>\s*<div class="fsiq-cover-logo">/m,
    SAFE_COVER_LOGO_BLOCK,
  );

  return {
    html: next,
    changed: next !== html,
  };
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
