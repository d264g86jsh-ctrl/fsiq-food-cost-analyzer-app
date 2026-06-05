// National chain detection — source of truth for Phase 2 chain DQ.
// Covers all major U.S. chains with 50+ locations (QSR, fast casual, casual dining,
// upscale, breakfast, pizza, coffee, dessert, Asian, Mexican, steakhouse, seafood, wings).
// Full-word match or domain match required — no substring matching.

export interface ChainEntry {
  name: string;
  // Normalized lowercase aliases for name matching
  aliases: string[];
  // Known brand domains (exact hostname match, no subdomains)
  domains: string[];
}

export const NATIONAL_CHAINS: ChainEntry[] = [

  // ── Fast Food / QSR ───────────────────────────────────────────────────────────
  { name: "McDonald's",         aliases: ["mcdonald's", "mcdonalds", "mcdonald"],               domains: ["mcdonalds.com"] },
  { name: "Burger King",        aliases: ["burger king"],                                         domains: ["bk.com", "burgerking.com"] },
  { name: "Wendy's",            aliases: ["wendy's", "wendys"],                                   domains: ["wendys.com"] },
  { name: "Taco Bell",          aliases: ["taco bell"],                                           domains: ["tacobell.com"] },
  { name: "Subway",             aliases: ["subway"],                                              domains: ["subway.com"] },
  { name: "KFC",                aliases: ["kfc", "kentucky fried chicken"],                       domains: ["kfc.com"] },
  { name: "Sonic",              aliases: ["sonic", "sonic drive-in", "sonic drive in"],           domains: ["sonicdrivein.com"] },
  { name: "Jack in the Box",    aliases: ["jack in the box", "jackinthebox"],                     domains: ["jackinthebox.com"] },
  { name: "Arby's",             aliases: ["arby's", "arbys"],                                     domains: ["arbys.com"] },
  { name: "Popeyes",            aliases: ["popeyes", "popeyes louisiana kitchen"],                domains: ["popeyes.com"] },
  { name: "Chick-fil-A",        aliases: ["chick-fil-a", "chick fil a", "chickfila"],             domains: ["chick-fil-a.com"] },
  { name: "Church's Chicken",   aliases: ["church's chicken", "churchs chicken", "church's texas chicken"], domains: ["churchs.com"] },
  { name: "Del Taco",           aliases: ["del taco"],                                            domains: ["deltaco.com"] },
  { name: "Carl's Jr.",         aliases: ["carl's jr", "carl's jr.", "carls jr"],                 domains: ["carlsjr.com"] },
  { name: "Hardee's",           aliases: ["hardee's", "hardees"],                                 domains: ["hardees.com"] },
  { name: "El Pollo Loco",      aliases: ["el pollo loco"],                                       domains: ["elpolloloco.com"] },
  { name: "Whataburger",        aliases: ["whataburger"],                                         domains: ["whataburger.com"] },
  { name: "Bojangles",          aliases: ["bojangles", "bojangles'"],                             domains: ["bojangles.com"] },
  { name: "Zaxby's",            aliases: ["zaxby's", "zaxbys"],                                   domains: ["zaxbys.com"] },
  { name: "Checkers",           aliases: ["checkers", "rally's", "rallys"],                       domains: ["checkers.com", "rallys.com"] },
  { name: "White Castle",       aliases: ["white castle"],                                        domains: ["whitecastle.com"] },
  { name: "Dairy Queen",        aliases: ["dairy queen", "dq", "dq grill & chill"],              domains: ["dairyqueen.com"] },
  { name: "Little Caesars",     aliases: ["little caesars", "little caesar's"],                   domains: ["littlecaesars.com"] },
  { name: "Papa John's",        aliases: ["papa john's", "papa johns", "papa john"],              domains: ["papajohns.com"] },
  { name: "Papa Murphy's",      aliases: ["papa murphy's", "papa murphys"],                       domains: ["papamurphys.com"] },
  { name: "Sbarro",             aliases: ["sbarro"],                                              domains: ["sbarro.com"] },
  { name: "Taco John's",        aliases: ["taco john's", "taco johns"],                          domains: ["tacojohns.com"] },
  { name: "Taco Bueno",         aliases: ["taco bueno"],                                          domains: ["tacobueno.com"] },
  { name: "Captain D's",        aliases: ["captain d's", "captain ds"],                          domains: ["captainds.com"] },
  { name: "Long John Silver's", aliases: ["long john silver's", "long john silvers", "ljs"],     domains: ["ljsilvers.com"] },
  { name: "A&W",                aliases: ["a&w", "a & w", "a and w", "a&w restaurants"],         domains: ["awrestaurants.com"] },
  { name: "Wienerschnitzel",    aliases: ["wienerschnitzel"],                                     domains: ["wienerschnitzel.com"] },
  { name: "Krystal",            aliases: ["krystal"],                                             domains: ["krystal.com"] },
  { name: "Steak 'n Shake",     aliases: ["steak 'n shake", "steak n shake", "steak and shake"], domains: ["steaknshake.com"] },

  // ── Fast Casual ───────────────────────────────────────────────────────────────
  { name: "Chipotle",           aliases: ["chipotle", "chipotle mexican grill"],                  domains: ["chipotle.com"] },
  { name: "Qdoba",              aliases: ["qdoba", "qdoba mexican eats"],                         domains: ["qdoba.com"] },
  { name: "Moe's Southwest Grill", aliases: ["moe's southwest grill", "moes southwest grill", "moe's"], domains: ["moes.com"] },
  { name: "Panera Bread",       aliases: ["panera bread", "panera", "panera cafe"],               domains: ["panerabread.com"] },
  { name: "Shake Shack",        aliases: ["shake shack"],                                         domains: ["shakeshack.com"] },
  { name: "Five Guys",          aliases: ["five guys"],                                           domains: ["fiveguys.com"] },
  { name: "Wingstop",           aliases: ["wingstop"],                                            domains: ["wingstop.com"] },
  { name: "Raising Cane's",     aliases: ["raising cane's", "raising canes", "cane's"],          domains: ["raisingcanes.com"] },
  { name: "Culver's",           aliases: ["culver's", "culvers"],                                 domains: ["culvers.com"] },
  { name: "In-N-Out Burger",    aliases: ["in-n-out", "in n out", "in-n-out burger"],             domains: ["in-n-out.com"] },
  { name: "Smashburger",        aliases: ["smashburger"],                                         domains: ["smashburger.com"] },
  { name: "Portillo's",         aliases: ["portillo's", "portillos"],                             domains: ["portillos.com"] },
  { name: "Freddy's",           aliases: ["freddy's", "freddys", "freddy's frozen custard"],      domains: ["freddys.com"] },
  { name: "Fatburger",          aliases: ["fatburger"],                                           domains: ["fatburger.com"] },
  { name: "The Habit Burger",   aliases: ["the habit burger", "the habit", "habit burger"],       domains: ["habitburger.com"] },
  { name: "Fuddruckers",        aliases: ["fuddruckers"],                                         domains: ["fuddruckers.com"] },
  { name: "MOD Pizza",          aliases: ["mod pizza", "mod super fast pizza"],                   domains: ["modpizza.com"] },
  { name: "Blaze Pizza",        aliases: ["blaze pizza", "blaze fast-fire'd pizza"],              domains: ["blazepizza.com"] },
  { name: "Pieology",           aliases: ["pieology"],                                            domains: ["pieology.com"] },
  { name: "Noodles & Company",  aliases: ["noodles & company", "noodles and company", "noodles"], domains: ["noodles.com"] },
  { name: "Sweetgreen",         aliases: ["sweetgreen"],                                          domains: ["sweetgreen.com"] },
  { name: "CAVA",               aliases: ["cava", "cava grill"],                                  domains: ["cava.com"] },
  { name: "Pei Wei",            aliases: ["pei wei", "pei wei asian diner"],                      domains: ["peiwei.com"] },
  { name: "Rubio's",            aliases: ["rubio's", "rubios", "rubio's coastal grill"],          domains: ["rubios.com"] },
  { name: "Waba Grill",         aliases: ["waba grill", "wabagrill"],                             domains: ["wabagrill.com"] },
  { name: "Genghis Grill",      aliases: ["genghis grill"],                                       domains: ["genghisgrill.com"] },
  { name: "HuHot Mongolian Grill", aliases: ["huhot", "huhot mongolian grill"],                  domains: ["huhot.com"] },
  { name: "Tropical Smoothie Cafe", aliases: ["tropical smoothie cafe", "tropical smoothie"],    domains: ["tropicalsmoothiecafe.com"] },
  { name: "Smoothie King",      aliases: ["smoothie king"],                                       domains: ["smoothieking.com"] },
  { name: "Jamba",              aliases: ["jamba", "jamba juice"],                                domains: ["jamba.com"] },
  { name: "Freshii",            aliases: ["freshii"],                                             domains: ["freshii.com"] },

  // ── Sandwich / Sub Shops ──────────────────────────────────────────────────────
  { name: "Jimmy John's",       aliases: ["jimmy john's", "jimmy johns"],                         domains: ["jimmyjohns.com"] },
  { name: "Jersey Mike's",      aliases: ["jersey mike's", "jersey mikes"],                       domains: ["jerseymikes.com"] },
  { name: "Firehouse Subs",     aliases: ["firehouse subs"],                                      domains: ["firehousesubs.com"] },
  { name: "Potbelly",           aliases: ["potbelly", "potbelly sandwich shop"],                  domains: ["potbelly.com"] },
  { name: "Jason's Deli",       aliases: ["jason's deli", "jasons deli"],                        domains: ["jasonsdeli.com"] },
  { name: "McAlister's Deli",   aliases: ["mcalister's deli", "mcalisters deli", "mcalister's"], domains: ["mcalistersdeli.com"] },
  { name: "Schlotzsky's",       aliases: ["schlotzsky's", "schlotzskys"],                         domains: ["schlotzskys.com"] },
  { name: "Which Wich",         aliases: ["which wich"],                                          domains: ["whichwich.com"] },
  { name: "Corner Bakery Cafe", aliases: ["corner bakery", "corner bakery cafe"],                 domains: ["cornerbakerycafe.com"] },
  { name: "Quiznos",            aliases: ["quiznos", "quiznos sub"],                              domains: ["quiznos.com"] },
  { name: "Togo's",             aliases: ["togo's", "togos"],                                     domains: ["togos.com"] },
  { name: "Charley's Grilled Subs", aliases: ["charley's", "charleys", "charley's grilled subs"], domains: ["charleys.com"] },

  // ── Casual Dining ─────────────────────────────────────────────────────────────
  { name: "Applebee's",         aliases: ["applebee's", "applebees"],                             domains: ["applebees.com"] },
  { name: "Chili's",            aliases: ["chili's", "chilis", "chili's grill & bar"],            domains: ["chilis.com"] },
  { name: "TGI Fridays",        aliases: ["tgi fridays", "tgi friday's", "fridays"],              domains: ["tgifridays.com"] },
  { name: "Olive Garden",       aliases: ["olive garden"],                                        domains: ["olivegarden.com"] },
  { name: "Red Lobster",        aliases: ["red lobster"],                                         domains: ["redlobster.com"] },
  { name: "LongHorn Steakhouse", aliases: ["longhorn steakhouse", "longhorn"],                   domains: ["longhornsteakhouse.com"] },
  { name: "Outback Steakhouse", aliases: ["outback steakhouse", "outback"],                       domains: ["outback.com"] },
  { name: "Texas Roadhouse",    aliases: ["texas roadhouse"],                                     domains: ["texasroadhouse.com"] },
  { name: "Cracker Barrel",     aliases: ["cracker barrel"],                                      domains: ["crackerbarrel.com"] },
  { name: "The Cheesecake Factory", aliases: ["the cheesecake factory", "cheesecake factory"],   domains: ["thecheesecakefactory.com"] },
  { name: "Red Robin",          aliases: ["red robin", "red robin gourmet burgers"],              domains: ["redrobin.com"] },
  { name: "Hooters",            aliases: ["hooters"],                                              domains: ["hooters.com"] },
  { name: "Dave & Buster's",    aliases: ["dave & buster's", "dave and busters", "dave & busters"], domains: ["daveandbusters.com"] },
  { name: "Buffalo Wild Wings", aliases: ["buffalo wild wings", "bdubs", "bww"],                 domains: ["buffalowildwings.com"] },
  { name: "Bonefish Grill",     aliases: ["bonefish grill", "bonefish"],                          domains: ["bonefishgrill.com"] },
  { name: "On The Border",      aliases: ["on the border", "on the border mexican grill"],        domains: ["ontheborder.com"] },
  { name: "Bahama Breeze",      aliases: ["bahama breeze"],                                       domains: ["bahamabreeze.com"] },
  { name: "Yard House",         aliases: ["yard house"],                                          domains: ["yardhouse.com"] },
  { name: "Seasons 52",         aliases: ["seasons 52"],                                          domains: ["seasons52.com"] },
  { name: "BJ's Restaurant",    aliases: ["bj's restaurant", "bjs restaurant", "bj's brewhouse"], domains: ["bjsrestaurants.com"] },
  { name: "Bubba Gump Shrimp",  aliases: ["bubba gump", "bubba gump shrimp"],                    domains: ["bubbagump.com"] },
  { name: "Romano's Macaroni Grill", aliases: ["romano's macaroni grill", "macaroni grill"],     domains: ["macaronigrill.com"] },
  { name: "Maggiano's",         aliases: ["maggiano's", "maggianos", "maggiano's little italy"],  domains: ["maggianos.com"] },
  { name: "Ruby Tuesday",       aliases: ["ruby tuesday"],                                        domains: ["rubytuesday.com"] },
  { name: "O'Charley's",        aliases: ["o'charley's", "ocharleys"],                           domains: ["ocharleys.com"] },
  { name: "Cheddar's",          aliases: ["cheddar's", "cheddars", "cheddar's scratch kitchen"], domains: ["cheddars.com"] },
  { name: "Logan's Roadhouse",  aliases: ["logan's roadhouse", "logans roadhouse"],               domains: ["logansroadhouse.com"] },
  { name: "Black Angus",        aliases: ["black angus", "black angus steakhouse"],               domains: ["blackangus.com"] },
  { name: "Sizzler",            aliases: ["sizzler"],                                              domains: ["sizzler.com"] },
  { name: "Golden Corral",      aliases: ["golden corral"],                                       domains: ["goldencorral.com"] },
  { name: "Old Chicago",        aliases: ["old chicago", "old chicago pizza"],                    domains: ["oldchicago.com"] },
  { name: "Black Bear Diner",   aliases: ["black bear diner"],                                    domains: ["blackbeardiner.com"] },
  { name: "Friendly's",         aliases: ["friendly's", "friendlys"],                             domains: ["friendlys.com"] },

  // ── Breakfast / Brunch Chains ─────────────────────────────────────────────────
  { name: "IHOP",               aliases: ["ihop", "international house of pancakes"],             domains: ["ihop.com"] },
  { name: "Denny's",            aliases: ["denny's", "dennys"],                                   domains: ["dennys.com"] },
  { name: "Waffle House",       aliases: ["waffle house"],                                        domains: ["wafflehouse.com"] },
  { name: "Bob Evans",          aliases: ["bob evans"],                                           domains: ["bobevans.com"] },
  { name: "Perkins",            aliases: ["perkins", "perkins restaurant"],                       domains: ["perkinsrestaurants.com"] },
  { name: "Village Inn",        aliases: ["village inn"],                                         domains: ["villageinn.com"] },
  { name: "First Watch",        aliases: ["first watch"],                                         domains: ["firstwatch.com"] },
  { name: "Huddle House",       aliases: ["huddle house"],                                        domains: ["huddlehouse.com"] },

  // ── Pizza Chains ──────────────────────────────────────────────────────────────
  { name: "Pizza Hut",          aliases: ["pizza hut"],                                           domains: ["pizzahut.com"] },
  { name: "Domino's",           aliases: ["domino's", "dominos", "domino's pizza"],               domains: ["dominos.com"] },
  { name: "Little Caesars",     aliases: ["little caesars", "little caesar's"],                   domains: ["littlecaesars.com"] },
  { name: "Papa John's",        aliases: ["papa john's", "papa johns"],                          domains: ["papajohns.com"] },
  { name: "Marco's Pizza",      aliases: ["marco's pizza", "marcos pizza"],                       domains: ["marcos.com"] },
  { name: "Godfather's Pizza",  aliases: ["godfather's pizza", "godfathers pizza"],               domains: ["godfathers.com"] },
  { name: "Round Table Pizza",  aliases: ["round table pizza", "round table"],                    domains: ["roundtablepizza.com"] },
  { name: "Hungry Howie's",     aliases: ["hungry howie's", "hungry howies"],                    domains: ["hungryhowies.com"] },
  { name: "CiCi's Pizza",       aliases: ["cici's pizza", "cicis pizza", "cici's"],              domains: ["cicispizza.com"] },
  { name: "Stevi B's Pizza",    aliases: ["stevi b's", "stevi bs"],                              domains: ["stevibspizza.com"] },
  { name: "Jet's Pizza",        aliases: ["jet's pizza", "jets pizza"],                          domains: ["jetspizza.com"] },

  // ── Coffee / Beverage Chains ──────────────────────────────────────────────────
  { name: "Starbucks",          aliases: ["starbucks"],                                           domains: ["starbucks.com"] },
  { name: "Dunkin'",            aliases: ["dunkin", "dunkin'", "dunkin donuts", "dunkin' donuts"], domains: ["dunkindonuts.com", "dunkin.com"] },
  { name: "Dutch Bros",         aliases: ["dutch bros", "dutch brothers"],                        domains: ["dutchbros.com"] },
  { name: "Caribou Coffee",     aliases: ["caribou coffee", "caribou"],                           domains: ["cariboucoffee.com"] },
  { name: "Biggby Coffee",      aliases: ["biggby", "biggby coffee"],                            domains: ["biggby.com"] },
  { name: "Peet's Coffee",      aliases: ["peet's coffee", "peets coffee", "peet's"],            domains: ["peets.com"] },
  { name: "Tim Hortons",        aliases: ["tim hortons", "tim horton's"],                         domains: ["timhortons.com"] },
  { name: "The Coffee Bean",    aliases: ["the coffee bean", "coffee bean & tea leaf", "coffee bean and tea leaf"], domains: ["coffeebean.com"] },
  { name: "Krispy Kreme",       aliases: ["krispy kreme"],                                        domains: ["krispykreme.com"] },
  { name: "Panera Bread",       aliases: ["panera bread", "panera"],                              domains: ["panerabread.com"] },

  // ── Dessert / Ice Cream Chains ────────────────────────────────────────────────
  { name: "Baskin-Robbins",     aliases: ["baskin-robbins", "baskin robbins", "baskin robbins"],  domains: ["baskinrobbins.com"] },
  { name: "Cold Stone Creamery", aliases: ["cold stone creamery", "cold stone"],                  domains: ["coldstonecreamery.com"] },
  { name: "Marble Slab Creamery", aliases: ["marble slab creamery", "marble slab"],              domains: ["marbleslab.com"] },
  { name: "Rita's Italian Ice", aliases: ["rita's italian ice", "rita's", "ritas"],              domains: ["ritasice.com"] },
  { name: "Orange Julius",      aliases: ["orange julius"],                                       domains: ["orangejulius.com"] },
  { name: "Auntie Anne's",      aliases: ["auntie anne's", "auntie annes"],                      domains: ["auntieannes.com"] },
  { name: "Cinnabon",           aliases: ["cinnabon"],                                            domains: ["cinnabon.com"] },
  { name: "Wetzel's Pretzels",  aliases: ["wetzel's pretzels", "wetzels pretzels"],              domains: ["wetzels.com"] },
  { name: "Insomnia Cookies",   aliases: ["insomnia cookies"],                                    domains: ["insomniacookies.com"] },
  { name: "Crumbl Cookies",     aliases: ["crumbl cookies", "crumbl"],                           domains: ["crumblcookies.com"] },
  { name: "Nothing Bundt Cakes", aliases: ["nothing bundt cakes", "bundt cakes"],                domains: ["nothingbundtcakes.com"] },

  // ── Upscale / Fine Dining (National Chains) ───────────────────────────────────
  { name: "Ruth's Chris Steak House", aliases: ["ruth's chris", "ruths chris", "ruth's chris steak house"], domains: ["ruthschris.com"] },
  { name: "Morton's",           aliases: ["morton's", "mortons", "morton's the steakhouse"],     domains: ["mortons.com"] },
  { name: "The Capital Grille", aliases: ["the capital grille", "capital grille"],               domains: ["thecapitalgrille.com"] },
  { name: "Fleming's Prime Steakhouse", aliases: ["fleming's", "flemings", "fleming's prime steakhouse"], domains: ["flemingssteakhouse.com"] },
  { name: "Del Frisco's",       aliases: ["del frisco's", "del friscos"],                        domains: ["delfriscos.com"] },
  { name: "Palm Restaurant",    aliases: ["the palm", "palm restaurant"],                         domains: ["thepalm.com"] },
  { name: "Fogo de Chao",       aliases: ["fogo de chao", "fogo de chão"],                       domains: ["fogodechao.com"] },
  { name: "McCormick & Schmick's", aliases: ["mccormick & schmick's", "mccormick and schmicks", "mccormick & schmick"], domains: ["mccormickandschmicks.com"] },
  { name: "Eddie V's",          aliases: ["eddie v's", "eddie vs"],                              domains: ["eddiev.com"] },
  { name: "Sullivan's Steakhouse", aliases: ["sullivan's steakhouse", "sullivans steakhouse"],   domains: ["sullivansteakhouse.com"] },
  { name: "Mastro's",           aliases: ["mastro's", "mastros"],                                domains: ["mastrosrestaurants.com"] },
  { name: "STK Steakhouse",     aliases: ["stk", "stk steakhouse"],                              domains: ["stksteakhouse.com"] },

  // ── Asian / International Chains ─────────────────────────────────────────────
  { name: "Panda Express",      aliases: ["panda express"],                                       domains: ["pandaexpress.com"] },
  { name: "P.F. Chang's",       aliases: ["p.f. chang's", "pf changs", "p.f. changs", "pf chang's"], domains: ["pfchangs.com"] },
  { name: "Benihana",           aliases: ["benihana"],                                            domains: ["benihana.com"] },

  // ── Mexican / Tex-Mex Chains ──────────────────────────────────────────────────
  { name: "Taco Bueno",         aliases: ["taco bueno"],                                          domains: ["tacobueno.com"] },
  { name: "Baja Fresh",         aliases: ["baja fresh"],                                          domains: ["bajafresh.com"] },
  { name: "Tijuana Flats",      aliases: ["tijuana flats"],                                       domains: ["tijuanaflats.com"] },
  { name: "Chronic Tacos",      aliases: ["chronic tacos"],                                       domains: ["chronictacos.com"] },

  // ── Wings / Sports Bars ───────────────────────────────────────────────────────
  { name: "Pluckers Wing Bar",  aliases: ["pluckers", "pluckers wing bar"],                       domains: ["pluckers.com"] },
  { name: "Wing Zone",          aliases: ["wing zone"],                                           domains: ["wingzone.com"] },
  { name: "WingHouse",          aliases: ["winghouse"],                                           domains: ["winghouse.com"] },

  // ── Steakhouse / BBQ Chains ───────────────────────────────────────────────────
  { name: "Dickey's Barbecue Pit", aliases: ["dickey's barbecue", "dickeys barbecue", "dickey's bbq"], domains: ["dickeys.com"] },
  { name: "Famous Dave's",      aliases: ["famous dave's", "famous daves"],                       domains: ["famousdaves.com"] },
  { name: "Sonny's BBQ",        aliases: ["sonny's bbq", "sonnys bbq"],                          domains: ["sonnysbbq.com"] },
  { name: "Smokey Bones",       aliases: ["smokey bones"],                                        domains: ["smokeybones.com"] },
  { name: "Roadhouse Grill",    aliases: ["roadhouse grill"],                                     domains: ["roadhousegrill.com"] },

  // ── Seafood Chains ────────────────────────────────────────────────────────────
  { name: "Joe's Crab Shack",   aliases: ["joe's crab shack", "joes crab shack"],                domains: ["joescrabshack.com"] },
  { name: "The Oceanaire",      aliases: ["the oceanaire", "oceanaire"],                          domains: ["theoceanaire.com"] },

  // ── Mediterranean / Other ─────────────────────────────────────────────────────
  { name: "Zoes Kitchen",       aliases: ["zoes kitchen", "zoës kitchen"],                        domains: ["zoeskitchen.com"] },
  { name: "Roti",               aliases: ["roti", "roti modern mediterranean"],                   domains: ["roti.com"] },

  // ── Legacy / Misc (100+ US locations) ────────────────────────────────────────
  { name: "Dine Brands",        aliases: [],                                                      domains: ["dinebrands.com"] },
  { name: "Ponderosa",          aliases: ["ponderosa", "ponderosa steakhouse"],                   domains: ["ponderosasteakhouses.com"] },
  { name: "Sizzler",            aliases: ["sizzler"],                                             domains: ["sizzler.com"] },
  { name: "Perkins",            aliases: ["perkins restaurant & bakery", "perkins restaurant"],   domains: ["perkinsrestaurants.com"] },
  { name: "Eat'n Park",         aliases: ["eat'n park", "eatn park"],                            domains: ["eatnpark.com"] },
  { name: "Shoney's",           aliases: ["shoney's", "shoneys"],                                 domains: ["shoneys.com"] },
  { name: "Frisch's Big Boy",   aliases: ["frisch's big boy", "frischs big boy"],                domains: ["frischs.com"] },
  { name: "Big Boy",            aliases: ["big boy"],                                             domains: ["bigboy.com"] },
  { name: "Steak 'n Shake",     aliases: ["steak 'n shake", "steak n shake"],                    domains: ["steaknshake.com"] },
  { name: "Rally's",            aliases: ["rally's", "rallys"],                                   domains: ["rallys.com"] },
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

// Full-word match: alias must appear as a complete token (not partial substring of another word).
// Excludes descriptive references like "McDonald's Style Burgers" — where the chain name is
// used as an adjective rather than a self-identification (e.g. franchise, city, store number).
const DESCRIPTIVE_QUALIFIERS = /^[\s-]*(style|styled|styles|inspired|like|type|brand|themed|based|concept)\b/i;

function isFullMatch(haystack: string, needle: string): boolean {
  if (!needle || !haystack) return false;
  const escaped = needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = new RegExp(`(^|[^a-z0-9])(${escaped})([^a-z0-9]|$)`, 'i').exec(haystack);
  if (!match) return false;
  // If the text immediately after the matched alias is a descriptive qualifier, it's NOT the chain.
  const afterAlias = haystack.slice(match.index + match[0].length);
  if (DESCRIPTIVE_QUALIFIERS.test(afterAlias)) return false;
  return true;
}
