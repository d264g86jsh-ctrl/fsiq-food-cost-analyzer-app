// Narrative angle definitions for the AI Narrative Builder.
// Each angle represents a distinct submission archetype with tailored guidance
// for the three narrative sections (distributor, procurement, SKU).
// Angle selection is deterministic — computed from form inputs before any AI call.

export type NarrativeAngleId =
  | 'captive_buyer'
  | 'fragmented_buyer'
  | 'gpo_member'
  | 'multi_unit_operator'
  | 'premium_independent'
  | 'optimized_buyer';

export interface NarrativeAngle {
  id: NarrativeAngleId;
  name: string;
  coreMessage: string;
  tone: 'urgent' | 'analytical' | 'sophisticated' | 'strategic' | 'respectful';
  triggerCondition: string;

  distributorGuidance: string;
  procurementGuidance: string;
  skuGuidance: string;

  avoidance: string[];
  talkingPoints: string[];
  estimatedCoverage: number; // % of qualified submissions
}

export const NARRATIVE_ANGLES: Record<NarrativeAngleId, NarrativeAngle> = {

  captive_buyer: {
    id: 'captive_buyer',
    name: 'The Captive Buyer',
    coreMessage: 'Your distributor is setting your food cost — you are not.',
    tone: 'urgent',
    triggerCondition: 'broadliner + market_price_single',
    distributorGuidance: 'Frame broadline dependence as controllable risk, not permanent condition. Avoid implying naivety — frame as "where most operators start." The goal is to show that the relationship can be renegotiated from the same distributor.',
    procurementGuidance: 'Market price buying is the entry point, not a locked-in fate. Emphasize understanding what "market price" actually means on their invoice. The first step is visibility, not switching.',
    skuGuidance: 'Proteins (chicken, beef, seafood) and dairy are where broadliner markup is highest. Frame these as the first benchmark targets because the gap between market and invoice price is most visible here.',
    avoidance: [
      'Sophisticated portfolio analysis language',
      'Multi-vendor consolidation strategy',
      'Implication the operator is naive for using a single broadliner',
    ],
    talkingPoints: [
      'A single broadline distributor without a cost-plus or bid contract sets its own margin — typically 18–28% above landed cost on proteins and staples',
      'Operators in this position have the most to gain from a benchmarking engagement because the baseline comparison is clear',
      'No switching required — the first win is usually better pricing from the incumbent distributor',
    ],
    estimatedCoverage: 25,
  },

  fragmented_buyer: {
    id: 'fragmented_buyer',
    name: 'The Fragmented Buyer',
    coreMessage: 'Multiple distributors means multiple markups — and no single point of leverage.',
    tone: 'analytical',
    triggerCondition: 'market_price_multiple (any distributor type, any size)',
    distributorGuidance: 'Do not criticize the multi-vendor approach — it often reflects intentional quality sourcing. Frame consolidation of information (not vendors) as the opportunity. The goal is a consolidated view, not fewer vendors.',
    procurementGuidance: 'Market price across multiple distributors means each relationship is priced separately with no competitive tension between them. Benchmarking surfaces the gaps without requiring vendor changes.',
    skuGuidance: 'Focus on the specific items the operator named as their key spend. Those specific items are the benchmark targets — not everything at once. Price consistency across vendors on the same item is the first finding.',
    avoidance: [
      'Suggestion to consolidate to one vendor',
      'Implication the multi-vendor approach is inefficient',
      'Language suggesting quality sourcing is the problem',
    ],
    talkingPoints: [
      'Multi-vendor purchasing creates price inconsistency — the same item may cost 12–22% more from one vendor than another in the same month',
      'Without a consolidated view, operators cannot negotiate from volume or use one vendor\'s pricing as leverage against another',
      'The opportunity is intelligence: knowing what you are paying across vendors before you go back to negotiate',
    ],
    estimatedCoverage: 20,
  },

  gpo_member: {
    id: 'gpo_member',
    name: 'The GPO Member',
    coreMessage: 'GPO membership is a floor, not a ceiling — most operators leave 2–4% on the table beyond what their contract covers.',
    tone: 'sophisticated',
    triggerCondition: 'procurementStrategy = gpo',
    distributorGuidance: 'Acknowledge the GPO relationship as a smart foundation. Frame the FSIQ engagement as extending that discipline to the uncovered 20–40% of spend outside the contract.',
    procurementGuidance: 'GPO members are cost-aware — use analytical language. Avoid suggesting their GPO is not working. Position FSIQ as identifying what the GPO does not reach, not replacing it.',
    skuGuidance: 'If the operator named proteins, those are likely outside full GPO coverage and fluctuate at market. If commodities, those move regardless of contract. Focus the narrative on the gap category.',
    avoidance: [
      '"You are probably paying too much" framing',
      'Suggestion their GPO is ineffective',
      'Skeptical tone about GPO value',
      'Implication they should exit their GPO',
    ],
    talkingPoints: [
      'GPO contracts typically cover 60–80% of a restaurant\'s spend — the gap is where markup hides',
      'Non-contract items (specialty proteins, seasonal produce, local sourcing) are often bought at market price on top of the GPO base',
      'Even on GPO-contracted items, audits frequently find the distributor applied the wrong price tier or substituted non-contracted equivalents',
    ],
    estimatedCoverage: 15,
  },

  multi_unit_operator: {
    id: 'multi_unit_operator',
    name: 'The Multi-Unit Operator',
    coreMessage: 'Every location you add increases your purchasing leverage — most multi-unit groups are not using it systematically.',
    tone: 'strategic',
    triggerCondition: 'locations = 2-4 or 5+ (applied as modifier on top of primary angles 1-3)',
    distributorGuidance: 'Emphasize the leverage multiplier of their location count. Frame consolidated buying as the unlock — the same distributor relationship looks different at two locations vs. five.',
    procurementGuidance: 'Frame procurement maturity as proportional to scale. Bigger groups can negotiate harder — but most independent multi-unit operators buy as if they are still single-unit. That gap is the opportunity.',
    skuGuidance: 'High-volume items are where consolidated buying pays. What they spend across all units on a single SKU is the real benchmark figure, not what any single location spends.',
    avoidance: [
      'Single-unit framing or individual location tactics',
      'Language implying scale does not matter',
      'Treating each location as a separate business',
    ],
    talkingPoints: [
      '2–4 locations creates natural purchasing volume, but only if buying is centralized or at least coordinated',
      '5+ units creates leverage comparable to small regional chains, but most independents do not negotiate like chains',
      'SKU rationalization across units is the highest-ROI action for established multi-unit groups',
    ],
    estimatedCoverage: 30,
  },

  premium_independent: {
    id: 'premium_independent',
    name: 'The Premium Independent',
    coreMessage: 'Premium sourcing and cost discipline are not opposites — most premium operators overpay 15–20% above true market on specialty items.',
    tone: 'respectful',
    triggerCondition: 'local_specialty distributor + fine dining or full-service concept',
    distributorGuidance: 'Affirm the sourcing philosophy. Do not challenge why they use specialty distributors. Frame FSIQ as understanding what their relationship actually costs relative to an equivalent quality benchmark.',
    procurementGuidance: 'Informal buying from trusted relationships is the most common context for specialty operators. Frame this as a vulnerability in market awareness, not a failure in buying strategy.',
    skuGuidance: 'Whatever premium items the operator named are the focal point. Those exact items are the benchmark targets — frame the analysis as quality-preserving, not cost-cutting.',
    avoidance: [
      'Any suggestion to switch to a broadliner',
      'Implication that quality could be maintained with cheaper sourcing',
      'Cost-first framing — these operators are quality-first',
      'Skepticism about the value of their sourcing relationships',
    ],
    talkingPoints: [
      'Local and specialty distributors rarely compete on price — they price to the relationship, not to a market benchmark',
      'Premium operators often accept higher per-unit costs as "the cost of quality" without knowing what true market looks like for their actual items',
      'Benchmarking specialty sourcing does not mean switching to a broadliner — it means knowing what fair market looks like for your specific ingredients',
    ],
    estimatedCoverage: 10,
  },

  optimized_buyer: {
    id: 'optimized_buyer',
    name: 'The Optimized Buyer',
    coreMessage: 'You have negotiated well — the opportunity is in execution, SKU discipline, and competitive benchmarking as markets shift.',
    tone: 'analytical',
    triggerCondition: 'procurementStrategy = negotiated_cost_plus',
    distributorGuidance: 'Acknowledge their sophistication and existing cost-plus agreements. Focus on execution risk and ongoing optimization, not renegotiation. This is a mature operator.',
    procurementGuidance: 'Lean into operational discipline: invoice audits, substitution detection, competitive benchmarking. Position FSIQ as the ongoing verification layer for a well-built procurement program.',
    skuGuidance: 'Focus on SKU rationalization and volume optimization within their existing agreements. Commodity markets move — even a cost-plus agreement can drift from fair market over 12–24 months.',
    avoidance: [
      'Suggestion their negotiation was insufficient',
      'Implication they are significantly overpaying',
      'High-drama savings projections',
      'Recommendation to fundamentally change their procurement approach',
    ],
    talkingPoints: [
      'Cost-plus agreements are sophisticated, but execution risk remains: invoice errors, substitutions, and specification drift add up',
      'Competitive benchmarking on commodities identifies where market has moved since your contract was signed',
      'SKU rationalization and volume concentration within your existing contract can unlock an additional 1–2% without renegotiation',
    ],
    estimatedCoverage: 7,
  },

};

export function getNarrativeAngle(id: NarrativeAngleId): NarrativeAngle {
  return NARRATIVE_ANGLES[id];
}
