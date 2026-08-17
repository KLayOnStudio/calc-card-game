// Procedurally-generated weekly practice content, per class.
//
// Instead of a fixed hand-authored pool, each week's pairs are GENERATED on
// the fly from a weighted mix of "categories" (power rule on a plain
// monomial, sum of monomials, etc.) so every playthrough is different.
// Weeks are cumulative: playing "Week N" blends every week 1..N's
// categories together (each week keeps its own internal weighting), so
// earlier material keeps getting reinforced all semester.
//
// To add a new week: append an entry to that class's array in
// WEEKLY_CURRICULUM below. Nothing else needs to change — the Week dropdown,
// auto-detection, and generation all read from this list.

const SEMESTER_START = "2026-08-20";

function pickInt(min, max) {
  return min + Math.floor(Math.random() * (max - min + 1));
}

function pickFrom(list) {
  return list[Math.floor(Math.random() * list.length)];
}

// Exponents are mostly small (0-10). When a week allows it, occasionally
// mixes in a "big but round" exponent instead, per the user's "throw in
// some large numbers like 100" request.
function pickExponent(allowBig) {
  if (allowBig && Math.random() < 0.2) return pickFrom([20, 50, 100]);
  return pickInt(0, 10);
}

// Coefficients are mostly small ints, occasionally a round "big" number —
// round coefficients keep coef*exponent (the derivative's coefficient)
// easy to compute even when paired with a big exponent.
function pickCoefficient() {
  if (Math.random() < 0.3) return pickFrom([10, 20, 50, 100]);
  return pickInt(2, 9);
}

// Renders coef*x^exp as LaTeX, following normal conventions: exponent 0
// collapses to just the coefficient (a constant), exponent 1 drops the
// "^1", and coefficient 1 is omitted (but not dropped for exp === 0, where
// the coefficient IS the whole value).
function formatMonomial(coef, exp) {
  if (exp === 0) return String(coef);
  const varPart = exp === 1 ? "x" : `x^{${exp}}`;
  const coefPart = coef === 1 ? "" : String(coef);
  return `${coefPart}${varPart}`;
}

function powerRuleDerivative(coef, exp) {
  if (exp === 0) return "0";
  return formatMonomial(coef * exp, exp - 1);
}

const CONTENT_CATEGORIES = {
  monomial: (allowBig) => {
    const n = pickExponent(allowBig);
    return { func: formatMonomial(1, n), deriv: powerRuleDerivative(1, n), variable: "x" };
  },
  sumOfMonomials: (allowBig) => {
    const n = pickExponent(allowBig);
    const m = pickExponent(allowBig);
    return {
      func: `${formatMonomial(1, n)} + ${formatMonomial(1, m)}`,
      deriv: `${powerRuleDerivative(1, n)} + ${powerRuleDerivative(1, m)}`,
      variable: "x",
    };
  },
  monomialWithCoefficient: (allowBig) => {
    const a = pickCoefficient();
    const n = pickExponent(allowBig);
    return { func: formatMonomial(a, n), deriv: powerRuleDerivative(a, n), variable: "x" };
  },
  linearCombination: (allowBig) => {
    const a = pickCoefficient();
    const b = pickCoefficient();
    const n = pickExponent(allowBig);
    const m = pickExponent(allowBig);
    return {
      func: `${formatMonomial(a, n)} + ${formatMonomial(b, m)}`,
      deriv: `${powerRuleDerivative(a, n)} + ${powerRuleDerivative(b, m)}`,
      variable: "x",
    };
  },
};

// Cumulative weekly curriculum per class. `categories` weights should sum
// to 1 within a week. `allowBig` controls whether that week's exponents can
// roll a big round value (20/50/100) instead of the usual 0-10.
//
// Weeks 1-2 are identical for both classes per the user (2026-08-17).
// Math 204-1 should never use trig functions — keep that in mind when
// adding future weeks for that class specifically.
const WEEKLY_CURRICULUM = {
  "Math 204-1": [
    { categories: [{ key: "monomial", weight: 0.8 }, { key: "sumOfMonomials", weight: 0.2 }], allowBig: false },
    { categories: [{ key: "monomialWithCoefficient", weight: 0.8 }, { key: "linearCombination", weight: 0.2 }], allowBig: true },
  ],
  "Math 207": [
    { categories: [{ key: "monomial", weight: 0.8 }, { key: "sumOfMonomials", weight: 0.2 }], allowBig: false },
    { categories: [{ key: "monomialWithCoefficient", weight: 0.8 }, { key: "linearCombination", weight: 0.2 }], allowBig: true },
  ],
};

function getAvailableWeeks(className) {
  return (WEEKLY_CURRICULUM[className] || []).map((_, i) => i + 1);
}

function getCurrentWeekNumber(className) {
  const available = getAvailableWeeks(className);
  if (available.length === 0) return 1;

  const start = new Date(SEMESTER_START);
  const diffDays = Math.floor((Date.now() - start.getTime()) / (24 * 60 * 60 * 1000));
  const rawWeek = Math.floor(diffDays / 7) + 1;

  return Math.min(Math.max(rawWeek, 1), available.length);
}

function weightedPick(entries) {
  const total = entries.reduce((sum, e) => sum + e.weight, 0);
  let roll = Math.random() * total;
  for (const entry of entries) {
    if (roll < entry.weight) return entry;
    roll -= entry.weight;
  }
  return entries[entries.length - 1];
}

function generateOnePair(className, weekNumber) {
  const weeks = (WEEKLY_CURRICULUM[className] || []).slice(0, weekNumber);
  const pool = weeks.flatMap((week) => week.categories.map((cat) => ({ ...cat, allowBig: week.allowBig })));
  const chosen = weightedPick(pool);
  return CONTENT_CATEGORIES[chosen.key](chosen.allowBig);
}

// Generates `pairCount` pairs with no duplicate expression text across
// either side (same uniqueness guarantee the old hand-authored pool had —
// two cards showing identical text would be an ambiguous match).
function generateSessionPairs(className, weekNumber, pairCount) {
  const usedTexts = new Set();
  const pairs = [];
  let attempts = 0;

  while (pairs.length < pairCount && attempts < pairCount * 50) {
    attempts++;
    const generated = generateOnePair(className, weekNumber);
    if (usedTexts.has(generated.func) || usedTexts.has(generated.deriv)) continue;
    usedTexts.add(generated.func);
    usedTexts.add(generated.deriv);
    pairs.push({ id: pairs.length + 1, ...generated });
  }

  return pairs;
}
