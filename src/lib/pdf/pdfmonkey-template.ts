// PDFMonkey template safety patching.
// The PDF template is remote, but the app owns the invariants that prevent
// broken restaurant-logo placeholders and dead CTA links.

export interface PdfMonkeyTemplatePatchResult {
  html: string;
  changed: boolean;
}

const OLD_CALENDLY_URL = 'https://calendly.com/neil-foodserviceiq/15-minute-meeting-clone-1';

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
