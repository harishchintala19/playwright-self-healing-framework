import { ElementSignature } from "./HealingTypes";
import { HealingUtils } from "./HealingUtils";

export class HealingMatcher {
  static setLogger(arg0: (message: string) => void) {
    throw new Error("Method not implemented.");
  }
  static extractSelectorInfo(selector: string): {
    type?: string;
    value?: string;
    tagName?: string;
    conditions?: Array<{ type: string; value: string; tagName?: string }>;
  } {
    selector = selector.trim();

    if (selector.startsWith("#")) return { type: "id", value: selector.substring(1).toLowerCase() };
    if (selector.startsWith(".")) return { type: "class", value: selector.substring(1).toLowerCase() };

    const tagMatch = selector.match(/\/\/(\w+)/);
    const tagName = tagMatch ? tagMatch[1].toLowerCase() : undefined;

    const attrMatches = [...selector.matchAll(/@([\w-]+)\s*=\s*['"]([^'"]+)['"]/g)];
    const containsMatches = [...selector.matchAll(/contains\(@([\w-]+),'([^']+)'\)/g)];
    const startsWithMatches = [...selector.matchAll(/starts-with\(@([\w-]+),'([^']+)'\)/g)];
    const textMatches = [...selector.matchAll(/text\(\)\s*=\s*['"]([^'"]+)['"]/g)];

    const multiConditions: Array<{ type: string; value: string; tagName?: string }> = [];

    for (const m of attrMatches)
      multiConditions.push({ type: m[1].toLowerCase(), value: m[2].toLowerCase(), tagName });
    for (const m of containsMatches)
      multiConditions.push({ type: m[1].toLowerCase(), value: m[2].toLowerCase(), tagName });
    for (const m of startsWithMatches)
      multiConditions.push({ type: m[1].toLowerCase(), value: m[2].toLowerCase(), tagName });
    for (const m of textMatches)
      multiConditions.push({ type: "text", value: m[1].toLowerCase(), tagName });

    if (multiConditions.length > 1) {
      return { conditions: multiConditions, tagName };
    }

    const attrRegex = /@([\w-]+)=['"]?([^'"[\]]+)['"]?/;
    const containsRegex = /contains\(@([\w-]+),'([^']+)'\)/;
    const startsWithRegex = /starts-with\(@([\w-]+),'([^']+)'\)/;
    const textRegex = /normalize-space\(\)\s*=\s*['"]([^'"]+)['"]|text\(\)\s*=\s*['"]([^'"]+)['"]/;

    const attrMatch = attrRegex.exec(selector);
    const containsMatch = containsRegex.exec(selector);
    const startsWithMatch = startsWithRegex.exec(selector);
    const textMatch = textRegex.exec(selector);

    if (attrMatch)
      return { type: attrMatch[1].toLowerCase(), value: attrMatch[2].toLowerCase(), tagName };
    if (containsMatch)
      return { type: containsMatch[1].toLowerCase(), value: containsMatch[2].toLowerCase(), tagName };
    if (startsWithMatch)
      return { type: startsWithMatch[1].toLowerCase(), value: startsWithMatch[2].toLowerCase(), tagName };
    if (textMatch)
      return { type: "text", value: (textMatch[1] || textMatch[2]).toLowerCase(), tagName };
    if (tagMatch) return { type: "tagName", value: tagMatch[1].toLowerCase() };

    const genericAttrMatch = /\[([\w-]+)=['"]?([^'"\]]+)['"]?\]/.exec(selector);
    if (genericAttrMatch)
      return { type: genericAttrMatch[1].toLowerCase(), value: genericAttrMatch[2].toLowerCase() };

    return { type: "unknown", value: HealingUtils.normalizeSelector(selector) };
  }

  static scoreByAttribute(type: string, value: string, signature: ElementSignature, tagName?: string): number {
    let maxScore = 0;

    const scoringFunctions: Array<() => number> = [
      () =>
        type === "id" && signature.id
          ? HealingUtils.calculateStringScore(
              HealingUtils.normalizeDynamicId(value),
              HealingUtils.normalizeDynamicId(signature.id)
            )
          : 0,

      () =>
        type === "name" && signature.name
          ? HealingUtils.calculateStringScore(
              HealingUtils.normalizeDynamicId(value),
              HealingUtils.normalizeDynamicId(signature.name)
            ) * 0.9
          : 0,

      () => {
        if (type === "class" && signature.className) {
          const classVal = Array.isArray(signature.className)
            ? signature.className[0]
            : signature.className.split(" ")[0];
          return classVal
            ? HealingUtils.calculateStringScore(
                HealingUtils.normalizeDynamicId(value),
                HealingUtils.normalizeDynamicId(classVal)
              ) * 0.8
            : 0;
        }
        return 0;
      },

      () =>
        tagName && signature.tagName
          ? HealingUtils.calculateStringScore(value, signature.tagName) * 0.7
          : 0,

      () => {
        if (signature.attributes && type) {
          return Object.entries(signature.attributes).reduce((acc, [attrName, attrValue]) => {
            if (attrName.toLowerCase() === type) {
              const score =
                HealingUtils.calculateStringScore(value, attrValue.toLowerCase()) * 0.9;
              return Math.max(acc, score);
            }
            return acc;
          }, 0);
        }
        return 0;
      },

      () =>
        type === "text" && signature.textContent
          ? HealingUtils.calculateStringScore(value, signature.textContent.toLowerCase()) * 1.0
          : 0,

      () =>
        signature.textContent
          ? HealingUtils.calculateStringScore(value, signature.textContent.toLowerCase()) * 0.6
          : 0,
    ];

    for (const fn of scoringFunctions) {
      const score = fn();
      if (score > maxScore) maxScore = score;
    }

    return maxScore;
  }

  static calculateSimilarity(selector: string, signature: ElementSignature): number {
    const selectorInfo = this.extractSelectorInfo(selector);

    if (selectorInfo.conditions && selectorInfo.conditions.length > 0) {
      const scores = selectorInfo.conditions.map(cond =>
        this.scoreByAttribute(cond.type, cond.value, signature, cond.tagName)
      );
      return scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : 0;
    }

    let score = this.scoreByAttribute(selectorInfo.type!, selectorInfo.value!, signature, selectorInfo.tagName);

    if (score < HealingUtils.MIN_HEALING_THRESHOLD && !selector.includes("//") && !selector.includes("=")) {
      const normalized = HealingUtils.normalizeDynamicId(selector);
      const candidates = [
        signature.id,
        signature.name,
        signature.attributes?.["data-test"],
        signature.attributes?.["data-testid"],
        signature.attributes?.["placeholder"],
        signature.attributes?.["aria-label"],
      ].filter(Boolean) as string[];

      for (const attrVal of candidates) {
        const attrScore = HealingUtils.calculateStringScore(
          normalized,
          HealingUtils.normalizeDynamicId(attrVal)
        );
        if (attrScore > score) score = attrScore;
      }
    }

    return score;
  }

  static generateSelectorFromSignature(signature: ElementSignature): string {
    if (!signature) return "*";

    if (signature.id) return `#${signature.id}`;
    if (signature.name) return `[name='${signature.name}']`;

    if (signature.className) {
      let firstClass = "";
      if (typeof signature.className === "string") firstClass = signature.className.split(" ")[0];
      else if (Array.isArray(signature.className)) firstClass = signature.className[0];
      if (firstClass) return `${signature.tagName || ""}.${firstClass}`;
    }

    if (signature.type) return `${signature.tagName || "input"}[type='${signature.type}']`;

    return signature.tagName || "*";
  }
}
