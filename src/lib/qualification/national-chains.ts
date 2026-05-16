// National chain detection — source of truth for Phase 2 chain DQ.
// List sourced from SOP §10 plus obvious major U.S. chains (marked [v1 supplement]).
// Do not add regional or local chains. Full match or near-full match required.

export interface ChainEntry {
  name: string;
  // Normalized lowercase aliases for name matching
  aliases: string[];
  // Known brand domains (exact hostname match, no subdomains)
  domains: string[];
}

export const NATIONAL_CHAINS: ChainEntry[] = [
  // ── Fast food / QSR ───────────────────────────────────────────────────────
  { name: "McDonald's", aliases: ["mcdonald's", "mcdonalds", "mcdonald"], domains: ["mcdonalds.com"] },
  { name: "Burger King", aliases: ["burger king"], domains: ["bk.com", "burgerking.com"] },
  { name: "Wendy's", aliases: ["wendy's", "wendys"], domains: ["wendys.com"] },
  { name: "Taco Bell", aliases: ["taco bell"], domains: ["tacobell.com"] },
  { name: "Subway", aliases: ["subway"], domains: ["subway.com"] },
  { name: "Chipotle", aliases: ["chipotle", "chipotle mexican grill"], domains: ["chipotle.com"] },
  { name: "Chick-fil-A", aliases: ["chick-fil-a", "chick fil a", "chickfila"], domains: ["chick-fil-a.com"] },
  { name: "KFC", aliases: ["kfc", "kentucky fried chicken"], domains: ["kfc.com"] },
  { name: "Pizza Hut", aliases: ["pizza hut"], domains: ["pizzahut.com"] },
  { name: "Domino's", aliases: ["domino's", "dominos", "domino's pizza"], domains: ["dominos.com"] },
  { name: "Starbucks", aliases: ["starbucks"], domains: ["starbucks.com"] },
  // [v1 supplement] Dunkin' — high-volume DQ risk from paid traffic
  { name: "Dunkin'", aliases: ["dunkin", "dunkin'", "dunkin donuts", "dunkin' donuts"], domains: ["dunkindonuts.com", "dunkin.com"] },
  { name: "Panda Express", aliases: ["panda express"], domains: ["pandaexpress.com"] },
  { name: "Panera Bread", aliases: ["panera bread", "panera", "panera cafe"], domains: ["panerabread.com"] },
  { name: "Sonic", aliases: ["sonic", "sonic drive-in", "sonic drive in"], domains: ["sonicdrivein.com"] },
  { name: "Jack in the Box", aliases: ["jack in the box", "jackinthebox"], domains: ["jackinthebox.com"] },
  { name: "Arby's", aliases: ["arby's", "arbys"], domains: ["arbys.com"] },
  { name: "Popeyes", aliases: ["popeyes", "popeyes louisiana kitchen"], domains: ["popeyes.com"] },
  // [v1 supplement]
  { name: "Shake Shack", aliases: ["shake shack"], domains: ["shakeshack.com"] },
  { name: "Five Guys", aliases: ["five guys"], domains: ["fiveguys.com"] },
  { name: "Wingstop", aliases: ["wingstop"], domains: ["wingstop.com"] },
  { name: "Buffalo Wild Wings", aliases: ["buffalo wild wings", "bdubs", "bww"], domains: ["buffalowildwings.com"] },
  { name: "Raising Cane's", aliases: ["raising cane's", "raising canes", "cane's"], domains: ["raisingcanes.com"] },
  { name: "Culver's", aliases: ["culver's", "culvers"], domains: ["culvers.com"] },
  // [v1 supplement] In-N-Out — California/Southwest paid traffic risk
  { name: "In-N-Out Burger", aliases: ["in-n-out", "in n out", "in-n-out burger"], domains: ["in-n-out.com"] },
  { name: "Whataburger", aliases: ["whataburger"], domains: ["whataburger.com"] },
  { name: "Smashburger", aliases: ["smashburger"], domains: ["smashburger.com"] },
  { name: "Bojangles", aliases: ["bojangles", "bojangles'"], domains: ["bojangles.com"] },
  { name: "Church's Chicken", aliases: ["church's chicken", "churchs chicken", "church's texas chicken"], domains: ["churchs.com"] },
  { name: "Del Taco", aliases: ["del taco"], domains: ["deltaco.com"] },
  { name: "Carl's Jr.", aliases: ["carl's jr", "carl's jr.", "carls jr"], domains: ["carlsjr.com"] },
  { name: "Hardee's", aliases: ["hardee's", "hardees"], domains: ["hardees.com"] },
  { name: "El Pollo Loco", aliases: ["el pollo loco"], domains: ["elpolloloco.com"] },
  { name: "Zaxby's", aliases: ["zaxby's", "zaxbys"], domains: ["zaxbys.com"] },
  // ── Casual dining ─────────────────────────────────────────────────────────
  { name: "Applebee's", aliases: ["applebee's", "applebees"], domains: ["applebees.com"] },
  { name: "Chili's", aliases: ["chili's", "chilis", "chili's grill & bar"], domains: ["chilis.com"] },
  { name: "TGI Fridays", aliases: ["tgi fridays", "tgi friday's", "fridays"], domains: ["tgifridays.com"] },
  { name: "Olive Garden", aliases: ["olive garden"], domains: ["olivegarden.com"] },
  { name: "Red Lobster", aliases: ["red lobster"], domains: ["redlobster.com"] },
  { name: "LongHorn Steakhouse", aliases: ["longhorn steakhouse", "longhorn"], domains: ["longhornsteakhouse.com"] },
  { name: "Outback Steakhouse", aliases: ["outback steakhouse", "outback"], domains: ["outback.com"] },
  { name: "Texas Roadhouse", aliases: ["texas roadhouse"], domains: ["texasroadhouse.com"] },
  { name: "Cracker Barrel", aliases: ["cracker barrel"], domains: ["crackerbarrel.com"] },
  { name: "The Cheesecake Factory", aliases: ["the cheesecake factory", "cheesecake factory"], domains: ["thecheesecakefactory.com"] },
  { name: "Red Robin", aliases: ["red robin"], domains: ["redrobin.com"] },
  { name: "Hooters", aliases: ["hooters"], domains: ["hooters.com"] },
  { name: "Denny's", aliases: ["denny's", "dennys"], domains: ["dennys.com"] },
  { name: "IHOP", aliases: ["ihop", "international house of pancakes"], domains: ["ihop.com"] },
  { name: "Waffle House", aliases: ["waffle house"], domains: ["wafflehouse.com"] },
  { name: "Golden Corral", aliases: ["golden corral"], domains: ["goldencorral.com"] },
  { name: "Bob Evans", aliases: ["bob evans"], domains: ["bobevans.com"] },
  // ── Fast casual ───────────────────────────────────────────────────────────
  { name: "Noodles & Company", aliases: ["noodles & company", "noodles and company", "noodles"], domains: ["noodles.com"] },
  { name: "Moe's Southwest Grill", aliases: ["moe's southwest grill", "moes southwest grill", "moe's"], domains: ["moes.com"] },
  { name: "Qdoba", aliases: ["qdoba", "qdoba mexican eats"], domains: ["qdoba.com"] },
  { name: "Corner Bakery Cafe", aliases: ["corner bakery", "corner bakery cafe"], domains: ["cornerbakerycafe.com"] },
  { name: "Jason's Deli", aliases: ["jason's deli", "jasons deli"], domains: ["jasonsdeli.com"] },
  { name: "McAlister's Deli", aliases: ["mcalister's deli", "mcalisters deli", "mcalister's"], domains: ["mcalistersdeli.com"] },
  { name: "Schlotzsky's", aliases: ["schlotzsky's", "schlotzskys"], domains: ["schlotzskys.com"] },
  { name: "Firehouse Subs", aliases: ["firehouse subs"], domains: ["firehousesubs.com"] },
  { name: "Jimmy John's", aliases: ["jimmy john's", "jimmy johns"], domains: ["jimmyjohns.com"] },
  { name: "Potbelly", aliases: ["potbelly", "potbelly sandwich shop"], domains: ["potbelly.com"] },
  { name: "Jersey Mike's", aliases: ["jersey mike's", "jersey mikes"], domains: ["jerseymikes.com"] },
  { name: "Which Wich", aliases: ["which wich"], domains: ["whichwich.com"] },
  { name: "Steak 'n Shake", aliases: ["steak 'n shake", "steak n shake", "steak and shake"], domains: ["steaknshake.com"] },
  { name: "Dave & Buster's", aliases: ["dave & buster's", "dave and busters", "dave & busters"], domains: ["daveandbusters.com"] },
];

export interface ChainDetectionResult {
  isChain: boolean;
  matchedChain: string | null;
  score: number; // 0, 50, 85, or 100
  matchSource: 'name' | 'domain' | 'page_content' | null;
}

const CHAIN_TEXT_SIGNALS = [
  'find a location near you',
  'find a restaurant near you',
  'over .+ locations nationwide',
  'corporate office',
  'investor relations',
  'franchise opportunities',
];

export function detectNationalChain(options: {
  restaurantName: string;
  domain: string;
  pageTitle?: string;
  ogSiteName?: string;
  bodyText?: string;
}): ChainDetectionResult {
  const { restaurantName, domain, pageTitle, ogSiteName, bodyText } = options;

  const nameLower = restaurantName.trim().toLowerCase();
  const domainLower = domain.replace(/^www\./, '').toLowerCase();

  for (const chain of NATIONAL_CHAINS) {
    // 1. Domain match (highest confidence)
    if (chain.domains.some((d) => domainLower === d || domainLower.endsWith(`.${d}`))) {
      return { isChain: true, matchedChain: chain.name, score: 100, matchSource: 'domain' };
    }

    // 2. Name match against aliases (full match, not substring)
    if (chain.aliases.some((alias) => isFullMatch(nameLower, alias))) {
      return { isChain: true, matchedChain: chain.name, score: 100, matchSource: 'name' };
    }
  }

  // 3. Page title / og:site_name match
  const titleLower = (pageTitle ?? '').toLowerCase();
  const ogLower = (ogSiteName ?? '').toLowerCase();
  for (const chain of NATIONAL_CHAINS) {
    if (chain.aliases.some((alias) => isFullMatch(titleLower, alias) || isFullMatch(ogLower, alias))) {
      return { isChain: true, matchedChain: chain.name, score: 85, matchSource: 'page_content' };
    }
  }

  // 4. Body text signals (lower confidence)
  if (bodyText) {
    const lower = bodyText.toLowerCase();
    const hasChainSignal = CHAIN_TEXT_SIGNALS.some((sig) => new RegExp(sig, 'i').test(lower));
    if (hasChainSignal) {
      return { isChain: false, matchedChain: null, score: 50, matchSource: 'page_content' };
    }
  }

  return { isChain: false, matchedChain: null, score: 0, matchSource: null };
}

// Full-word match: alias must appear as a complete token (not partial substring of another word)
function isFullMatch(haystack: string, needle: string): boolean {
  if (!needle || !haystack) return false;
  const escaped = needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(^|[^a-z0-9])${escaped}([^a-z0-9]|$)`, 'i').test(haystack);
}
