# FSIQ Food Cost Analyzer SOP v3.3

> **Status:** Editable Markdown source. Primary SOP reference for development.  
> The PDF (`docs/FSIQ_SOP_v3.3.pdf`) is the archive/internal reference only.  
> Focused project specs override this document for approved product changes:  
> `docs/savings-formula.md`, `docs/website-validation-spec.md`, `docs/analyzer-ux-flow.md`, `docs/architecture.md`

---



<!-- Page 1 -->

FSIQ Food Cost Analyzer — Complete Build SOP
v3.3
Last updated: May 2026 | Zap version: 3.3 | Status: Production-ready

Contents
1.​ What This Does
2.​ Architecture Overview
3.​ Prerequisites & Accounts
4.​ Pre-Build: Assets & PDFMonkey Template
5.​ GHL Form Fields
6.​ Build Order
7.​ Step 1 — GHL Catch Hook (Trigger)
8.​ Step 2 — Website Code (Code by Zapier)
9.​ Step 3 — Website Check (Code by Zapier)
10.​Step 4 — Qualification Logic (Code by Zapier)
11.​Step 5 — Paths (Split into 4 Branches)
12.​Steps 6, 8, 10 — DQ Emails (3 Variants)
13.​Step 13 — Website Info Crawl (Code by Zapier)
14.​Step 14 — AI Researcher (Anthropic)
15.​Step 15 — Research Analysis (Code by Zapier)
16.​Step 16 — Prompt Delay
17.​Step 17 — AI Narrative Builder (Anthropic)
18.​Step 18 — PDF Code Prep (Code by Zapier)
19.​Step 19 — PDFMonkey: Generate Document
20.​Step 20 — Delay
21.​Step 21 — Qualified Email (Microsoft Outlook)
22.​PDFMonkey Template HTML
23.​QA Checklist
24.​Known Issues & Maintenance



<!-- Page 2 -->

1. What This Does
A restaurant operator fills out a form on the FoodServiceIQ website. Within ~90 seconds they
receive a personalized, 6-page PDF report estimating how much they're overpaying on food
costs — or a warm, tailored email explaining why they weren't qualified.

Qualified flow: GHL form → Zapier → website scrape → AI analysis → AI narrative →
PDFMonkey PDF → Outlook email with PDF link + Calendly booking button.

Disqualified flow: GHL form → Zapier → qualification check fails → one of 3 tailored DQ
emails (below threshold / invalid website / national chain).

2. Architecture Overview
Step
Type
Purpose
Runs For
1
GHL Webhook
(Trigger)
Receives form
submission
All
2
Code by Zapier
Normalizes website
URL
All
3
Code by Zapier
Checks website
(Cloudflare-safe)
All
4
Code by Zapier
Qualification logic +
scoring
All
5
Paths by Zapier
Routes to 4 branches
All
6
Microsoft Outlook
DQ email — invalid
website
DQ: invalid_website
7
(path end)

8
Microsoft Outlook
DQ email — below
threshold
DQ: below_threshold
9
(path end)



<!-- Page 3 -->

Step
Type
Purpose
Runs For
10
Microsoft Outlook
DQ email — national
chain
DQ: national_chain
11
(path end)

13
Code by Zapier
Fetches website
content + logo hints
Qualified only
14
Anthropic (Claude)
Extracts logo URL +
business summary
Qualified only
15
Code by Zapier
Parses AI research
output
Qualified only
16
Delay by Zapier
1-second buffer
Qualified only
17
Anthropic (Claude)
Generates 3 narrative
blocks
Qualified only
18
Code by Zapier
Parses narratives,
strips dashes
Qualified only
19
PDFMonkey
Generates 6-page
PDF
Qualified only
20
Delay by Zapier
5-second PDF
generation buffer
Qualified only
21
Microsoft Outlook
Sends email with
PDF + Calendly
Qualified only
DQ Priority Order (Step 4)
national_chain → invalid_website (404 only) → below_threshold

Critical: Steps 6, 8, 10 use the step numbers for Zapier's path tracking; steps 7, 9,
11 are path terminators. Step 12 does not exist in this numbering. Steps 13–21 are
inside the Qualified path.



<!-- Page 4 -->

3. Prerequisites & Accounts
Service
Purpose
Notes
Zapier
Automation platform
Paid plan required (Code by
Zapier + Paths)
GoHighLevel (GHL)
Form + CRM
Form must fire a webhook on
submission
Anthropic (Claude)
AI analysis + narrative
API key required; use
claude-sonnet-4-20250514
PDFMonkey
PDF generation
API key + Template ID
required
Microsoft Outlook
Email delivery
Connected via Zapier OAuth
CDN (Cloudinary, S3, etc.)
Logo hosting
3 logo files need public URLs
(see §4)
Calendly
Booking link
URL:
https://calendly.com/n
eil-foodserviceiq/15-m
inute-meeting-clone-1

4. Pre-Build: Assets & PDFMonkey Template
Do this before building the Zap. Zapier Steps 14 and 19 need the PDFMonkey Template ID.
4a. Prepare logo assets
Upload 3 files to your CDN and copy their public URLs:

Variable name used in SOP
File
Usage
FSIQ_LOGO_DARK_URL
FoodServiceIQ wordmark,
dark/black, transparent
background
Pages 2–6 header (white
background)



<!-- Page 5 -->

Variable name used in SOP
File
Usage
FSIQ_LOGO_LIGHT_URL
FoodServiceIQ wordmark,
white/light, transparent
background
Page 1 cover (dark green
background)
FSIQ_IQ_LOGO_URL
IQ-only icon/mark (not the full
wordmark)
Cover fallback when no client
logo

Alternative: Embed as base64 data URIs directly in the template HTML. The
current template already has FSIQ_LOGO_LIGHT_URL and FSIQ_IQ_LOGO_URL
as embedded base64. Only FSIQ_LOGO_DARK_URL (pages 2–6 header) requires a
CDN URL or base64 replacement.
4b. Build the PDFMonkey template
1.​ Log into pdfmonkey.io
2.​ Templates → + New Template
3.​ Name: FSIQ COST ANALYZER
4.​ Engine: HTML/CSS
5.​ Paste Sample Data JSON (§22a) into the Sample Data pane
6.​ Paste Full Template HTML (§22b) into the HTML pane
7.​ Find/replace all 3 placeholder strings with actual URLs:
-​
FSIQ_LOGO_DARK_URL → your CDN URL or base64 data URI
-​
FSIQ_LOGO_LIGHT_URL → your CDN URL or base64 data URI
-​
FSIQ_IQ_LOGO_URL → your CDN URL or base64 data URI
8.​ Click Save → confirm live preview renders 6 pages
9.​ Copy the Template ID from the URL bar — you'll need it in Step 19

5. GHL Form Fields
The GHL form must capture these fields and pass them via webhook. The Field Name is
exactly what Zapier receives.

Field Name
Type
Required
Example Value
full_name
Text
Yes
Roberto Sanchez
restaurant_name
Text
Yes
Casa Roberto



<!-- Page 6 -->

Field Name
Type
Required
Example Value
email
Email
Yes
roberto@casaroberto
```
.com
```

phone
Phone
No
512-555-0100
website
URL
Yes
https://casaroberto.co
m
annual_food_spen
d
Text/Dropdown
Yes
$1M - $3M
concept_type
Dropdown
Yes
Fast casual
locations
Dropdown
Yes
2 – 4 locations
distributor_type Dropdown
Yes
National broadliners
(Sysco, US Foods)
procurement_stra
tegy
Dropdown
Yes
Market price, single
distributor
top_skus
Text
Yes
Chicken, eggs,
produce

Dropdown values must match exactly (case-sensitive) what the qualification logic and Claude
prompts expect. Accepted values:

-​
concept_type: Quick service / Fast casual / Casual dining / Family
dining / Full-service independent / Fine dining
-​
locations: Single location / 2 – 4 locations / 5+ locations
-​
distributor_type: National broadliners (Sysco, US Foods) / Regional
distributor / Local/specialty only / Combination
-​
procurement_strategy: Market price, single distributor / Market price,
multiple distributors / GPO or Group Purchasing Organization /
Negotiated cost-plus agreement

6. Build Order
Build in this exact sequence to avoid mapping errors:



<!-- Page 7 -->

1.​ PDFMonkey template (§4b) → get Template ID
2.​ Zap: Steps 1–5 (trigger + qualification)
3.​ Zap: DQ path emails (Steps 6, 8, 10)
4.​ Zap: Qualified path Steps 13–18 (website crawl → AI → narrative → parser)
5.​ Zap: Step 19 (PDFMonkey) — needs parser outputs from Step 18
6.​ Zap: Steps 20–21 (delay + email) — needs PDFMonkey download_url
7.​ QA both paths end-to-end (§23)

7. Step 1 — GHL Catch Hook (Trigger)
Action App: Webhooks by Zapier​
Action Event: Catch Hook

Setup:

1.​ Add the trigger, choose "Webhooks by Zapier" → "Catch Hook"
2.​ Copy the webhook URL Zapier generates
3.​ In GHL: Workflow → Add action → "Send Webhook" → POST → paste Zapier URL
4.​ Configure GHL to send all form fields as JSON body
5.​ Run a test form submission to confirm all fields appear in Zapier's output

Expected output: All form fields are available as 1. Full Name, 1. Restaurant Name,
etc.

8. Step 2 — Website Code (Code by Zapier)
Purpose: Extracts and normalizes the website URL from the form submission so it's usable in
Step 3.

Action App: Code by Zapier​
Action Event: Run JavaScript

Input Data:

Key
Value
website
```
{{Step 1 → website}}

```



<!-- Page 8 -->

JavaScript Code:

```
// Step 2: Website Code — normalize website URL from form submission

const raw = (inputData.website || "").trim();

let websiteUrl = raw;

// Add https:// if missing

if (websiteUrl && !websiteUrl.startsWith("http://") && !websiteUrl.startsWith("https://")) {

  websiteUrl = "https://" + websiteUrl;

}

// Remove trailing slash for consistency

```

websiteUrl = websiteUrl.replace(/\/$/, "");

output = [{ websiteUrl }];

Expected output: websiteUrl — the normalized URL (e.g. https://spiritscenla.com)

9. Step 3 — Website Check (Code by Zapier)
Purpose: Fetches the operator's website to (a) get an HTTP status for qualification and (b)
extract logo hints for the AI pipeline. Uses a browser User-Agent to get past Cloudflare. Never
errors — always returns, regardless of what the server does.

Why Code by Zapier instead of Webhooks? Zapier's Webhooks step doesn't
have "Continue on Error" and can't handle browser UA headers properly.
Cloudflare-protected sites (most restaurants) block Zapier's default UA. This Code
step catches all errors internally.

Action App: Code by Zapier​
Action Event: Run JavaScript

Input Data:



<!-- Page 9 -->

Key
Value
websiteUrl
```
{{Step 2 → websiteUrl}}

```

JavaScript Code:

```
// Step 3: Website Check v2.0

// Fetches URL with browser UA, extracts logo hints from raw HTML BEFORE stripping,

// strips HTML to clean text. Always returns — never throws.

const url = inputData.websiteUrl || "";

let websiteStatus = 0;

let websiteText = "";

let websiteLogoHints = "";

let fetchSuccess = false;

if (!url) {

  output = [{ websiteStatus, websiteText, websiteLogoHints, fetchSuccess }];

  return;

}

```

try {

```
  const response = await fetch(url, {

    method: "GET",

    headers: {

      "User-Agent":

        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like
```

Gecko) Chrome/120.0.0.0 Safari/537.36",



<!-- Page 10 -->

```
      Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",

      "Accept-Language": "en-US,en;q=0.5",

      Connection: "keep-alive",

      "Upgrade-Insecure-Requests": "1",

    },

    redirect: "follow",

    signal: AbortSignal.timeout(10000),

  });

  websiteStatus = response.status;

  const rawHtml = await response.text();

  // ── Extract logo hints from raw HTML BEFORE stripping ──

  const logoSources = [];

  // 1. og:image (highest priority — usually the best brand image)

  const ogMatch = rawHtml.match(

    /<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i

  ) || rawHtml.match(

    /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i

  );

  if (ogMatch && ogMatch[1]) logoSources.push("og-image:" + ogMatch[1]);

  // 2. twitter:image

  const twMatch = rawHtml.match(

```



<!-- Page 11 -->

```
    /<meta[^>]+name=["']twitter:image["'][^>]+content=["']([^"']+)["']/i

  ) || rawHtml.match(

    /<meta[^>]+content=["']([^"']+)["'][^>]+name=["']twitter:image["']/i

  );

  if (twMatch && twMatch[1]) logoSources.push("twitter-image:" + twMatch[1]);

  // 3. Schema.org logo

  const schemaMatch =
```

rawHtml.match(/"logo"\s*:\s*\{\s*"@type"\s*:\s*"ImageObject"\s*,\s*"url"\s*:\s*"([^"]+)"/i) ||

```
    rawHtml.match(/"logo"\s*:\s*"([^"]+)"/i);

  if (schemaMatch && schemaMatch[1]) logoSources.push("schema-org-logo:" +
```

schemaMatch[1]);

```
  // 4. Header/nav <img> with "logo" in src, class, id, or alt

  const headerLogoMatch = rawHtml.match(

```

/<header[^>]*>[\s\S]{0,2000}<img[^>]+(?:src|class|id|alt)=["'][^"']*logo[^"']*["'][^>]*src=["']([^"']+)["']/
i

```
  ) || rawHtml.match(

    /<(?:header|nav)[^>]*>[\s\S]{0,2000}<img[^>]+src=["']([^"']*logo[^"']*)["']/i

  );

  if (headerLogoMatch && headerLogoMatch[1]) logoSources.push("header-logo-img:" +
```

headerLogoMatch[1]);

```
  // 5. apple-touch-icon (low priority — usually a decent brand mark)

  const appleMatch = rawHtml.match(

    /<link[^>]+rel=["']apple-touch-icon["'][^>]+href=["']([^"']+)["']/i

```



<!-- Page 12 -->

```
  ) || rawHtml.match(

    /<link[^>]+href=["']([^"']+)["'][^>]+rel=["']apple-touch-icon["']/i

  );

  if (appleMatch && appleMatch[1]) logoSources.push("apple-touch-icon:" + appleMatch[1]);

  websiteLogoHints = logoSources.join(" | ");

  // ── Strip HTML to clean text ──

  let text = rawHtml

    .replace(/<script[\s\S]*?<\/script>/gi, " ")

    .replace(/<style[\s\S]*?<\/style>/gi, " ")

    .replace(/<!--[\s\S]*?-->/g, " ")

    .replace(/<[^>]+>/g, " ")

    .replace(/&nbsp;/gi, " ")

    .replace(/&amp;/gi, "&")

    .replace(/&lt;/gi, "<")

    .replace(/&gt;/gi, ">")

    .replace(/&quot;/gi, '"')

    .replace(/&#39;/gi, "'")

    .replace(/\s{2,}/g, " ")

    .trim();

  websiteText = text.substring(0, 4000);

  fetchSuccess = websiteStatus >= 200 && websiteStatus < 400;

} catch (err) {

```



<!-- Page 13 -->

```
  websiteStatus = 0;

  fetchSuccess = false;

}

```

output = [{ websiteStatus, websiteText, websiteLogoHints, fetchSuccess }];

Expected output:

Field
Description
websiteStatus
HTTP status code (200, 403, 404, 503, 0 =
error/timeout)
websiteText
Stripped plain text (up to 4,000 chars)
websiteLogoHints
Pipe-separated logo source hints (e.g.
og-image:https://...)
fetchSuccess
true if 2xx/3xx response

10. Step 4 — Qualification Logic (Code by Zapier)
Purpose: Full qualification and scoring engine. Determines whether the lead qualifies, assigns
a DQ reason if not, calculates the percentage estimate, dollar figures, 5-year projections, case
study assignment, and all display fields for the PDF.

Action App: Code by Zapier​
Action Event: Run JavaScript

Input Data:

Key
Value
fullName
```
{{Step 1 → full_name}}
```

restaurantName
```
{{Step 1 → restaurant_name}}
```

email
```
{{Step 1 → email}}

```



<!-- Page 14 -->

Key
Value
phone
```
{{Step 1 → phone}}
```

website
```
{{Step 1 → website}}
```

annualSpendText
```
{{Step 1 → annual_food_spend}}
```

conceptType
```
{{Step 1 → concept_type}}
```

locations
```
{{Step 1 → locations}}
```

distributorType
```
{{Step 1 → distributor_type}}
```

procurementStrategy
```
{{Step 1 → procurement_strategy}}
```

topSkus
```
{{Step 1 → top_skus}}
```

websiteStatus
```
{{Step 3 → websiteStatus}}

```

JavaScript Code:

```
// Step 4: FSIQ Food Cost Analyzer — Qualification Logic v3.3

// DQ priority: national_chain → invalid_website (404 only) → below_threshold

// Only HTTP 404 counts as invalid website. 403/503/0/timeout = real site, bot-blocked = VALID.

// ===== HELPERS =====

function titleCaseName(s) {

  if (!s) return "";

  return s.toLowerCase().split(/(\s+|-)/).map(part => {

    if (/^\s+$/.test(part) || part === "-") return part;

    if (part.includes("'")) {

      return part.split("'").map(seg =>

        seg.length > 0 ? seg.charAt(0).toUpperCase() + seg.slice(1) : seg

```



<!-- Page 15 -->

```
      ).join("'");

    }

    if (part.length > 2 && (part.startsWith("mc") || part.startsWith("mac"))) {

      const prefixLen = part.startsWith("mac") ? 3 : 2;

      const prefix = part.slice(0, prefixLen);

      const rest = part.slice(prefixLen);

      return prefix.charAt(0).toUpperCase() + prefix.slice(1) +

             (rest.length > 0 ? rest.charAt(0).toUpperCase() + rest.slice(1) : "");

    }

    return part.charAt(0).toUpperCase() + part.slice(1);

  }).join("");

}

function fmtDollar(n) {

  if (!n && n !== 0) return "";

  return "$" + Math.round(n).toLocaleString("en-US");

}

function fmtPct(n) {

  return (Math.round(n * 10) / 10).toFixed(1) + "%";

}

// ===== READ INPUTS =====

const fullNameRaw       = (inputData.fullName            || "").trim();

const restaurantNameRaw = (inputData.restaurantName      || "").trim();

```



<!-- Page 16 -->

```
const fullName          = titleCaseName(fullNameRaw);

const restaurantName    = titleCaseName(restaurantNameRaw);

const distributorTypeRaw  = (inputData.distributorType       || "").trim();

const procurementRaw      = (inputData.procurementStrategy   || "").trim();

const conceptTypeRaw      = (inputData.conceptType           || "").trim();

const topSkusRaw          = (inputData.topSkus               || "").trim();

const annualSpendText     = (inputData.annualSpendText        || "").trim();

const locationsRaw        = (inputData.locations             || "").trim();

const email               = (inputData.email                 || "").trim();

const phone               = (inputData.phone                 || "").trim();

const websiteUrl          = (inputData.website               || "").trim();

// websiteStatus: 0 = error/timeout, 404 = not found, 403/503 = Cloudflare-blocked (real site)

const websiteStatus = parseInt(inputData.websiteStatus || "0", 10);

// ===== NATIONAL CHAINS =====

const NATIONAL_CHAINS = [

  // QSR

  "mcdonalds","mcdonald's","burger king","wendys","wendy's","taco bell","kfc",

  "kentucky fried chicken","subway","chick-fil-a","chick fil a","chipotle",

  "dominos","domino's","pizza hut","papa johns","papa john's","little caesars",

  "dunkin","dunkin donuts","dunkin'","starbucks","sonic drive-in","sonic",

  "jack in the box","carls jr","carl's jr","hardees","hardee's","whataburger",

```



<!-- Page 17 -->

```
  "five guys","in-n-out","in n out","shake shack","popeyes","arbys","arby's",

  "dairy queen","long john silvers","long john silver's","jersey mikes",

  "jersey mike's","jimmy johns","jimmy john's","firehouse subs","quiznos",

  "auntie annes","auntie anne's","cinnabon","tim hortons","panera","panera bread",

  "qdoba","moes southwest grill","moe's southwest grill","sweetgreen","cava",

  "noodles and company","noodles & company","wingstop","raising canes",

  "raising cane's","el pollo loco","checkers","rallys","rally's","krystal",

  "white castle","tropical smoothie cafe","smashburger","freddys",

  "freddy's frozen custard","culvers","culver's","del taco","baja fresh",

  "boston market","papa murphys","papa murphy's","round table pizza",

  "marcos pizza","marco's pizza","blaze pizza","mod pizza","pieology",

  "mountain mikes pizza","mountain mike's pizza",

  // Casual / Family

  "applebees","applebee's","chilis","chili's","tgi fridays","tgi friday's",

  "outback steakhouse","outback","olive garden","red lobster",

  "longhorn steakhouse","longhorn","texas roadhouse","logans roadhouse",

  "logan's roadhouse","buffalo wild wings","ihop","dennys","denny's",

  "cracker barrel","bob evans","the cheesecake factory","cheesecake factory",

  "p.f. changs","pf changs","p.f. chang's","carrabbas","carrabba's",

  "bonefish grill","bjs restaurant","bj's restaurant","bj's brewhouse",

  "red robin","ruby tuesday","cheddars","cheddar's scratch kitchen","perkins",

  "mimis cafe","mimi's cafe","village inn","shoneys","shoney's","first watch",

```



<!-- Page 18 -->

```
  "snooze","another broken egg","yard house","lazy dog","millers ale house",

  "miller's ale house","twin peaks","hooters","fogo de chao","ruths chris",

  "ruth's chris","mortons","fleming's","capital grille","the capital grille",

  // Coffee / Bakery

  "peets coffee","peet's coffee","the coffee bean","caribou coffee",

  "einstein bagels","einstein bros bagels","krispy kreme","mrs fields",

  "mrs. fields","baskin robbins","baskin-robbins","cold stone creamery",

  "cold stone","ben & jerrys","ben and jerry's","haagen dazs","häagen-dazs",

  "menchies","menchie's"

```

];

```
function normalizeForChainMatch(name) {

  return name.toLowerCase()

    .replace(/[^a-z0-9\s'&-]/g, "")

    .replace(/\s+/g, " ")

    .trim();

}

const normalizedRestaurantName = normalizeForChainMatch(restaurantNameRaw);

const isNationalChain = NATIONAL_CHAINS.some(chain => {

  return normalizedRestaurantName === chain ||

         normalizedRestaurantName.startsWith(chain + " ") ||

         normalizedRestaurantName.endsWith(" " + chain);

```



<!-- Page 19 -->

```
});

// ===== SPEND PARSER =====

function parseSpend(text) {

  if (!text) return { value: null, fallback: false };

  let s = String(text).toLowerCase().trim();

  s = s.replace(/[\$,\u00a3\u20ac]/g, "").replace(/\bUSD\b/gi, "").replace(/usd/gi, "").trim();

  const rangeRegex = /(.+?)\s*(?:-|to|and|through|\u2013)\s*(.+)/;

  if (rangeRegex.test(s) && !s.match(/^[\d.]+$/)) {

    const parts = s.match(rangeRegex);

    if (parts && parts[1] && parts[2]) {

      const v1 = parseSingleValue(parts[1].trim());

      const v2 = parseSingleValue(parts[2].trim());

      if (v1 && v2) return { value: (v1 + v2) / 2, fallback: false };

    }

  }

  const val = parseSingleValue(s);

  if (val !== null) return { value: val, fallback: false };

  return { value: 2000000, fallback: true };

}

function parseSingleValue(s) {

  s = String(s).toLowerCase().trim();

  const wordValues = {

```



<!-- Page 20 -->

```
    "half": 0.5, "a": 1, "an": 1,

    "one": 1, "two": 2, "three": 3, "four": 4, "five": 5,

    "six": 6, "seven": 7, "eight": 8, "nine": 9, "ten": 10

  };

  let multiplier = 1;

  if (s.match(/\b(million|millon|milion|mllion|mm|m)\b/i)) {

    multiplier = 1000000;

    s = s.replace(/\b(million|millon|milion|mllion|mm|m)\b/gi, "").trim();

  } else if (s.match(/\b(thousand|thosand|k)\b/i)) {

    multiplier = 1000;

    s = s.replace(/\b(thousand|thosand|k)\b/gi, "").trim();

  } else if (s.match(/\b(billion|b)\b/i)) {

    multiplier = 1000000000;

    s = s.replace(/\b(billion|b)\b/gi, "").trim();

  }

  const numMatch = s.match(/[\d.]+/);

  let num = null;

  if (numMatch) {

    num = parseFloat(numMatch[0]);

  } else {

    for (const word in wordValues) {

```



<!-- Page 21 -->

```
      if (s.includes(word)) { num = wordValues[word]; break; }

    }

  }

  if (num === null || isNaN(num)) return null;

  if (multiplier === 1) {

    if (num >= 1 && num <= 99)          multiplier = 1000000;

    else if (num >= 100 && num <= 9999) multiplier = 1000;

  }

  return num * multiplier;

}

const spendResult   = parseSpend(annualSpendText);

const annualSpend   = spendResult.value;

const parseFallback = spendResult.fallback;

// ===== QUALIFICATION =====

let qualified       = true;

let dqReason        = null;

let implausiblyHigh = false;

if (isNationalChain) {

  qualified = false;

  dqReason  = "national_chain";

} else if (websiteStatus === 404) {

  // Only hard 404 = invalid website. 403, 503, 0, timeout = real site (bot-blocked) = VALID.

```



<!-- Page 22 -->

```
  qualified = false;

  dqReason  = "invalid_website";

} else if (annualSpend === null || annualSpend < 50000) {

  qualified = false;

  dqReason  = "below_minimum";

} else if (annualSpend < 500000) {

  qualified = false;

  dqReason  = "below_threshold";

} else if (annualSpend >= 100000000) {

  implausiblyHigh = true;

}

// ===== SPEND BUCKET =====

let spendBucket, bucketMidpoint, basePct;

if      (annualSpend >= 500000  && annualSpend < 800000)  { spendBucket =
```

"$500K\u2013$800K"; bucketMidpoint = 650000;  basePct = 5.00; }

```
else if (annualSpend >= 800000  && annualSpend < 1000000) { spendBucket =
```

"$800K\u2013$1M";   bucketMidpoint = 900000;  basePct = 5.25; }

```
else if (annualSpend >= 1000000 && annualSpend < 3000000) { spendBucket =
```

"$1M\u2013$3M";     bucketMidpoint = 2000000; basePct = 5.50; }

```
else if (annualSpend >= 3000000 && annualSpend < 7000000) { spendBucket =
```

"$3M\u2013$7M";     bucketMidpoint = 5000000; basePct = 5.75; }

```
else if (annualSpend >= 7000000)                          { spendBucket = "$7M+";
```

bucketMidpoint = 8500000; basePct = 6.00; }



<!-- Page 23 -->

```
else                                                      { spendBucket = "DQ";                bucketMidpoint = 0;
```

basePct = 0;    }

```
// ===== MODIFIERS =====

let distributorMod = 0;

if      (distributorTypeRaw.includes("National broadliners")) distributorMod = 0.70;

else if (distributorTypeRaw.includes("Combination"))          distributorMod = 0.35;

else if (distributorTypeRaw.includes("Regional"))             distributorMod = 0.35;

let procurementMod = 0;

if      (procurementRaw.includes("market price") && procurementRaw.includes("single"))
```

procurementMod = 0.70;

```
else if (procurementRaw.includes("market price") && procurementRaw.includes("multiple"))
```

procurementMod = 0.35;

```
else if (procurementRaw.includes("GPO") || procurementRaw.includes("Group Purchasing"))
```

procurementMod = 0.20;

```
const proteinKeywords   =
```

["chicken","beef","pork","fish","seafood","brisket","ribs","steak","lamb","salmon","shrimp","turkey"
,"bacon","sausage"];

```
const commodityKeywords =
```

["oil","dairy","eggs","cheese","milk","butter","produce","lettuce","tomato","onion","flour","sugar","p
otato","fries"];

```
const skusLower   = topSkusRaw.toLowerCase();

const hasProtein  = proteinKeywords.some(k => skusLower.includes(k));

const hasCommodity = commodityKeywords.some(k => skusLower.includes(k));

let skuMod = 0;

if      (hasProtein && hasCommodity) skuMod = 0.30;

else if (hasProtein || hasCommodity) skuMod = 0.15;

```



<!-- Page 24 -->

```
let locationsMod = 0;

if      (locationsRaw.includes("5+"))                                     locationsMod = 0.30;

else if (locationsRaw.includes("2") || locationsRaw.includes("4"))        locationsMod = 0.15;

// ===== FINAL PERCENTAGE =====

const rawTotal     = basePct + distributorMod + procurementMod + skuMod + locationsMod;

const finalPct     = Math.max(5.0, Math.min(8.0, rawTotal));

const dollarEstimate = qualified ? Math.round(finalPct / 100 * bucketMidpoint) : 0;

// ===== 5-YEAR PROJECTIONS =====

const INFLATION = 0.039;

const year1 = dollarEstimate;

const year2 = Math.round(year1 + year1 * (1 + INFLATION));

const year3 = Math.round(year2 + year1 * Math.pow(1 + INFLATION, 2));

const year4 = Math.round(year3 + year1 * Math.pow(1 + INFLATION, 3));

const year5 = Math.round(year4 + year1 * Math.pow(1 + INFLATION, 4));

const yearMax        = year5 || 1;

const year1HeightPct = Math.max(8, Math.round((year1 / yearMax) * 100));

const year2HeightPct = Math.max(8, Math.round((year2 / yearMax) * 100));

const year3HeightPct = Math.max(8, Math.round((year3 / yearMax) * 100));

const year4HeightPct = Math.max(8, Math.round((year4 / yearMax) * 100));

const year5HeightPct = 100;

// ===== BENCHMARKS =====

```



<!-- Page 25 -->

```
const benchmarks = {

  "Quick service":            "20%\u201325%",

  "Fast casual":              "25%\u201330%",

  "Casual dining":            "28%\u201332%",

  "Family dining":            "28%\u201332%",

  "Full-service independent": "28%\u201335%",

  "Fine dining":              "30%\u201335%"

};

const conceptBenchmark = benchmarks[conceptTypeRaw] || "28%\u201332%";

// ===== CASE STUDY =====

function selectCaseStudy(bucket, locations) {

  const single = !locations.includes("2") && !locations.includes("5");

  const small  = locations.includes("2") || locations.includes("4");

  const multi  = locations.includes("5");

  if (bucket === "$500K\u2013$800K" || bucket === "$800K\u2013$1M") {

    return single ? "Black's BBQ" : "MaryAnn's Diner";

  }

  if (bucket === "$1M\u2013$3M") {

    return single ? "Spirits" : "MaryAnn's Diner";

  }

  if (bucket === "$3M\u2013$7M" || bucket === "$7M+") {

    if (single) return "The Oasis";

```



<!-- Page 26 -->

```
    if (small)  return "Dish Society";

    if (multi)  return "Thunderdome";

  }

  return "Black's BBQ";

}

const caseStudy = qualified ? selectCaseStudy(spendBucket, locationsRaw) : "";

// ===== OUTPUT =====

```

output = {

```
  // Qualification

  qualified,

  dqReason,

  parseFallback,

  implausiblyHigh,

  isNationalChain,

  websiteStatus,

  // Form passthrough (title-cased)

  fullName,

  restaurantName,

  distributorTypeRaw,

  procurementStrategyRaw: procurementRaw,

  conceptTypeRaw,

```



<!-- Page 27 -->

```
  topSkusRaw,

  locationsRaw,

  email,

  phone,

  websiteUrl,

  // Calculated

  spendBucket,

  annualSpend,

  annualSpendDisplay:    qualified ? fmtDollar(annualSpend) : "",

  bucketMidpoint,

  finalPct,

  finalPctDisplay:       fmtPct(finalPct),

  dollarEstimate,

  dollarEstimateDisplay: fmtDollar(dollarEstimate),

  conceptBenchmark,

  caseStudy,

  // SKU flags for Claude prompts

  hasProtein,

  hasCommodity,

  // 5-year projections

  year1Display:    fmtDollar(year1),

  year2Display:    fmtDollar(year2),

```



<!-- Page 28 -->

```
  year3Display:    fmtDollar(year3),

  year4Display:    fmtDollar(year4),

  year5Display:    fmtDollar(year5),

  year1HeightPct,

  year2HeightPct,

  year3HeightPct,

  year4HeightPct,

  year5HeightPct

};

```

11. Step 5 — Paths (Split into 4 Branches)
Action App: Paths by Zapier

Add 4 paths. The conditions reference Step 4 outputs.

Path
Condition
Qualified ($500k+)
Step 4 → qualified (Text) Exactly
matches true
Unqualified — Invalid Website
Step 4 → qualified (Text) Exactly
matches false AND Step 4 →
dqReason (Text) Exactly matches
invalid_website
Unqualified — Below Threshold
Step 4 → qualified (Text) Exactly
matches false AND Step 4 →
dqReason (Text) Does not exactly
match invalid_website AND Step 4 →
dqReason (Text) Does not exactly
match national_chain



<!-- Page 29 -->

Path
Condition
Unqualified — National Chain
Step 4 → qualified (Text) Exactly
matches false AND Step 4 →
dqReason (Text) Exactly matches
national_chain

Do NOT use the old websiteInvalid field — it no longer exists. All path
conditions use qualified + dqReason only.

12. Steps 6, 8, 10 — DQ Emails (3 Variants)
Each DQ path ends with a Microsoft Outlook "Send Email" step. Three separate steps, one per
path.
Step 6 — Invalid Website DQ Email
Path: Unqualified — Invalid Website​
Subject: Quick check on your FoodServiceIQ submission​
To: {{Step 4 → email}}​
Body (HTML):

<!DOCTYPE html>

<html>

<head><meta charset="UTF-8"></head>

<body style="font-family: Aptos, Arial, sans-serif; font-size: 11pt; line-height: 1.6; color: #000000;
max-width: 600px;">

<p>Hi {{Step 4 → fullName}},</p>

<p>Thanks for using <a href="https://www.foodserviceiq.com/" style="color: #52C275;
font-weight: bold; text-decoration: none;">FoodServiceIQ</a>'s Food Cost Analyzer. We
received your submission for <strong>{{Step 4 → restaurantName}}</strong>, but we weren't
able to reach the website you entered.</p>

<p>Our analysis pulls business context from your website to make the report more accurate, so
we'd love to give it another shot. Could you double-check the URL and resubmit at <a
href="https://www.foodserviceiq.com/" style="color: #52C275;">foodserviceiq.com</a>?</p>



<!-- Page 30 -->

<p>If you'd rather just talk it through, you can also book a quick call directly:</p>

<p style="margin: 20px 0;">

```
  <a href="https://calendly.com/neil-foodserviceiq/15-minute-meeting-clone-1" style="display:
```

inline-block; background-color: #143225; color: #ffffff; padding: 14px 28px; text-decoration:
none; font-weight: bold; font-size: 12pt; border-radius: 4px;">

```
    Book a 15-Minute Call

  </a>

```

</p>

<p>Thanks,<br>

The FoodServiceIQ Team</p>

</body>

</html>

Step 8 — Below Threshold DQ Email
Path: Unqualified — Below Threshold​
Subject: Thanks for using FoodServiceIQ's Food Cost Analyzer​
To: {{Step 4 → email}}​
Body (HTML):

<!DOCTYPE html>

<html>

<head><meta charset="UTF-8"></head>

<body style="font-family: Aptos, Arial, sans-serif; font-size: 11pt; line-height: 1.6; color: #000000;
max-width: 600px;">

<p>Hi {{Step 4 → fullName}},</p>



<!-- Page 31 -->

<p>Thanks for using <a href="https://www.foodserviceiq.com/" style="color: #52C275;
font-weight: bold; text-decoration: none;">FoodServiceIQ</a>'s Food Cost Analyzer and sharing
a bit about <strong>{{Step 4 → restaurantName}}</strong>.</p>

<p>Based on what you shared, your operation may not yet be a fit for our cost reduction
program. It's purpose-built for restaurants spending <strong>$500K or more</strong> annually
on food, where the savings recoverable through our model are large enough to justify the
engagement on both sides.</p>

<p>That said, we'd love to stay in touch:</p>

<ul style="margin-left: 20px;">

```
  <li>If your operation grows into that range, we'd be glad to run a full analysis at that point.</li>

  <li>In the meantime, our free playbook covers procurement strategies that work at any scale:
```

<a href="https://www.foodserviceiq.com/" style="color: #52C275;">foodserviceiq.com</a></li>

</ul>

<p>Wishing you continued success,<br>

The FoodServiceIQ Team</p>

</body>

</html>

Step 10 — National Chain DQ Email
Path: Unqualified — National Chain​
Subject: About your FoodServiceIQ submission​
To: {{Step 4 → email}}​
Body (HTML):

<!DOCTYPE html>

<html>

<head><meta charset="UTF-8"></head>



<!-- Page 32 -->

<body style="font-family: Aptos, Arial, sans-serif; font-size: 11pt; line-height: 1.6; color: #000000;
max-width: 600px;">

<p>Hi {{Step 4 → fullName}},</p>

<p>Thanks for trying <a href="https://www.foodserviceiq.com/" style="color: #52C275;
font-weight: bold; text-decoration: none;">FoodServiceIQ</a>'s Food Cost Analyzer.</p>

<p>Our program is built specifically for <strong>independent and multi-unit independent
restaurant groups</strong>. The pricing structures and procurement strategies we negotiate are
designed to give independents access to the same kind of leverage national chains already
operate under, so we don't typically work with national chains directly.</p>

<p>If you operate an independent concept under a different brand and would like to explore an
analysis for that operation, we'd love to hear from you at <a
href="mailto:hello@foodserviceiq.com" style="color:
#52C275;">hello@foodserviceiq.com</a>.</p>

<p>Best,<br>

The FoodServiceIQ Team</p>

</body>

</html>

13. Step 13 — Website Info Crawl (Code by Zapier)
Purpose: Full website fetch for the qualified path. Extracts logo hints from raw HTML BEFORE
stripping (this is the critical fix — without it Claude can't find logo URLs). Returns clean text and
logo hints for the AI pipeline.

Why a second fetch? Step 3 runs early (before qualification) and its result may be
cached or incomplete. Step 13 ensures the qualified path always gets a fresh,
complete fetch optimized for logo extraction and AI analysis.

Action App: Code by Zapier​
Action Event: Run JavaScript

Input Data:



<!-- Page 33 -->

Key
Value
websiteUrl
```
{{Step 4 → websiteUrl}}

```

JavaScript Code:

```
// Step 13: Website Info Crawl

// Full fetch with logo hint extraction BEFORE HTML stripping.

// Always returns — never throws.

const url = inputData.websiteUrl || "";

let websiteText = "";

let websiteLogoHints = "";

let fetchStatus = 0;

if (!url) {

  output = [{ websiteText, websiteLogoHints, fetchStatus }];

  return;

}

```

try {

```
  const response = await fetch(url, {

    method: "GET",

    headers: {

      "User-Agent":

        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like
```

Gecko) Chrome/120.0.0.0 Safari/537.36",

```
      Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",

```



<!-- Page 34 -->

```
      "Accept-Language": "en-US,en;q=0.5",

      Connection: "keep-alive",

    },

    redirect: "follow",

    signal: AbortSignal.timeout(12000),

  });

  fetchStatus = response.status;

  const rawHtml = await response.text();

  // ── EXTRACT LOGO HINTS FROM RAW HTML BEFORE ANY STRIPPING ──

  const logoSources = [];

  // 1. og:image — highest priority

  const ogMatch = rawHtml.match(

    /<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i

  ) || rawHtml.match(

    /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i

  );

  if (ogMatch && ogMatch[1]) logoSources.push("og-image:" + ogMatch[1]);

  // 2. twitter:image

  const twMatch = rawHtml.match(

    /<meta[^>]+name=["']twitter:image["'][^>]+content=["']([^"']+)["']/i

  ) || rawHtml.match(

```



<!-- Page 35 -->

```
    /<meta[^>]+content=["']([^"']+)["'][^>]+name=["']twitter:image["']/i

  );

  if (twMatch && twMatch[1]) logoSources.push("twitter-image:" + twMatch[1]);

  // 3. Schema.org logo

  const schemaMatch = rawHtml.match(

    /"logo"\s*:\s*\{\s*"@type"\s*:\s*"ImageObject"\s*,\s*"url"\s*:\s*"([^"]+)"/i

  ) || rawHtml.match(/"logo"\s*:\s*"([^"]+)"/i);

  if (schemaMatch && schemaMatch[1]) logoSources.push("schema-org-logo:" +
```

schemaMatch[1]);

```
  // 4. Header/nav img with "logo" in src, class, id, or alt

  const headerLogoMatch = rawHtml.match(

    /<(?:header|nav)[^>]*>[\s\S]{0,2000}<img[^>]+src=["']([^"']*logo[^"']*)["']/i

  ) || rawHtml.match(

    /<(?:header|nav)[^>]*>[\s\S]{0,2000}<img[^>]+(?:class|id|alt)=["'][^"']*logo[^"']*["'][^>]*>/i

  );

  if (headerLogoMatch && headerLogoMatch[1]) logoSources.push("header-logo-img:" +
```

headerLogoMatch[1]);

```
  // 5. apple-touch-icon — low priority

  const appleMatch = rawHtml.match(

    /<link[^>]+rel=["']apple-touch-icon["'][^>]+href=["']([^"']+)["']/i

  ) || rawHtml.match(

    /<link[^>]+href=["']([^"']+)["'][^>]+rel=["']apple-touch-icon["']/i

  );

```



<!-- Page 36 -->

```
  if (appleMatch && appleMatch[1]) logoSources.push("apple-touch-icon:" + appleMatch[1]);

  websiteLogoHints = logoSources.join(" | ");

  // ── STRIP HTML TO CLEAN TEXT ──

  let text = rawHtml

    .replace(/<script[\s\S]*?<\/script>/gi, " ")

    .replace(/<style[\s\S]*?<\/style>/gi, " ")

    .replace(/<!--[\s\S]*?-->/g, " ")

    .replace(/<[^>]+>/g, " ")

    .replace(/&nbsp;/gi, " ")

    .replace(/&amp;/gi, "&")

    .replace(/&lt;/gi, "<")

    .replace(/&gt;/gi, ">")

    .replace(/&quot;/gi, '"')

    .replace(/&#39;/gi, "'")

    .replace(/\s{2,}/g, " ")

    .trim();

  websiteText = text.substring(0, 5000);

} catch (err) {

  fetchStatus = 0;

}

```

output = [{ websiteText, websiteLogoHints, fetchStatus }];



<!-- Page 37 -->

Expected output: websiteText, websiteLogoHints, fetchStatus

14. Step 14 — AI Researcher (Anthropic)
Purpose: Extracts the restaurant's logo URL (using the logo hints from Step 13 verbatim —
never fabricates) and generates a business summary for the PDF.

Action App: Anthropic (Claude)​
Action Event: Send Message

Model: claude-sonnet-4-20250514​
Max Tokens: 1000

System Prompt:

You are a research assistant for FoodServiceIQ. Your job is to extract structured data about an
independent restaurant from its website content.

Return a valid JSON object — no preamble, no markdown fences, nothing before or after the
JSON.

LOGO EXTRACTION RULES — follow precisely:

- You will receive logo hints in websiteLogoHints as a pipe-separated list like:

```
  og-image:https://... | twitter-image:https://... | schema-org-logo:https://... |
```

header-logo-img:https://... | apple-touch-icon:https://...

- Pick the BEST logo URL from the hints using this priority order:

```
  1. og-image (preferred — usually best quality brand image)

  2. schema-org-logo

  3. header-logo-img

  4. twitter-image

  5. apple-touch-icon

```

- Use the URL VERBATIM from the hints — do not modify, shorten, or construct any URL



<!-- Page 38 -->

- NEVER fabricate or guess a logo URL

- If no hints are provided or all are clearly invalid, set logo_url to null

BUSINESS SUMMARY RULES:

- Write 1–2 sentences describing the restaurant concept, location, and what makes it distinctive

- Write from what the website says, not general assumptions

- If website content is insufficient, write a brief summary from the restaurant name + concept
type only

- No em-dashes or en-dashes

OUTPUT FORMAT — return exactly this JSON structure:

```
{

  "logo_url": "https://..." or null,

  "business_summary": "One or two sentence description.",

  "concept_signals": "Any notable menu focus, style, or positioning signals (1 sentence or null)",

  "scrape_status": "ok" or "limited" or "failed"

}

```

User Message (paste this and replace [map: ...] with the Zapier variable picker):

Analyze this restaurant and extract the data.

RESTAURANT NAME: [map: Step 4 → restaurantName]

CONCEPT TYPE: [map: Step 4 → conceptTypeRaw]

WEBSITE URL: [map: Step 4 → websiteUrl]

LOGO HINTS (use these VERBATIM — do not fabricate):

[map: Step 13 → websiteLogoHints]



<!-- Page 39 -->

WEBSITE TEXT (stripped HTML):

[map: Step 13 → websiteText]

Expected output: JSON with logo_url, business_summary, concept_signals,
scrape_status

15. Step 15 — Research Analysis (Code by Zapier)
Purpose: Parses Claude's JSON response from Step 14 into flat fields. Validates the logo URL
(must be a real URL — starts with http, no spaces, longer than 15 chars, not a placeholder).

Action App: Code by Zapier​
Action Event: Run JavaScript

Input Data:

Key
Value
claudeResponse
```
{{Step 14 → Response Content → 1
```

→ Response Content Text}}

Watch out: Map the OUTPUT of Step 14 (the response), not the input. The variable
picker nests deep: Response → Response Content → 1 → Response Content Text.

JavaScript Code:

```
// Step 15: Research Analysis Parser

// Parses Claude's website analysis JSON, validates logo URL.

const raw = inputData.claudeResponse || "";

let cleaned = raw.trim();

```

cleaned = cleaned.replace(/^```json\s*/i, "");

cleaned = cleaned.replace(/^```\s*/i, "");



<!-- Page 40 -->

cleaned = cleaned.replace(/\s*```$/i, "");

cleaned = cleaned.trim();

```
let parsed = {

  logo_url: null,

  business_summary: null,

  concept_signals: null,

  scrape_status: "error"

};

let parseOk = false;

let parseError = null;

```

try {

```
  parsed = JSON.parse(cleaned);

  parseOk = true;

} catch (e) {

  parseError = e.message;

}

// Validate logo URL

// Must: start with http, be longer than 15 chars, have no spaces,

// not be a placeholder or example URL.

// Does NOT require a file extension (handles modern CDN URLs).

function isValidLogoUrl(url) {

  if (!url || typeof url !== "string") return false;

```



<!-- Page 41 -->

```
  const u = url.trim();

  if (!u.startsWith("http")) return false;

  if (u.length <= 15) return false;

  if (u.includes(" ")) return false;

  const lower = u.toLowerCase();

  if (lower.includes("example.com")) return false;

  if (lower.includes("placeholder")) return false;

  if (lower.includes("yourlogo")) return false;

  if (lower.includes("logo.png") && u.length < 25) return false; // too generic

  return true;

}

const rawLogoUrl = parsed.logo_url || null;

const logoUrl    = isValidLogoUrl(rawLogoUrl) ? rawLogoUrl.trim() : null;

const hasLogo    = logoUrl !== null;

const businessSummary = (typeof parsed.business_summary === "string" &&
```

parsed.business_summary.trim().length > 10)

```
  ? parsed.business_summary.trim() : null;

const menuSignals = (typeof parsed.concept_signals === "string" &&
```

parsed.concept_signals.trim().length > 5)

```
  ? parsed.concept_signals.trim() : null;

const scrapeStatus = parsed.scrape_status || "unknown";

```

output = {



<!-- Page 42 -->

```
  parseOk,

  parseError,

  logoUrl:         logoUrl    || "",

  hasLogo,

  businessSummary: businessSummary || "",

  menuSignals:     menuSignals || "",

  scrapeStatus,

  rawLogoUrl:      rawLogoUrl || ""

};

```

Expected output: logoUrl, hasLogo, businessSummary, menuSignals, scrapeStatus

16. Step 16 — Prompt Delay
Action App: Delay by Zapier​
Action Event: Delay For​
Delay: 1 second

This prevents Claude API rate limit issues when two Anthropic steps run
back-to-back.

17. Step 17 — AI Narrative Builder (Anthropic)
Purpose: Generates 3 personalized narrative blocks (50–80 words each) for Pages 3 of the
PDF. Bans em-dashes and en-dashes entirely.

Action App: Anthropic (Claude)​
Action Event: Send Message

Model: claude-sonnet-4-20250514​
Max Tokens: 1000



<!-- Page 43 -->

System Prompt:

You are a senior procurement analyst at FoodServiceIQ writing personalized narrative for an
independent restaurant operator's free Food Cost Analysis report.

Your job is to generate three short narrative paragraphs (50-80 words each) explaining where
this operator's overpayment is likely coming from. The paragraphs will appear in a PDF report
under the heading "The structural drivers behind the overpayment."

CRITICAL FRAMING RULES — conservative-estimator-with-upside:

- Use "likely," "typically," "based on your profile" — never definitive claims about this specific
operator's invoices, contracts, or rebates

- Never quote a specific dollar figure or percentage — those numbers are merged into the PDF
separately

- Always end each block pointing implicitly toward what a full analysis would reveal

- Position our calculator as a baseline; real outcomes typically land higher once invoices and
agreements are reviewed

PUNCTUATION RULES — strict:

- NEVER use em-dashes (—) anywhere in the output

- NEVER use en-dashes (–) anywhere in the output, including inside ranges

- Use commas, periods, semicolons, or parentheses instead

- If you would naturally write "X — Y", rewrite as "X, Y" or "X. Y" or "X (Y)"

- Hyphens in compound words ("multi-unit", "cost-plus") are fine

TONE:

- Direct and confident, not salesy

- Industry-fluent — these are restaurant operators, not consumers

- Avoid hype words: "massive," "huge," "incredible"



<!-- Page 44 -->

- Read like an experienced procurement executive talking to a peer

STRUCTURE — generate exactly these three blocks:

1. narrative_distributor — explains the operator's distributor structure and why it creates pricing
exposure. Reference their distributor type (broadliners, regional, local, combo) and what that
typically means for an independent at their scale.

2. narrative_procurement — explains the operator's procurement strategy and what leverage
gap it creates. Reference whether they're on market price, in a GPO, or have a single-distributor
agreement.

3. narrative_sku — explains why their SKU mix is high-leverage. Reference their stated top
SKUs by category (proteins, commodities) and what that typically means for recoverable
margin.

Each block must:

- Be 50-80 words

- Use the operator's actual restaurant name at least once

- Reference the website context naturally where relevant (concept type, multi-location footprint,
menu focus) — NEVER mention "the website" explicitly

- Be self-contained and readable on its own

- Contain no em-dashes or en-dashes

If website context fields are null or scrape failed, write the narrative blocks using only
operator-provided form data.

OUTPUT FORMAT:

Return ONLY a valid JSON object — no preamble, no markdown fences, no commentary before
or after.

```
{

  "narrative_distributor": "...",

  "narrative_procurement": "...",

```



<!-- Page 45 -->

```
  "narrative_sku": "..."

}

```

User Message (paste this and replace [map: ...] with the Zapier variable picker):

Generate the three narrative blocks for this operator.

OPERATOR PROFILE (from form):

- Restaurant name: [map: Step 4 → restaurantName]

- Concept type: [map: Step 4 → conceptTypeRaw]

- Annual food spend bucket: [map: Step 4 → spendBucket]

- Number of locations: [map: Step 4 → locationsRaw]

- Top SKUs stated: [map: Step 4 → topSkusRaw]

- Distributor type: [map: Step 4 → distributorTypeRaw]

- Procurement strategy: [map: Step 4 → procurementStrategyRaw]

PROFILE FLAGS (from rules engine):

- Has protein in SKUs: [map: Step 4 → hasProtein]

- Has commodity in SKUs: [map: Step 4 → hasCommodity]

WEBSITE CONTEXT (use only if scrape succeeded — do not mention "the website"):

- Scrape status: [map: Step 15 → scrapeStatus]

- Business summary: [map: Step 15 → businessSummary]

- Menu/concept signals: [map: Step 15 → menuSignals]

Expected output: JSON with narrative_distributor, narrative_procurement,
narrative_sku



<!-- Page 46 -->

18. Step 18 — PDF Code Prep (Code by Zapier)
Purpose: Parses Claude's narrative JSON, strips any em/en-dashes that slipped past the
prompt (safety net), and outputs clean fields for PDFMonkey.

Action App: Code by Zapier​
Action Event: Run JavaScript

Input Data:

Key
Value
claudeResponse
```
{{Step 17 → Response Content → 1
```

→ Response Content Text}}

Map the OUTPUT of Step 17, not the input. Same nesting issue as Step 15.

JavaScript Code:

```
// Step 18: PDF Code Prep (Narrative Parser) v1.1

// Parses Claude's narrative JSON and strips em/en-dashes as safety net.

const raw = inputData.claudeResponse || "";

let cleaned = raw.trim();

```

cleaned = cleaned.replace(/^```json\s*/i, "");

cleaned = cleaned.replace(/^```\s*/i, "");

cleaned = cleaned.replace(/\s*```$/i, "");

cleaned = cleaned.trim();

```
let parsed = {

  narrative_distributor: null,

  narrative_procurement: null,

```



<!-- Page 47 -->

```
  narrative_sku: null

};

let parseOk = false;

let parseError = null;

```

try {

```
  parsed = JSON.parse(cleaned);

  parseOk = true;

} catch (e) {

  parseError = e.message;

}

// Safety net: strip em-dashes and en-dashes that slipped past the Claude prompt

function stripDashes(s) {

  if (typeof s !== "string") return s;

  return s

    .replace(/\s*\u2014\s*/g, ", ")  // em-dash → ", "

    .replace(/\s*\u2013\s*/g, ", ")  // en-dash → ", "

    .replace(/,\s*,/g, ",")          // collapse double commas

    .replace(/,\s*\./g, ".")         // ", ." → "."

    .replace(/\s+/g, " ")            // collapse spaces

    .trim();

}

const narrativeDistributor =

```



<!-- Page 48 -->

```
  (typeof parsed.narrative_distributor === "string" &&

   parsed.narrative_distributor.trim().length > 20)

    ? stripDashes(parsed.narrative_distributor)

    : null;

const narrativeProcurement =

  (typeof parsed.narrative_procurement === "string" &&

   parsed.narrative_procurement.trim().length > 20)

    ? stripDashes(parsed.narrative_procurement)

    : null;

const narrativeSku =

  (typeof parsed.narrative_sku === "string" &&

   parsed.narrative_sku.trim().length > 20)

    ? stripDashes(parsed.narrative_sku)

    : null;

const allNarrativesPresent =

  narrativeDistributor && narrativeProcurement && narrativeSku;

```

output = {

```
  parseOk,

  parseError,

  allNarrativesPresent,

  narrativeDistributor: narrativeDistributor || "",

```



<!-- Page 49 -->

```
  narrativeProcurement: narrativeProcurement || "",

  narrativeSku:         narrativeSku || ""

};

```

Expected output: narrativeDistributor, narrativeProcurement, narrativeSku,
allNarrativesPresent

19. Step 19 — PDFMonkey: Generate Document
Action App: PDFMonkey​
Action Event: Generate Document

Template ID: (paste the ID you copied in §4b)

Payload — 24 variables. Map each key to the source shown:

Payload Key
Source Step
Source Field
restaurantName
Step 4
restaurantName
fullName
Step 4
fullName
conceptTypeRaw
Step 4
conceptTypeRaw
locationsRaw
Step 4
locationsRaw
spendBucket
Step 4
spendBucket
annualSpendDisplay
Step 4
annualSpendDisplay
finalPctDisplay
Step 4
finalPctDisplay
dollarEstimateDisplay
Step 4
dollarEstimateDisplay
conceptBenchmark
Step 4
conceptBenchmark
caseStudy
Step 4
caseStudy
year1Display
Step 4
year1Display
year2Display
Step 4
year2Display



<!-- Page 50 -->

Payload Key
Source Step
Source Field
year3Display
Step 4
year3Display
year4Display
Step 4
year4Display
year5Display
Step 4
year5Display
year1HeightPct
Step 4
year1HeightPct
year2HeightPct
Step 4
year2HeightPct
year3HeightPct
Step 4
year3HeightPct
year4HeightPct
Step 4
year4HeightPct
year5HeightPct
Step 4
year5HeightPct
logoUrl
Step 15
logoUrl
hasLogo
Step 15
hasLogo
businessSummary
Step 15
businessSummary
narrativeDistributor
Step 18
narrativeDistributor
narrativeProcurement
Step 18
narrativeProcurement
narrativeSku
Step 18
narrativeSku

Expected output: download_url — the URL of the generated PDF

20. Step 20 — Delay
Action App: Delay by Zapier​
Action Event: Delay For​
Delay: 5 seconds

Gives PDFMonkey time to finish rendering before Outlook tries to attach the link.



<!-- Page 51 -->

21. Step 21 — Qualified Email (Microsoft Outlook)
Subject: Your FoodServiceIQ Food Cost Analysis is ready​
To: {{Step 4 → email}}​
Body (HTML):

<!DOCTYPE html>

<html>

<head>

<meta charset="UTF-8">

</head>

<body style="font-family: Aptos, Arial, sans-serif; font-size: 11pt; line-height: 1.6; color: #000000;
max-width: 600px;">

<p>Hi {{Step 4 → fullName}},</p>

<p>Thanks for using <a href="https://www.foodserviceiq.com/" style="color: #52C275;
font-weight: bold; text-decoration: none;">FoodServiceIQ</a>'s Food Cost Analyzer. Your
personalized analysis for <strong>{{Step 4 → restaurantName}}</strong> is ready.</p>

<p style="margin-top: 25px; margin-bottom: 15px;">

```
  <a href="{{Step 19 → download_url}}" style="display: inline-block; background-color: #143225;
```

color: #ffffff; padding: 14px 28px; text-decoration: none; font-weight: bold; font-size: 12pt;
border-radius: 4px;">

```
    View Your Food Cost Analysis

  </a>

```

</p>

<p style="margin-top: 5px; margin-bottom: 25px;">

```
  <a href="https://calendly.com/neil-foodserviceiq/15-minute-meeting-clone-1" style="display:
```

inline-block; background-color: #52C275; color: #143225; padding: 14px 28px; text-decoration:
none; font-weight: bold; font-size: 12pt; border-radius: 4px;">



<!-- Page 52 -->

```
    Book Your Free Analysis Call

  </a>

```

</p>

<p>Once you've reviewed the report, the 30-minute analysis call is where we cross-reference
your actual invoices and agreements against the same pricing structures used by national
chains. No commitment, no upfront cost.</p>

<p>Looking forward,<br>

The FoodServiceIQ Team</p>

</body>

</html>

22. PDFMonkey Template HTML
22a. Sample Data JSON
Paste into the Sample Data pane in PDFMonkey before pasting the HTML.

```
{

  "restaurantName": "Casa Roberto",

  "fullName": "Roberto Sanchez",

  "conceptTypeRaw": "Fast casual",

  "spendBucket": "$1M\u2013$3M",

  "locationsRaw": "2 \u2013 4 locations",

  "annualSpendDisplay": "$2,000,000",

  "finalPctDisplay": "7.4%",

```



<!-- Page 53 -->

```
  "dollarEstimateDisplay": "$147,000",

  "year1Display": "$147,000",

  "year2Display": "$299,733",

  "year3Display": "$458,423",

  "year4Display": "$623,301",

  "year5Display": "$794,610",

  "year1HeightPct": 19,

  "year2HeightPct": 38,

  "year3HeightPct": 58,

  "year4HeightPct": 78,

  "year5HeightPct": 100,

  "conceptBenchmark": "25%\u201330%",

  "caseStudy": "MaryAnn's Diner",

  "logoUrl":
```

"https://dishsociety.com/wp-content/uploads/2023/11/Screen-Shot-2023-11-16-at-1.39.22-PM.pn
g",

```
  "hasLogo": true,

  "businessSummary": "Casa Roberto is a Texas-based fast casual concept originating in Austin,
```

known for its rotating seasonal menu and scratch kitchen approach.",

```
  "narrativeDistributor": "Casa Roberto's spend profile places it in the tier where national
```

broadliners apply standard street pricing rather than negotiated contract rates. At this scale,
independents rarely receive the same pricing architecture as regional chains, even when
volume is meaningful. A line-by-line invoice review typically surfaces the gap between what's
being paid and what's achievable at equivalent volume.",



<!-- Page 54 -->

```
  "narrativeProcurement": "Purchasing primarily through a single distributor at market price is the
```

most common procurement structure among independent operators at Casa Roberto's stage.
Without a GPO affiliation, a multi-distributor bid, or a negotiated cost-plus agreement, there is no
competitive pressure on standard pricing.",

```
  "narrativeSku": "Chicken, eggs, and produce represent some of the most volatile and
```

highest-margin-recovery SKUs in foodservice procurement. For a concept like Casa Roberto's,
these items likely account for a disproportionate share of total food spend, making them the first
categories a full analysis would target."

```
}
```

22b. Full Template HTML
Before pasting: Replace the 3 placeholder strings with your actual logo URLs (or base64 data
URIs):

-​
FSIQ_LOGO_DARK_URL — dark/black wordmark logo for pages 2–6 headers (white
background)
-​
FSIQ_LOGO_LIGHT_URL — white/light wordmark logo for page 1 cover (dark
background)
-​
FSIQ_IQ_LOGO_URL — IQ icon mark used as fallback when no client logo is found

Paste the HTML below into the HTML pane in PDFMonkey:

<!DOCTYPE html>

<html>

<head>

<meta charset="UTF-8">

<link
href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swa
p" rel="stylesheet">

<style>

@page { size: letter; margin: 0; }

```
* { margin: 0; padding: 0; box-sizing: border-box; }

```



<!-- Page 55 -->

body {

```
  font-family: 'Inter', 'Helvetica Neue', Arial, sans-serif;

  color: #143225;

  line-height: 1.5;

  font-size: 11pt;

}

.page {

  width: 8.5in; height: 11in;

  page-break-after: always;

  padding: 1.1in 0.75in 0.95in 0.75in;

  position: relative;

  background: #ffffff;

}

.page:last-child { page-break-after: auto; }

/* CONTENT AREA — strict bounds so nothing reaches the footer */

.page-content {

  max-height: 8.95in;

  overflow: hidden;

}

/* HEADER + FOOTER */

.page-header {

  position: absolute;

```



<!-- Page 56 -->

```
  top: 0.4in; left: 0.75in; right: 0.75in;

  display: flex; justify-content: space-between; align-items: center;

  padding-bottom: 0.15in;

  border-bottom: 1px solid #e2e8f0;

  font-size: 8pt; color: #64748b;

  text-transform: uppercase; letter-spacing: 0.05em;

  background: #ffffff;

  z-index: 10;

}

.page-header .left { display: flex; align-items: center; gap: 0.12in; }

.page-header .left img { height: 0.22in; width: auto; }

.page-header .left .client { font-weight: 600; color: #143225; }

.page-header .right { font-weight: 500; }

.page-footer {

  position: absolute;

  bottom: 0.4in; left: 0.75in; right: 0.75in;

  display: flex; justify-content: space-between;

  font-size: 8pt; color: #94a3b8;

  border-top: 1px solid #e2e8f0;

  padding-top: 0.1in;

  text-transform: uppercase; letter-spacing: 0.05em;

```



<!-- Page 57 -->

```
  background: #ffffff;

  z-index: 10;

}

/* COVER */

.cover {

  background: linear-gradient(135deg, #0e2418 0%, #143225 50%, #1a4632 100%);

  color: #ffffff;

  display: flex; flex-direction: column; justify-content: space-between;

  padding: 1in 0.75in;

}

.cover-top { display: flex; justify-content: space-between; align-items: center; }

.cover-logos { display: flex; align-items: center; gap: 0.4in; }

.cover-operator-logo {

  width: 1in; height: 1in;

  background: #ffffff; border-radius: 8px;

  display: flex; align-items: center; justify-content: center;

  overflow: hidden;

}

.cover-operator-logo img { max-width: 80%; max-height: 80%; object-fit: contain; }

.fsiq-cover-logo img { height: 0.55in; width: auto; }

.cover-middle { margin-top: 1.5in; }

.cover-eyebrow {

```



<!-- Page 58 -->

```
  font-size: 10pt; color: #52C275;

  text-transform: uppercase; letter-spacing: 0.2em; font-weight: 600;

  margin-bottom: 0.3in;

}

.cover-title {

  font-size: 38pt; line-height: 1.1; font-weight: 800;

  letter-spacing: -0.02em; margin-bottom: 0.25in;

}

.cover-subtitle {

  font-size: 14pt; color: rgba(255,255,255,0.85);

  font-weight: 400; line-height: 1.4; max-width: 5.5in;

}

.cover-bottom {

  display: flex; justify-content: space-between; align-items: flex-end;

  border-top: 1px solid rgba(255,255,255,0.2);

  padding-top: 0.3in;

  font-size: 9pt; color: rgba(255,255,255,0.85);

  gap: 0.3in;

}

.cover-bottom > div { flex: 1; }

.cover-bottom .label {

```



<!-- Page 59 -->

```
  font-size: 8pt; color: rgba(255,255,255,0.6);

  text-transform: uppercase; letter-spacing: 0.15em;

  margin-bottom: 0.05in;

}

.cover-bottom .value { font-size: 11pt; color: #ffffff; font-weight: 500; }

/* SECTIONS */

.section-eyebrow {

  font-size: 9pt; color: #52C275;

  text-transform: uppercase; letter-spacing: 0.15em; font-weight: 700;

  margin-bottom: 0.15in;

}

.section-title {

  font-size: 24pt; line-height: 1.15; font-weight: 800;

  color: #143225; letter-spacing: -0.015em; margin-bottom: 0.25in;

}

/* HEADLINE STAT */

.headline-stat {

  background: #f8fafc; border-left: 4px solid #52C275;

  padding: 0.25in 0.35in; margin: 0.2in 0; border-radius: 0 6px 6px 0;

}

.headline-stat .stat-label {

  font-size: 9pt; color: #64748b;

```



<!-- Page 60 -->

```
  text-transform: uppercase; letter-spacing: 0.1em; margin-bottom: 0.08in;

}

.headline-stat .stat-value {

  font-size: 32pt; font-weight: 800; color: #143225;

  line-height: 1; letter-spacing: -0.02em;

}

.headline-stat .stat-supporting { font-size: 11pt; color: #475569; margin-top: 0.08in; }

.stat-grid { display: flex; gap: 0.2in; margin: 0.2in 0; }

.stat-card {

  flex: 1; background: #f8fafc; border: 1px solid #e2e8f0;

  border-radius: 6px; padding: 0.2in;

}

.stat-card .label {

  font-size: 8pt; color: #64748b;

  text-transform: uppercase; letter-spacing: 0.08em; margin-bottom: 0.06in;

}

.stat-card .value {

  font-size: 14pt; font-weight: 700; color: #143225; line-height: 1.1;

}

.framing-copy {

  background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 6px;

```



<!-- Page 61 -->

```
  padding: 0.2in; margin-top: 0.2in;

  font-size: 9.5pt; line-height: 1.55; color: #143225;

}

/* PROJECTION BAR CHART */

.projection-wrap { margin-top: 0.25in; }

.projection-title {

  font-size: 10pt; font-weight: 700; color: #143225;

  margin-bottom: 0.12in;

  text-transform: uppercase; letter-spacing: 0.05em;

}

.projection-bars {

  display: flex; gap: 0.12in;

  align-items: flex-end;

  height: 1.9in;

  padding: 0.1in;

  border: 1px solid #e2e8f0; border-radius: 6px;

  background: #fafafa;

}

.bar {

  flex: 1;

  display: flex; flex-direction: column; align-items: center;

  height: 100%; justify-content: flex-end;

```



<!-- Page 62 -->

```
}

.bar-fill {

  width: 100%;

  background: linear-gradient(180deg, #52C275 0%, #143225 100%);

  border-radius: 4px 4px 0 0;

  color: #ffffff; font-weight: 700; font-size: 9pt;

  display: flex; align-items: flex-start; justify-content: center;

  padding-top: 0.06in;

  min-height: 0.35in;

}

.bar-label {

  margin-top: 0.06in;

  font-size: 8.5pt; color: #475569; font-weight: 600;

}

.projection-note {

  margin-top: 0.12in;

  font-size: 8.5pt; color: #64748b; font-style: italic;

}

/* NARRATIVE BLOCKS */

.narrative-block {

  margin-bottom: 0.2in;

```



<!-- Page 63 -->

```
  padding: 0.2in;

  background: #f8fafc; border-radius: 6px;

  border-left: 3px solid #52C275;

}

.narrative-block-label {

  font-size: 9pt; color: #52C275;

  text-transform: uppercase; letter-spacing: 0.15em; font-weight: 700;

  margin-bottom: 0.06in;

}

.narrative-block-heading {

  font-size: 12pt; font-weight: 700; color: #143225;

  margin-bottom: 0.08in;

}

.narrative-block-body { font-size: 10pt; line-height: 1.55; color: #334155; }

/* PAGE 4 — QUADRANTS */

.uncover-grid {

  display: grid; grid-template-columns: 1fr 1fr;

  gap: 0.2in; margin-top: 0.25in;

}

.uncover-card {

  background: #f8fafc; border: 1px solid #e2e8f0;

  border-radius: 8px; padding: 0.22in;

```



<!-- Page 64 -->

```
}

.uncover-card .icon-wrap {

  width: 0.42in; height: 0.42in;

  background: #143225; border-radius: 8px;

  display: flex; align-items: center; justify-content: center;

  margin-bottom: 0.12in;

}

.uncover-card .icon-wrap svg { width: 0.26in; height: 0.26in; }

.uncover-card .heading {

  font-size: 11.5pt; font-weight: 700; color: #143225;

  margin-bottom: 0.06in;

}

.uncover-card .body {

  font-size: 9.5pt; line-height: 1.5; color: #475569;

}

.uncover-cta {

  margin-top: 0.25in; padding: 0.22in;

  background: linear-gradient(135deg, #143225 0%, #1a4632 100%);

  color: #ffffff; border-radius: 6px; text-align: center;

}

.uncover-cta .cta-text { font-size: 10.5pt; line-height: 1.5; margin-bottom: 0.12in; }

```



<!-- Page 65 -->

```
.uncover-cta a, .uncover-cta a:link, .uncover-cta a:visited {

  display: inline-block;

  background: #52C275; color: #143225 !important;

  font-weight: 800; padding: 0.13in 0.3in;

  border-radius: 4px;

  text-transform: uppercase; letter-spacing: 0.05em; font-size: 10pt;

  text-decoration: none;

}

/* PAGE 5 — CASE STUDY */

.case-hero {

  background: #143225; color: #ffffff;

  padding: 0.3in; border-radius: 6px; margin-top: 0.25in;

}

.case-result-row { display: flex; gap: 0.3in; margin-bottom: 0.2in; }

.case-result { flex: 1; }

.case-result .label {

  font-size: 9pt; color: rgba(255,255,255,0.7);

  text-transform: uppercase; letter-spacing: 0.1em; margin-bottom: 0.05in;

}

.case-result .value {

  font-size: 20pt; font-weight: 800; color: #52C275; line-height: 1;

}

```



<!-- Page 66 -->

```
.case-quote {

  font-size: 11pt; font-style: italic; line-height: 1.5;

  color: rgba(255,255,255,0.95);

  margin-bottom: 0.12in;

  padding-left: 0.2in; border-left: 3px solid #52C275;

}

.case-attribution {

  font-size: 9pt; color: rgba(255,255,255,0.75); padding-left: 0.2in;

}

.case-attribution strong { color: #52C275; }

.case-context {

  margin-top: 0.2in;

  font-size: 10pt; line-height: 1.55; color: #334155;

}

.case-sections {

  margin-top: 0.18in;

  display: grid; grid-template-columns: 1fr 1fr 1fr;

  gap: 0.15in;

}

.case-section {

  background: #f8fafc; border-radius: 6px;

```



<!-- Page 67 -->

```
  padding: 0.18in;

  border-top: 3px solid #52C275;

}

.case-section .heading {

  font-size: 9pt; font-weight: 700; color: #143225;

  text-transform: uppercase; letter-spacing: 0.08em;

  margin-bottom: 0.08in;

}

.case-section ul { list-style: none; padding: 0; margin: 0; }

.case-section li {

  font-size: 9pt; color: #475569;

  padding: 0.05in 0 0.05in 0.22in;

  position: relative; line-height: 1.45;

}

.case-section li:before {

  content: "";

  position: absolute;

  left: 0; top: 0.11in;

  width: 0.13in; height: 0.07in;

  border-left: 2px solid #8df0ab;

  border-bottom: 2px solid #8df0ab;

  transform: rotate(-45deg);

```



<!-- Page 68 -->

```
}

/* PAGE 6 — FINAL CTA + DISCLAIMER */

.final-cta-wrap { text-align: center; margin-top: 0.5in; }

.final-cta-eyebrow {

  font-size: 10pt; color: #52C275;

  text-transform: uppercase; letter-spacing: 0.2em; font-weight: 700;

  margin-bottom: 0.15in;

}

.final-cta-title {

  font-size: 28pt; font-weight: 800; color: #143225;

  line-height: 1.15; letter-spacing: -0.02em;

  margin-bottom: 0.25in;

  max-width: 6in; margin-left: auto; margin-right: auto;

}

.final-cta-body {

  font-size: 11.5pt; line-height: 1.55; color: #475569;

  max-width: 5in; margin: 0 auto 0.3in auto;

}

.final-cta-wrap a, .final-cta-wrap a:link, .final-cta-wrap a:visited {

  display: inline-block;

  background: #143225; color: #ffffff !important;

```



<!-- Page 69 -->

```
  padding: 0.18in 0.45in; border-radius: 6px;

  font-size: 13pt; font-weight: 700;

  text-transform: uppercase; letter-spacing: 0.05em;

  text-decoration: none;

}

.final-cta-wrap a .accent { color: #52C275; }

.what-to-expect {

  margin-top: 0.35in;

  background: #f8fafc; border-radius: 6px;

  padding: 0.25in; text-align: left;

}

.what-to-expect h4 {

  font-size: 10pt;

  text-transform: uppercase; letter-spacing: 0.1em;

  color: #143225; margin-bottom: 0.12in;

}

.what-to-expect ul { list-style: none; padding: 0; }

.what-to-expect li {

  font-size: 9.5pt; color: #475569;

  padding: 0.04in 0 0.04in 0.22in;

  position: relative; line-height: 1.5;

}

```



<!-- Page 70 -->

```
.what-to-expect li:before {

  content: "";

  position: absolute; left: 0; top: 0.11in;

  width: 0.13in; height: 0.07in;

  border-left: 2px solid #8df0ab;

  border-bottom: 2px solid #8df0ab;

  transform: rotate(-45deg);

}

.disclaimer {

  margin-top: 0.3in;

  padding-top: 0.15in;

  border-top: 1px solid #e2e8f0;

  font-size: 7pt; line-height: 1.5; color: #94a3b8;

  text-align: left;

  max-width: 6.5in;

  margin-left: auto; margin-right: auto;

}

```

</style>

</head>

<body>

<!-- PAGE 1 — COVER -->



<!-- Page 71 -->

<div class="page cover">

```
  <div class="cover-top">

    <div class="cover-logos">

      <div class="cover-operator-logo">

        {% if hasLogo %}

          <img src="{{ logoUrl }}" alt="{{ restaurantName }}"

               onerror="this.onerror=null; this.src=this.nextElementSibling.src;">

          <img src="FSIQ_IQ_LOGO_URL" style="display:none;">

        {% else %}

          <img src="FSIQ_IQ_LOGO_URL" alt="FoodServiceIQ">

        {% endif %}

      </div>

      <div class="fsiq-cover-logo">

        <img src="FSIQ_LOGO_LIGHT_URL" alt="FoodServiceIQ">

      </div>

    </div>

  </div>

  <div class="cover-middle">

    <div class="cover-eyebrow">Confidential Food Cost Analysis</div>

    <div class="cover-title">{{ restaurantName }}'s Recoverable Margin, At a Glance.</div>

    <div class="cover-subtitle">A profile-based estimate of where your operation is likely
```

overpaying, and what a complete analysis would uncover.</div>



<!-- Page 72 -->

```
  </div>

  <div class="cover-bottom">

    <div>

      <div class="label">Prepared For</div>

      <div class="value">{{ fullName }}</div>

    </div>

    <div>

      <div class="label">Concept</div>

      <div class="value">{{ conceptTypeRaw }}</div>

    </div>

    <div>

      <div class="label">Footprint</div>

      <div class="value">{{ locationsRaw }}</div>

    </div>

    <div>

      <div class="label">Annual Food Spend</div>

      <div class="value">{{ annualSpendDisplay }}</div>

    </div>

  </div>

```

</div>

<!-- PAGE 2 — HEADLINE FINDING -->

<div class="page">



<!-- Page 73 -->

```
  <div class="page-header">

    <div class="left">

      <img src="FSIQ_LOGO_DARK_URL" alt="FoodServiceIQ">

      <span class="client">{{ restaurantName }}</span>

    </div>

    <div class="right">Headline Finding</div>

  </div>

  <div class="page-content">

    <div class="section-eyebrow">The Estimate</div>

    <div class="section-title">{{ restaurantName }} is likely overpaying at least <span style="color:
```

#52C275;">{{ finalPctDisplay }}</span> on annual food costs.</div>

```
    <div class="headline-stat">

      <div class="stat-label">Estimated Annual Recoverable Margin (Baseline)</div>

      <div class="stat-value">{{ dollarEstimateDisplay }}</div>

      <div class="stat-supporting">A conservative starting point built from your operator
```

profile.</div>

```
    </div>

    <div class="stat-grid">

      <div class="stat-card"><div class="label">Spend Tier</div><div class="value">{{
```

spendBucket }}</div></div>

```
      <div class="stat-card"><div class="label">Industry Benchmark</div><div class="value">{{
```

conceptBenchmark }}</div></div>

```
      <div class="stat-card"><div class="label">Concept</div><div class="value">{{
```

conceptTypeRaw }}</div></div>



<!-- Page 74 -->

```
    </div>

    <div class="framing-copy">

      <strong>This figure is built from operator profile data only.</strong> Restaurants with similar
```

characteristics typically recover more than this baseline once we audit invoices, agreements,
and pricing structures directly. Your full analysis call covers exactly that.

```
    </div>

    <div class="projection-wrap">

      <div class="projection-title">Five-Year Cumulative Recoverable Margin
```

(USDA-Aligned)</div>

```
      <div class="projection-bars">

        <div class="bar"><div class="bar-fill" style="height: {{ year1HeightPct }}%;">{{ year1Display
}}</div><div class="bar-label">Year 1</div></div>

        <div class="bar"><div class="bar-fill" style="height: {{ year2HeightPct }}%;">{{ year2Display
}}</div><div class="bar-label">Year 2</div></div>

        <div class="bar"><div class="bar-fill" style="height: {{ year3HeightPct }}%;">{{ year3Display
}}</div><div class="bar-label">Year 3</div></div>

        <div class="bar"><div class="bar-fill" style="height: {{ year4HeightPct }}%;">{{ year4Display
}}</div><div class="bar-label">Year 4</div></div>

        <div class="bar"><div class="bar-fill" style="height: {{ year5HeightPct }}%;">{{ year5Display
}}</div><div class="bar-label">Year 5</div></div>

      </div>

      <div class="projection-note">Cumulative figures assume a flat baseline gap and apply
```

USDA-projected food-away-from-home inflation of 3.9% annually.</div>

```
    </div>

  </div>

  <div class="page-footer">

```



<!-- Page 75 -->

```
    <div>FoodServiceIQ &mdash; CONFIDENTIAL</div>

    <div>Page 2</div>

  </div>

```

</div>

<!-- PAGE 3 — STRUCTURAL DRIVERS -->

<div class="page">

```
  <div class="page-header">

    <div class="left">

      <img src="FSIQ_LOGO_DARK_URL" alt="FoodServiceIQ">

      <span class="client">{{ restaurantName }}</span>

    </div>

    <div class="right">The Structural Drivers</div>

  </div>

  <div class="page-content">

    <div class="section-eyebrow">Diagnostic</div>

    <div class="section-title">The structural drivers behind the overpayment.</div>

    {% if businessSummary %}

    <p style="font-size: 10pt; color: #64748b; margin-bottom: 0.2in; font-style: italic; line-height:
```

1.55;">

```
      {{ businessSummary }}

    </p>

    {% endif %}

```



<!-- Page 76 -->

```
    <div class="narrative-block">

      <div class="narrative-block-label">01 &mdash; Distributor Structure</div>

      <div class="narrative-block-heading">Your distributor relationship sets your pricing
```

floor.</div>

```
      <div class="narrative-block-body">{{ narrativeDistributor }}</div>

    </div>

    <div class="narrative-block">

      <div class="narrative-block-label">02 &mdash; Procurement Strategy</div>

      <div class="narrative-block-heading">Leverage isn't automatic, it's structural.</div>

      <div class="narrative-block-body">{{ narrativeProcurement }}</div>

    </div>

    <div class="narrative-block">

      <div class="narrative-block-label">03 &mdash; SKU Mix</div>

      <div class="narrative-block-heading">High-volume categories carry the largest
```

variance.</div>

```
      <div class="narrative-block-body">{{ narrativeSku }}</div>

    </div>

  </div>

  <div class="page-footer">

    <div>FoodServiceIQ &mdash; CONFIDENTIAL</div>

    <div>Page 3</div>

  </div>

```



<!-- Page 77 -->

</div>

<!-- PAGE 4 — FULL ANALYSIS -->

<div class="page">

```
  <div class="page-header">

    <div class="left">

      <img src="FSIQ_LOGO_DARK_URL" alt="FoodServiceIQ">

      <span class="client">{{ restaurantName }}</span>

    </div>

    <div class="right">The Full Analysis</div>

  </div>

  <div class="page-content">

    <div class="section-eyebrow">Beyond the Baseline</div>

    <div class="section-title">What a complete analysis would uncover.</div>

    <p style="font-size: 10.5pt; line-height: 1.6; color: #334155; margin-bottom: 0.2in;">

      Your <strong>{{ finalPctDisplay }}</strong> estimate is built from five profile-level signals.
```

The actual figure for {{ restaurantName }} is shaped by data we can't see from a form: SKU-level
invoice pricing, contracted rates vs. invoiced rates, manufacturer rebate program eligibility, and
the specific terms in your current distributor agreement.

```
    </p>

    <div class="uncover-grid">

      <div class="uncover-card">

        <div class="icon-wrap">

          <svg viewBox="0 0 24 24" fill="none" stroke="#52C275" stroke-width="2"
```

stroke-linecap="round" stroke-linejoin="round"><path d="M3 21V9l4 2V7l5 3V5l5 3V3l4



<!-- Page 78 -->

2v16"/><path d="M3 21h18"/><circle cx="7" cy="17" r="1" fill="#52C275"/><circle cx="12"
cy="17" r="1" fill="#52C275"/><circle cx="17" cy="17" r="1" fill="#52C275"/></svg>

```
        </div>

        <div class="heading">Direct Manufacturer Programs</div>

        <div class="body">Chain-level pricing on your existing SKUs through senior manufacturer
```

relationships. Quantified during analysis.</div>

```
      </div>

      <div class="uncover-card">

        <div class="icon-wrap">

          <svg viewBox="0 0 24 24" fill="none" stroke="#52C275" stroke-width="2"
```

stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2
2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/><path d="M9 13h6"/><path d="M9
17h4"/></svg>

```
        </div>

        <div class="heading">Distributor Agreement Upgrade</div>

        <div class="body">Restructured terms that reflect your real volume and account profile, not
```

the standard independent rate.</div>

```
      </div>

      <div class="uncover-card">

        <div class="icon-wrap">

          <svg viewBox="0 0 24 24" fill="none" stroke="#52C275" stroke-width="2"
```

stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="7"/><path d="m21
21-4.3-4.3"/><path d="M11 8v6"/><path d="M8 11h6"/></svg>

```
        </div>

        <div class="heading">Compliance &amp; Audit Recovery</div>

```



<!-- Page 79 -->

```
        <div class="body">Forensic invoice review surfacing billing errors, expired rebates, and
```

contract non-compliance.</div>

```
      </div>

      <div class="uncover-card">

        <div class="icon-wrap">

          <svg viewBox="0 0 24 24" fill="none" stroke="#52C275" stroke-width="2"
```

stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8
10 8 10z"/><path d="m9 12 2 2 4-4"/></svg>

```
        </div>

        <div class="heading">Inflation Protection Terms</div>

        <div class="body">Pricing-adjustment caps and audit rights typically reserved for national
```

chain agreements.</div>

```
      </div>

    </div>

    <div class="uncover-cta">

      <div class="cta-text">The case study on the next page reflects what one operator in a
```

similar position to yours actually recovered after a full analysis.</div>

```
      <a href="https://calendly.com/neil-foodserviceiq/15-minute-meeting-clone-1">Book Your Full
```

Analysis Call</a>

```
    </div>

  </div>

  <div class="page-footer">

    <div>FoodServiceIQ &mdash; CONFIDENTIAL</div>

    <div>Page 4</div>

  </div>

```



<!-- Page 80 -->

</div>

<!-- PAGE 5 — CASE STUDY -->

<div class="page">

```
  <div class="page-header">

    <div class="left">

      <img src="FSIQ_LOGO_DARK_URL" alt="FoodServiceIQ">

      <span class="client">{{ restaurantName }}</span>

    </div>

    <div class="right">Featured Case Study</div>

  </div>

  <div class="page-content">

    <div class="section-eyebrow">A Comparable Operator</div>

    {% case caseStudy %}

    {% when "Black's BBQ" %}

      <div class="section-title">How Black's BBQ Reclaimed $427K in Annual Food Costs.</div>

      <div class="case-hero">

        <div class="case-result-row">

          <div class="case-result"><div class="label">Annual Savings</div><div
```

class="value">$427,000</div></div>

```
          <div class="case-result"><div class="label">Cost Reduction</div><div
```

class="value">7%</div></div>

```
          <div class="case-result"><div class="label">Disruption</div><div
```

class="value">Zero</div></div>



<!-- Page 81 -->

```
        </div>

        <div class="case-quote">"Your business has been a godsend for us and our family and the
```

best decision I have ever made. We have always done well but your company has found a lot of
passive profits for us."</div>

```
        <div class="case-attribution"><strong>Kent Black</strong>, Third-Generation Pitmaster
```

and Owner, Black's Barbeque</div>

```
      </div>

      <div class="case-context">Black's is one of Texas' oldest BBQ chains, with deep, long-term
```

supplier relationships. A line-by-line forensic audit surfaced hidden markups, expired rebate
programs, and contract non-compliance.</div>

```
      <div class="case-sections">

        <div class="case-section">

          <div class="heading">Key Challenges</div>

          <ul>

            <li>Decades of supplier loyalty masked the structural pricing gap</li>

            <li>Expired rebate programs had quietly reverted to standard pricing</li>

            <li>No internal infrastructure for SKU-level invoice auditing</li>

          </ul>

        </div>

        <div class="case-section">

          <div class="heading">Our Approach</div>

          <ul>

            <li>Forensic line-by-line invoice audit across all categories</li>

            <li>Direct manufacturer program access on high-volume SKUs</li>

```



<!-- Page 82 -->

```
            <li>Contract compliance recovery on expired rebates</li>

          </ul>

        </div>

        <div class="case-section">

          <div class="heading">Why It Worked</div>

          <ul>

            <li>Existing vendor relationships preserved completely</li>

            <li>Zero operational change for the kitchen or front of house</li>

            <li>Recovery began within the first invoice cycle</li>

          </ul>

        </div>

      </div>

    {% when "Spirits" %}

      <div class="section-title">How Spirits Saved 8.4% on Annual Food Costs.</div>

      <div class="case-hero">

        <div class="case-result-row">

          <div class="case-result"><div class="label">Cost Reduction</div><div
```

class="value">8.4%</div></div>

```
          <div class="case-result"><div class="label">Disruption</div><div
```

class="value">Zero</div></div>

```
          <div class="case-result"><div class="label">Vendor Changes</div><div
```

class="value">None</div></div>

```
        </div>

```



<!-- Page 83 -->

```
        <div class="case-quote">"We have a lot of calls with a lot of suppliers. I can say hands
```

down that our interactions with you guys have been among the best."</div>

```
        <div class="case-attribution"><strong>Lee Gwinn</strong>, Owner, Spirits Food and
```

Friends</div>

```
      </div>

      <div class="case-context">Spirits is an iconic single-location restaurant in Alexandria,
```

Louisiana, with high purchasing volume. Decades of supplier familiarity created reasonable
confidence that pricing was already competitive, until a structured procurement audit found
otherwise.</div>

```
      <div class="case-sections">

        <div class="case-section">

          <div class="heading">Key Challenges</div>

          <ul>

            <li>High-volume single-location buying without chain-level pricing</li>

            <li>Cost exposure across proteins, produce, packaging, and chemicals</li>

            <li>Long supplier tenure had become a barrier to renegotiation</li>

          </ul>

        </div>

        <div class="case-section">

          <div class="heading">Our Approach</div>

          <ul>

            <li>Multi-category cost analysis across the full market basket</li>

            <li>Negotiated chain-level terms with the existing distributor</li>

            <li>Layered in direct manufacturer programs on key SKUs</li>

```



<!-- Page 84 -->

```
          </ul>

        </div>

        <div class="case-section">

          <div class="heading">Why It Worked</div>

          <ul>

            <li>No supplier changes, no operational risk</li>

            <li>Negotiated savings stacked with manufacturer programs</li>

            <li>Sustained savings tracked monthly against benchmarks</li>

          </ul>

        </div>

      </div>

    {% when "MaryAnn's Diner" %}

      <div class="section-title">How MaryAnn's Diner Recovered $270,000 in Annual Food
```

Costs.</div>

```
      <div class="case-hero">

        <div class="case-result-row">

          <div class="case-result"><div class="label">Annual Savings</div><div
```

class="value">$270,000</div></div>

```
          <div class="case-result"><div class="label">Cost Reduction</div><div
```

class="value">9%</div></div>

```
          <div class="case-result"><div class="label">Locations</div><div class="value">5
```

units</div></div>

```
        </div>

```



<!-- Page 85 -->

```
        <div class="case-quote">"An extra $22,000 a month, it changes everything. It creates
```

breathing room. It means not walking into the restaurant every Friday wondering if we're going
to make payroll."</div>

```
        <div class="case-attribution"><strong>Bill Andreoli</strong>, Owner, MaryAnn's Diner and
```

DREO</div>

```
      </div>

      <div class="case-context">MaryAnn's is a five-unit group with $3M+ in annual food spend
```

and 25+ years of operational experience. A multi-location purchasing audit revealed $22,000+
per month in recoverable margin.</div>

```
      <div class="case-sections">

        <div class="case-section">

          <div class="heading">Key Challenges</div>

          <ul>

            <li>25+ years of operational experience masked the pricing gap</li>

            <li>Long-standing rebate program created confidence pricing was optimized</li>

            <li>Five locations required a solution scalable without adding complexity</li>

          </ul>

        </div>

        <div class="case-section">

          <div class="heading">Our Approach</div>

          <ul>

            <li>Comprehensive multi-location purchasing audit across all 5 units</li>

            <li>Secured chain-level pricing previously reserved for national accounts</li>

            <li>Layered 100+ direct manufacturer deals on the market basket</li>

```



<!-- Page 86 -->

```
          </ul>

        </div>

        <div class="case-section">

          <div class="heading">Why It Worked</div>

          <ul>

            <li>Zero disruption to daily operations or supplier relationships</li>

            <li>Menu and quality standards preserved completely</li>

            <li>Implementation consistent across all 5 locations</li>

          </ul>

        </div>

      </div>

    {% when "The Oasis" %}

      <div class="section-title">How The Oasis Saved 10% on Annual Food Spend at Massive
```

Scale.</div>

```
      <div class="case-hero">

        <div class="case-result-row">

          <div class="case-result"><div class="label">Annual Savings</div><div
```

class="value">$335,000+</div></div>

```
          <div class="case-result"><div class="label">Cost Reduction</div><div
```

class="value">10%</div></div>

```
          <div class="case-result"><div class="label">Partnership</div><div class="value">6+
```

years</div></div>

```
        </div>

```



<!-- Page 87 -->

```
        <div class="case-quote">"FoodServiceIQ came into my life about six years ago, and it's
```

made dealing with the big food service companies much easier, much more efficient, and saved
us a lot of money on the bottom line."</div>

```
        <div class="case-attribution"><strong>Beau Theriot</strong>, Owner, The Oasis on Lake
```

Travis</div>

```
      </div>

      <div class="case-context">The Oasis is one of the largest single-location restaurants in the
```

United States, serving 50,000 to 60,000 guests per month.</div>

```
      <div class="case-sections">

        <div class="case-section">

          <div class="heading">Key Challenges</div>

          <ul>

            <li>Massive single-location volume without chain-level negotiating power</li>

            <li>Scale created supplier complexity that required dedicated management</li>

            <li>Cost pressures from continued growth in guest count</li>

          </ul>

        </div>

        <div class="case-section">

          <div class="heading">Our Approach</div>

          <ul>

            <li>Negotiated chain-tier pricing structures across all major categories</li>

            <li>Ongoing audit and benchmarking as partnership extended</li>

            <li>Quarterly reviews tied to commodity cycle and supplier performance</li>

          </ul>

```



<!-- Page 88 -->

```
        </div>

        <div class="case-section">

          <div class="heading">Why It Worked</div>

          <ul>

            <li>Long partnership horizon enabled compounding cost improvements</li>

            <li>Savings reinvested into guest experience and operations</li>

            <li>Continuous benchmarking kept pricing competitive year over year</li>

          </ul>

        </div>

      </div>

    {% when "Dish Society" %}

      <div class="section-title">How Dish Society Saved $413K Without Changing a Single
```

Vendor.</div>

```
      <div class="case-hero">

        <div class="case-result-row">

          <div class="case-result"><div class="label">Annual Savings</div><div
```

class="value">$413,000+</div></div>

```
          <div class="case-result"><div class="label">Vendors Changed</div><div
```

class="value">Zero</div></div>

```
          <div class="case-result"><div class="label">SKUs Changed</div><div
```

class="value">Zero</div></div>

```
        </div>

        <div class="case-quote">"FSIQ has been in our corner for over a decade. Their team
```

found margin we didn't realize was there."</div>



<!-- Page 89 -->

```
        <div class="case-attribution"><strong>Joe Lanni</strong>, Founder and CEO</div>

      </div>

      <div class="case-context">Dish Society is a fast-growing Houston-based restaurant group
```

with strong margins. As volume scaled, procurement structure didn't keep pace.</div>

```
      <div class="case-sections">

        <div class="case-section">

          <div class="heading">Key Challenges</div>

          <ul>

            <li>Rapid growth had outpaced procurement infrastructure</li>

            <li>Procurement complexity expanded with every new location</li>

            <li>No central system for invoice auditing across the group</li>

          </ul>

        </div>

        <div class="case-section">

          <div class="heading">Our Approach</div>

          <ul>

            <li>Restructured distributor terms to reflect actual group volume</li>

            <li>Cross-location SKU rationalization and pricing standardization</li>

            <li>Continuous compliance monitoring as the group expanded</li>

          </ul>

        </div>

        <div class="case-section">

```



<!-- Page 90 -->

```
          <div class="heading">Why It Worked</div>

          <ul>

            <li>Same vendors, same SKUs, same operations</li>

            <li>Margin recovered immediately and compounded with growth</li>

            <li>Procurement scaled in step with the business</li>

          </ul>

        </div>

      </div>

    {% when "Thunderdome" %}

      <div class="section-title">How Thunderdome Scaled From 16 to 52 Locations With Aligned
```

Procurement.</div>

```
      <div class="case-hero">

        <div class="case-result-row">

          <div class="case-result"><div class="label">Recent Savings</div><div
```

class="value">$521,000+</div></div>

```
          <div class="case-result"><div class="label">Locations</div><div class="value">16 to
```

52</div></div>

```
          <div class="case-result"><div class="label">Partnership</div><div class="value">10+
```

years</div></div>

```
        </div>

        <div class="case-quote">"FSIQ has been in our corner for over a decade. Their team
```

found margin we didn't realize was there and helped us scale with stronger contracts and
smarter pricing."</div>

```
        <div class="case-attribution"><strong>Joe Lanni</strong>, Owner, Thunderdome
```

Restaurant Group</div>



<!-- Page 91 -->

```
      </div>

      <div class="case-context">Thunderdome is a multi-concept restaurant group that grew from
```

16 to 52 locations over a decade-long FSIQ partnership.</div>

```
      <div class="case-sections">

        <div class="case-section">

          <div class="heading">Key Challenges</div>

          <ul>

            <li>Rapid multi-brand, multi-market growth across concepts</li>

            <li>Procurement complexity that needed active management across the portfolio</li>

            <li>Gap between combined volume and existing distributor terms widening</li>

          </ul>

        </div>

        <div class="case-section">

          <div class="heading">Our Approach</div>

          <ul>

            <li>Proprietary FSIQ RFP process using aggregated buying power</li>

            <li>Direct manufacturer programs on high-impact SKUs across all concepts</li>

            <li>Continuous re-optimization as portfolio expanded</li>

          </ul>

        </div>

        <div class="case-section">

          <div class="heading">Why It Worked</div>

```



<!-- Page 92 -->

```
          <ul>

            <li>Procurement strategy scaled in step with the business</li>

            <li>Chain-level pricing on the entire portfolio</li>

            <li>Zero operational disruption across concepts</li>

          </ul>

        </div>

      </div>

    {% else %}

      <div class="section-title">A Comparable Operator's Recovery.</div>

      <div class="case-context">Case study unavailable. Please contact us for relevant
```

references.</div>

```
    {% endcase %}

  </div>

  <div class="page-footer">

    <div>FoodServiceIQ &mdash; CONFIDENTIAL</div>

    <div>Page 5</div>

  </div>

```

</div>

<!-- PAGE 6 — FINAL CTA + DISCLAIMER -->

<div class="page">

```
  <div class="page-header">

    <div class="left">

```



<!-- Page 93 -->

```
      <img src="FSIQ_LOGO_DARK_URL" alt="FoodServiceIQ">

      <span class="client">{{ restaurantName }}</span>

    </div>

    <div class="right">Next Step</div>

  </div>

  <div class="page-content">

    <div class="final-cta-wrap">

      <div class="final-cta-eyebrow">Your Full Analysis</div>

      <div class="final-cta-title">Let's see what {{ restaurantName }}'s real number looks
```

like.</div>

```
      <div class="final-cta-body">

        The figures in this report are conservative, built from your profile alone. A full analysis
```

cross-references your invoices, contracts, and SKU mix against the same pricing architecture
used by national chains.

```
      </div>

      <a href="https://calendly.com/neil-foodserviceiq/15-minute-meeting-clone-1">Book Your
```

<span class="accent">Free</span> Analysis Call</a>

```
      <div class="what-to-expect">

        <h4>What to Expect on the 30-Minute Call</h4>

        <ul>

          <li>Walk through your actual SKU-level pricing, not just profile-level estimates</li>

          <li>Identify your top three highest-leverage savings categories</li>

          <li>Review your current distributor agreement against chain-level benchmarks</li>

```



<!-- Page 94 -->

```
          <li>No commitment, no upfront cost. We're paid only on verified savings delivered.</li>

        </ul>

      </div>

      <div class="disclaimer">

        *Results reflect aggregated data from FoodServiceIQ LLC, its affiliates, and the leadership
```

team's historical work with similar organizations. Actual results may vary. Figures and results
presented reflect outcomes from FoodServiceIQ LLC ("FSIQ") and its affiliated entities. Some
data may be aggregated, anonymized, or used for illustrative purposes. Savings and
performance outcomes depend on numerous factors, including existing contracts, market
conditions, supplier participation, and implementation efforts.

```
      </div>

    </div>

  </div>

  <div class="page-footer">

    <div>FoodServiceIQ &mdash; CONFIDENTIAL</div>

    <div>Page 6</div>

  </div>

```

</div>

</body>

</html>

23. QA Checklist
Run this after every build or update. Do not skip.



<!-- Page 95 -->

Qualified Path Test
1.​ Submit the GHL form with your own email, a real restaurant website, and annual spend
of $1M - $3M.
2.​ In Zapier History — confirm the run enters the Qualified path.
3.​ Step 3: websiteStatus is 200 or 403 (not 404). websiteLogoHints has at least one
entry.
4.​ Step 4: qualified = true, finalPct in 5–8% range, dollarEstimate is
sensible, dqReason = null.
5.​ Step 13: websiteText has content, websiteLogoHints populated.
6.​ Step 15: parseOk = true, hasLogo = true or false with sensible fallback,
businessSummary populated.
7.​ Step 18: allNarrativesPresent = true, each narrative 50–80 words, no
em-dashes or en-dashes.
8.​ Step 19: download_url populated, status = success.
9.​ Open download_url — visually QA all 6 pages:
-​
P1 Cover: Client logo (or IQ fallback), FSIQ wordmark, 4 columns (Prepared For
/ Concept / Footprint / Annual Food Spend), restaurant name properly
capitalized.
-​
P2: Percentage shows 1 decimal (e.g. 7.4%), bars visibly different heights with
Year 5 tallest, en-dashes in spend tier (not hyphens), chart bars not all same
height.
-​
P3: "The structural drivers behind the overpayment" headline, 3 narrative blocks
with real content, no em/en-dashes in prose.
-​
P4: 4 quadrants with green SVG icons, "Book Your Full Analysis Call" button is
clickable and routes to Calendly.
-​
P5: Correct case study for the spend + locations combo, hero stats + quote +
Key Challenges / Our Approach / Why It Worked.
-​
P6: "Book Your Free Analysis Call" is clickable and routes to Calendly, disclaimer
left-aligned, footer reads FoodServiceIQ — CONFIDENTIAL.
-​
All pages: Inter font rendered (not Helvetica/system fallback), headers/footers
not overlapping content.
10.​Check inbox: email arrives with dark green PDF button + green Calendly button, both
clickable.
Disqualified Path Tests (run all 3)
Test input
Expected DQ path
Expected email subject
Restaurant name:
McDonalds, normal spend
national_chain
"About your FoodServiceIQ
submission"



<!-- Page 96 -->

Test input
Expected DQ path
Expected email subject
Website:
https://thisurldoesnot
exist999abc.com, normal
spend
invalid_website (404)
"Quick check on your
FoodServiceIQ submission"
Annual spend: 200 (parses to
$200K, below threshold)
below_threshold
"Thanks for using
FoodServiceIQ's Food Cost
Analyzer"

For each: confirm no Claude steps fire, no PDFMonkey step fires, and the correct DQ email
arrives.
Cloudflare Test (important)
Submit with https://spiritscenla.com as the website. This is a Cloudflare-protected site.

-​
Step 3 should return websiteStatus = 200 or 403 (NOT 0 or 404)
-​
Step 4 should mark qualified = true (assuming spend > $500K)
-​
Lead should proceed to the Qualified path

If this fails, the browser User-Agent headers in Step 3 may need updating.
Spend Parser Edge Cases
Input
Expected bucket
1
$1M–$3M (bare number = millions)
500
$500K–$800K (bare number = thousands)
500k
$500K–$800K
1-2M
$1M–$3M (range midpoint = $1.5M)
one million
$1M–$3M
depends
$1M–$3M (fallback, parseFallback =
true)
on mllion
$1M–$3M (typo tolerance)



<!-- Page 97 -->

24. Known Issues & Maintenance
Logo not appearing on cover
Cause: hasLogo = true but logoUrl is a broken URL.​
Fix: The template includes an onerror handler that swaps in the IQ fallback logo. If you still
see a broken image box, check that FSIQ_IQ_LOGO_URL in the template points to a valid
image.

Root prevention: Step 15 validates logo URLs before passing them to PDFMonkey. Only URLs
starting with http, longer than 15 chars, with no spaces, and not matching known placeholders
will be marked hasLogo = true.
Cloudflare-protected sites returning 0 status
Cause: The website fetch timing out or the User-Agent still being flagged.​
Fix in Step 3 and Step 13: Update the User-Agent string to a current Chrome version if
needed. Status 0 is treated as "valid" in Step 4 (only 404 disqualifies), so this shouldn't cause
false DQs.
Narratives contain em-dashes
Cause: Claude occasionally ignores punctuation rules.​
Fix: Step 18's stripDashes() function catches and replaces them as a safety net. If
em-dashes still appear in PDFs, verify that Step 18's claudeResponse input is mapping the
correct field from Step 17.
PDFMonkey template not rendering
Common causes:

-​
FSIQ_LOGO_DARK_URL, FSIQ_LOGO_LIGHT_URL, or FSIQ_IQ_LOGO_URL
placeholders still in the HTML
-​
Sample data JSON has mismatched variable names
-​
Template ID in Step 19 is wrong or the template was deleted
Updating the Calendly URL
Find and replace
https://calendly.com/neil-foodserviceiq/15-minute-meeting-clone-1 in:

-​
Step 21 email HTML (qualified email) — 1 instance
-​
Step 6 email HTML (invalid website DQ) — 1 instance



<!-- Page 98 -->

-​
PDFMonkey template HTML — 2 instances (Page 4 and Page 6 CTAs)
Updating case study content
Case study text is hardcoded in the PDFMonkey template HTML (§22b). Edit the {% when
"..." %} blocks directly in PDFMonkey.
Adding a new national chain
Add the lowercased, normalized chain name(s) to the NATIONAL_CHAINS array in Step 4's
JavaScript code. Include common variations (with/without apostrophe, with/without "the", etc.).
Changing the $500K qualification threshold
In Step 4, find annualSpend < 500000 and update the value. Also update the copy in Step
8's DQ email.

End of FSIQ Food Cost Analyzer Build SOP v3.3

