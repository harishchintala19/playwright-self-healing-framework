import * as stringSimilarity from "string-similarity";

export class HealingUtils {
  static readonly SIGNATURE_ATTRIBUTES: string[] = [
    "data-test", "data-testid", "data-qa", "data-cy", "data-automation-id",
    "aria-label", "aria-labelledby", "aria-describedby", "role","id", "name",
    "class","title", "alt", "placeholder", "value", "type", "for", "href",
    "src","checked", "disabled", "readonly", "selected", "required",
    "aria-expanded", "aria-hidden", "aria-checked"
  ];

  static readonly DEFAULT_CONTEXT_SELECTOR: string = "*";
  static readonly MIN_HEALING_THRESHOLD: number = 0.4;
  static readonly DEFAULT_TIMEOUT: number = 5000;
  static normalizeDynamicId(value: string): string {
    return value.replace(/[-_\d]+/g, "").toLowerCase();
  }

  static normalizeSelector(selector: string): string {
    return selector
      .replace(/(text=|role=|css=|xpath=)/gi, "")
      .replace(/[[\]@=/*"'():{}]/g, " ")  
      .replace(/[-_\\d]+/g, "")           
      .replace(/\s+/g, " ")               
      .toLowerCase()
      .trim();
  }

  static calculateStringScore(target: string, candidate: string): number {
    target = target.toLowerCase();
    candidate = candidate.toLowerCase();

    if (target === candidate) return 1.0;

    if (target.includes(candidate) || candidate.includes(target)) {
      const longer = target.length > candidate.length ? target : candidate;
      const shorter = target.length > candidate.length ? candidate : target;
      return 0.85 * (shorter.length / longer.length);
    }

    return stringSimilarity.compareTwoStrings(target, candidate) * 0.75;
  }
}
