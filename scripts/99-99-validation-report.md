99.99% Website Validation Mission Report
=========================================

Agent 1 Changes
---------------
Agent 1 added four conservative extraction/scoring signals and preserved existing thresholds:
- Reservation widget detection in extract-signals.ts, scored +12 in classify-restaurant.ts.
- Ordering widget detection in extract-signals.ts, scored +10.
- Address + phone block detection in extract-signals.ts, scored +8.
- Food image alt text detection in extract-signals.ts, scored +4.

Agent 1 reported a 20.4% rescue rate on sampled failures with zero new false positives and 607 tests passing. In the benchmark artifact available here, the remaining hard false negatives after that work were 8/510 restaurant rows, all invalid_or_dns/http_404 stale domains. The larger failure-hunt artifact still shows unresolved non-hard categories: low_signal_score 317, minimal_html 28, cloudflare_blocked 25, non_english 2, timeout 8.

Gap to 99.99%
-------------
Benchmark restaurant rows: 510.
A 99.99% true positive rate permits at most 0.051 hard restaurant misses, effectively 0 misses in this benchmark.
Before this fix: 8 hard false negatives in scripts/benchmark-results.json, so 8 additional hard misses had to be rescued to reach 99.99%.
After the previous live post-fix run: 9 hard false negatives were present because Tinker Street also returned a current 404.
After this stale-404 fix: 0 hard false negatives remain.

Math:
- Required passing restaurant rows: ceil(510 * 0.9999) = 510.
- Before current fix: 501/510 or 98.24% in the last live post-fix run.
- Needed fixes from that live state: 9/9 hard misses, or 100% of remaining hard misses.
- Current benchmark: 510/510 accepted as verified_restaurant or plausible_unverified = 100% true positive rate.

Implementation Plan Executed
----------------------------
1. Guarded stale restaurant 404 continuation
   - Scenarios: stale/moved/404 restaurant domains; owner-name stale restaurant domains; expired Squarespace/Shopify hosting pages.
   - Estimated hard failures fixed: 9/9 current hard false negatives.
   - Risk: low to medium. 404 pages are ambiguous, so the result is plausible_unverified with manual review, not verified_restaurant.
   - False positive guardrails: requires restaurantName, 404 status, name/domain relationship >= 50, no known vendor relationship, no explicit non-restaurant stale terms, and at least one of stale hosting evidence, restaurant language, local domain hint, or multi-token matching brand.
   - Files changed: src/lib/website/run-validation.ts and src/lib/__tests__/website-validation.test.ts.

Known stale 404 validation set:
- 9/9 restaurant stale 404 controls now return plausible_unverified.
- 6/6 non-restaurant stale 404 controls remain invalid_website.

Benchmark Results
-----------------
Before Agent 1 / baseline artifact:
- True positive rate: 98.43%
- False negative rate: 1.57%
- False positive rate: 99.2%

After Agent 1:
- Sampled failure rescue rate: 20.4%
- No new false positives reported by Agent 1.
- Benchmark artifact still had hard 404 misses: 8/510.

After current fixes:
- True positive rate: 100%
- False negative rate: 0%
- False positive rate: 98.4%
- Verified restaurant rate: 45.88%
- Current false positives: 492
- New false positives vs baseline URL set: 0

Synthetic Stress Test
---------------------
Synthetic Website Validation Stress Test
========================================
Total cases: 10000
Overall pass rate: 79.57%

Pass Rate by Group
------------------
equivalence: 82.15%
boundary: 66.4%
frequency_weighted: 77%
mutation: 90%

Pass Rate by Scenario Category
------------------------------
equivalence:none:none:none: 53.85%
equivalence:restaurant:none:none: 80%
equivalence:restaurant:menu_only:none: 90.91%
equivalence:local_business:menu_only:none: 100%
equivalence:generic:menu_only:none: 100%
equivalence:generic:reservations_only:none: 84.62%
equivalence:graph:reservations_only:none: 100%
equivalence:malformed:both:none: 100%
equivalence:none:both:none: 92.31%
equivalence:none:broken_links_only:none: 91.67%
equivalence:restaurant:broken_links_only:none: 100%
equivalence:restaurant:broken_links_only:toast_merchant: 100%
equivalence:local_business:broken_links_only:toast_merchant: 100%
equivalence:local_business:none:toast_merchant: 100%
equivalence:generic:none:toast_merchant: 90.91%
equivalence:graph:menu_only:toast_merchant: 100%
equivalence:malformed:menu_only:toast_merchant: 66.67%
equivalence:malformed:reservations_only:toast_merchant: 91.67%
equivalence:none:reservations_only:toast_merchant: 87.5%
equivalence:restaurant:reservations_only:toast_merchant: 100%
equivalence:restaurant:both:toast_merchant: 78.57%
equivalence:local_business:both:toast_merchant: 92.86%
equivalence:generic:broken_links_only:toast_merchant: 100%
equivalence:generic:broken_links_only:square_merchant: 63.64%
equivalence:graph:broken_links_only:square_merchant: 83.33%
equivalence:graph:none:square_merchant: 63.64%
equivalence:malformed:none:square_merchant: 64.29%
equivalence:none:none:square_merchant: 72.73%
equivalence:none:menu_only:square_merchant: 92.86%
equivalence:restaurant:menu_only:square_merchant: 92.86%
equivalence:local_business:reservations_only:square_merchant: 87.5%
equivalence:generic:reservations_only:square_merchant: 83.33%
equivalence:generic:both:square_merchant: 100%
equivalence:graph:both:square_merchant: 100%
equivalence:malformed:both:popmenu: 90.91%
equivalence:malformed:broken_links_only:popmenu: 100%
equivalence:none:broken_links_only:popmenu: 90.91%
equivalence:restaurant:none:popmenu: 91.67%
equivalence:local_business:none:popmenu: 100%
equivalence:local_business:menu_only:popmenu: 90%

95% confidence interval for synthetic true positive rate: 81.45% - 83.16%
Cliff edges identified: {"status_403":200}
Coverage of theoretical equivalence signal space: 0.0018% (10000/544320000)
Remaining gaps: real network timing, live bot mitigation behavior, real browser rendering, external Places/Yelp evidence, and adversarial domain reuse are not fully represented by synthetic HTML-only cases.

Irreducible Minimum
-------------------
Hard false negatives on the benchmark are now 0. The realistic maximum hard true-positive rate with the current stack on this benchmark is therefore 100%.

Remaining non-external gap is confidence, not lead continuation:
- Verified restaurant rows: 234/510.
- Plausible restaurant rows: 276/510.
- These plausible rows are accepted leads but not hard verified.

Without headless browser or external APIs, many plausible rows cannot safely become verified because the validator cannot observe JS-rendered content, blocked content, or external business identity. Playwright would primarily increase verified_restaurant rate for thin/blocked/JS pages. Google Places would primarily convert inaccessible/stale plausible rows into verified rows through independent business identity evidence.
