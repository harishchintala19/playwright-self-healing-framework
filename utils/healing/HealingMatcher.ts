import { ElementSignature } from "./HealingTypes";
import { HealingUtils } from "./HealingUtils";

export class HealingMatcher {
  static extractSelectorInfo(selector: string): { type: string; value: string; tagName?: string } {
    selector = selector.trim();

    if (selector.startsWith("#")) return { type: "id", value: selector.substring(1).toLowerCase() };
    if (selector.startsWith(".")) return { type: "class", value: selector.substring(1).toLowerCase() };

    const attrRegex = /@([\w-]+)=['"]?([^'"[\]]+)['"]?/;
    const containsRegex = /contains\(@([\w-]+),'([^']+)'\)/;
    const startsWithRegex = /starts-with\(@([\w-]+),'([^']+)'\)/;

    const textRegex = /normalize-space\(\)\s*=\s*['"]([^'"]+)['"]|text\(\)\s*=\s*['"]([^'"]+)['"]/;

    const tagRegex = /\/\/(\w+)/;

    const attrMatch = attrRegex.exec(selector);
    const containsMatch = containsRegex.exec(selector);
    const startsWithMatch = startsWithRegex.exec(selector);
    const textMatch = textRegex.exec(selector);
    const tagMatch = tagRegex.exec(selector);

    if (attrMatch) return { type: attrMatch[1].toLowerCase(), value: attrMatch[2].toLowerCase(), tagName: tagMatch?.[1]?.toLowerCase() };
    if (containsMatch) return { type: containsMatch[1].toLowerCase(), value: containsMatch[2].toLowerCase(), tagName: tagMatch?.[1]?.toLowerCase() };
    if (startsWithMatch) return { type: startsWithMatch[1].toLowerCase(), value: startsWithMatch[2].toLowerCase(), tagName: tagMatch?.[1]?.toLowerCase() };
    if (textMatch) return { type: "text", value: (textMatch[1] || textMatch[2]).toLowerCase(), tagName: tagMatch?.[1]?.toLowerCase() };
    if (tagMatch) return { type: "tagName", value: tagMatch[1].toLowerCase() };

    const genericAttrMatch = /\[([\w-]+)=['"]?([^'"\]]+)['"]?\]/.exec(selector);
    if (genericAttrMatch) return { type: genericAttrMatch[1].toLowerCase(), value: genericAttrMatch[2].toLowerCase() };

    return { type: "unknown", value: HealingUtils.normalizeSelector(selector) };
  }

  static scoreByAttribute(type: string, value: string, signature: ElementSignature, tagName?: string): number {
    let maxScore = 0;

    const scoringFunctions: Array<() => number> = [
      () => (type === "id" && signature.id ? HealingUtils.calculateStringScore(HealingUtils.normalizeDynamicId(value), HealingUtils.normalizeDynamicId(signature.id)) : 0),

      () => (type === "name" && signature.name ? HealingUtils.calculateStringScore(HealingUtils.normalizeDynamicId(value), HealingUtils.normalizeDynamicId(signature.name)) * 0.9 : 0),

      () => {
        if (type === "class" && signature.className) {
          const classVal = Array.isArray(signature.className) ? signature.className[0] : signature.className.split(" ")[0];
          return classVal ? HealingUtils.calculateStringScore(HealingUtils.normalizeDynamicId(value), HealingUtils.normalizeDynamicId(classVal)) * 0.8 : 0;
        }
        return 0;
      },

      () => (tagName && signature.tagName ? HealingUtils.calculateStringScore(value, signature.tagName) * 0.7 : 0),

      () => {
        if (signature.attributes && type) {
          return Object.entries(signature.attributes).reduce((acc, [attrName, attrValue]) => {
            if (attrName.toLowerCase() === type) {
              const score = HealingUtils.calculateStringScore(value, attrValue.toLowerCase()) * 0.9;
              return Math.max(acc, score);
            }
            return acc;
          }, 0);
        }
        return 0;
      },

      () => (type === "text" && signature.textContent ? HealingUtils.calculateStringScore(value, signature.textContent.toLowerCase()) * 1.0 : 0),

      () => (signature.textContent ? HealingUtils.calculateStringScore(value, signature.textContent.toLowerCase()) * 0.6 : 0),
    ];

    for (const fn of scoringFunctions) {
      const score = fn();
      if (score > maxScore) maxScore = score;
    }

    return maxScore;
  }

  static calculateSimilarity(selector: string, signature: ElementSignature): number {
    const selectorInfo = this.extractSelectorInfo(selector);
    return this.scoreByAttribute(selectorInfo.type, selectorInfo.value, signature, selectorInfo.tagName);
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

