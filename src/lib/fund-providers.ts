// Heuristic classifier that maps a 13F holding to its ETF/fund provider.
//
// A 13F information table only exposes nameOfIssuer, titleOfClass and cusip —
// there is no field flagging a position as an ETF or naming its provider. So we
// detect funds by matching the issuer name against a curated table of provider
// brand patterns. This is best-effort: it reliably catches the major providers
// (the ones users compare) but won't recognize every obscure fund. Unrecognized
// funds that still look like ETFs fall into a generic "Other ETF / fund" bucket;
// everything else is treated as an individual security.

export const OTHER_FUND = "Other ETF / fund";

interface ProviderRule {
  provider: string;
  patterns: RegExp[];
}

// Ordered most-specific first so a more precise brand wins over a generic one.
// Patterns are tested against the UPPERCASED issuer name.
export const PROVIDERS: ProviderRule[] = [
  { provider: "BlackRock (iShares)", patterns: [/\bISHARES\b/, /\bBLACKROCK\b.*\bETF\b/] },
  { provider: "Vanguard", patterns: [/\bVANGUARD\b/] },
  {
    provider: "State Street (SPDR)",
    patterns: [/\bSPDR\b/, /SELECT SECTOR/, /\bSTREETTRACKS\b/],
  },
  { provider: "Invesco", patterns: [/\bINVESCO\b/, /\bPOWERSHARES\b/, /\bQQQ\b/] },
  { provider: "Charles Schwab", patterns: [/SCHWAB STRATEGIC/, /\bSCHWAB\b.*\bETF\b/] },
  { provider: "First Trust", patterns: [/FIRST TRUST/] },
  { provider: "WisdomTree", patterns: [/WISDOMTREE/] },
  { provider: "ProShares", patterns: [/PROSHARES/] },
  { provider: "Direxion", patterns: [/DIREXION/] },
  { provider: "VanEck", patterns: [/VANECK/, /MARKET VECTORS/] },
  { provider: "Global X", patterns: [/GLOBAL X/] },
  { provider: "Dimensional (DFA)", patterns: [/DIMENSIONAL/] },
  { provider: "Fidelity", patterns: [/FIDELITY COVINGTON/, /\bFIDELITY\b.*\bETF\b/] },
  { provider: "JPMorgan", patterns: [/JPMORGAN.*\bETF\b/, /\bJPM\b.*\bETF\b/, /J P MORGAN.*\bETF\b/] },
  { provider: "Grayscale", patterns: [/GRAYSCALE/] },
  { provider: "ARK", patterns: [/\bARK\b.*\bETF\b/, /ARK INNOVATION|ARK INNVTN|ARKK/] },
];

/**
 * Classify a holding by ETF/fund provider.
 *
 * Returns the provider's display name when the issuer matches a known brand;
 * otherwise returns OTHER_FUND when the position still looks like an ETF (the
 * word "ETF" appears in the class or issuer); otherwise null — an individual
 * security that is excluded from the fund breakdown.
 */
export function classifyFund(issuer: string, titleOfClass: string): string | null {
  const name = (issuer || "").toUpperCase();
  for (const rule of PROVIDERS) {
    if (rule.patterns.some((p) => p.test(name))) return rule.provider;
  }
  const cls = (titleOfClass || "").toUpperCase();
  if (/\bETF\b/.test(cls) || /\bETF\b/.test(name)) return OTHER_FUND;
  return null;
}
