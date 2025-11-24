import { Page, Locator } from "@playwright/test";
import { HealingActions } from "./HealingActions";
import { HealingCollector } from "./HealingCollector";
import { HealingMatcher } from "./HealingMatcher";
import { HealingUtils } from "./HealingUtils";
import { HealingOptions } from "./HealingTypes";

export class HealingBase {
  protected page: Page;
  private readonly healingCache = new Map<string, string>();
  heal: HealingActions["actions"];

  private static readonly SHORT_TIMEOUT = 1000;
  private static readonly MEDIUM_TIMEOUT = 2000;

  constructor(page: Page) {
    this.page = page;
    this.heal = new HealingActions(
      this.page,
      this.log.bind(this),
      this.safeAction.bind(this),
      this.getHealingLocator.bind(this),
      this.normalizeLocator.bind(this)
    ).actions;
  }

  private log(message: string): void {
    console.log(`[HEALING LOG] ${message}`);
  }

  private async sanitizeSelectorAsync(selector: string): Promise<string> {
    const original = selector.trim();
    let fixed = this.correctBasicXPathSyntax(original);
    fixed = this.ensureValidXPathPrefix(fixed);
    fixed = this.makeContainsCaseInsensitive(fixed);

    fixed = fixed.replaceAll(/\s{2,}/g, " ").trim();

    fixed = await this.inferTagFromDOMIfNeeded(fixed);
    if (fixed !== original) {
      this.log(`[SANITIZED LOCATOR FIXED] Original: "${original}" → Sanitized: "${fixed}"`);
    }

    return fixed;
  }

  private correctBasicXPathSyntax(selector: string): string {
    return selector
      .replaceAll(/\[([a-zA-Z_][a-zA-Z0-9_-]*)=/g, "[@$1=")
      .replaceAll(/^\/\/\[@/g, "//*[@")
      .replaceAll(/^\/\/\[/g, "//*[")
      .replaceAll(/contains\((\w+),/g, "contains(@$1,")
      .replaceAll(/starts-with\((\w+),/g, "starts-with(@$1,");
  }


  private ensureValidXPathPrefix(selector: string): string {
    if (!selector.startsWith("//") && !selector.startsWith("xpath=")) {
      return `//${selector}`;
    }
    return selector;
  }

  private makeContainsCaseInsensitive(selector: string): string {
    return selector.replaceAll(
      /(contains|starts-with)\(\s*(?:@([a-zA-Z0-9:_-]+)|text\(\))\s*,\s*'([^']+)'\s*\)/gi,
      (_, fn, attr, val) => {
        const lowerVal = val.toLowerCase();
        const translateFn = "translate(";
        const alphabets = "'ABCDEFGHIJKLMNOPQRSTUVWXYZ','abcdefghijklmnopqrstuvwxyz'";
        return attr
          ? `${fn}(${translateFn}@${attr},${alphabets}),'${lowerVal}')`
          : `${fn}(${translateFn}text(),${alphabets}),'${lowerVal}')`;
      }
    );
  }

  private async inferTagFromDOMIfNeeded(selector: string): Promise<string> {
    if (!selector.startsWith("//*") && !selector.startsWith("//*[@")) return selector;

    const attrMatch = selector.match(/@\w+='([^']+)'/);
    const attrValue = attrMatch ? attrMatch[1] : null;
    if (!attrValue) return selector;

    const tagCandidates = ["input", "button", "select", "textarea", "a", "label", "div", "span"];

    for (const tag of tagCandidates) {
      try {
        const locator = this.page.locator(`${tag}[id='${attrValue}'], ${tag}[name='${attrValue}']`);
        if (await locator.first().isVisible()) {
          const improved = selector.replaceAll("//*", `//${tag}`);
          if (improved !== selector) {
            this.log(`[SANITIZED LOCATOR IMPROVED] Tag inferred from DOM: "${tag}" → "${improved}"`);
            return improved;
          }
          break;
        }
      } catch {
      }
    }
    return selector;
  }

  private sanitizeSelector(selector: string): string {
    return this.ensureValidXPathPrefix(this.correctBasicXPathSyntax(selector.trim()));
  }

  private isXPath(selector: string): boolean {
    return selector.startsWith("//") || selector.startsWith("xpath=");
  }

  private normalizeLocator(locator: string | Locator): Locator {
    if (typeof locator === "string") {
      const sanitized = this.sanitizeSelector(locator);
      const xpathLocator =
        this.isXPath(sanitized) && !sanitized.startsWith("xpath=")
          ? `xpath=${sanitized}`
          : sanitized;
      return this.page.locator(xpathLocator);
    }
    return locator;
  }

  private async isInteractable(el: Locator): Promise<boolean> {
    try {
      const visible = await el.isVisible();
      const enabled = await el.isEnabled();
      const attached = await el.evaluate((node) => node.isConnected);
      return visible && enabled && attached;
    } catch {
      return false;
    }
  }

  private async tryDirectLocator(selector: string, timeout: number): Promise<Locator | null> {
    const literalElement = this.page.locator(selector);
    try {
      await literalElement.first().waitFor({ state: "visible", timeout: Math.min(timeout, HealingBase.SHORT_TIMEOUT) });
      return literalElement.first();
    } catch {
      this.log(`[ORIGINAL LOCATOR FAILED] "${selector}"`);
      const sanitizedSelector = await this.sanitizeSelectorAsync(selector);
      const sanitizedElement = this.page.locator(sanitizedSelector);
      try {
        await sanitizedElement.first().waitFor({ state: "visible", timeout: Math.min(timeout, HealingBase.SHORT_TIMEOUT) });
        this.log(`[SANITIZED LOCATOR APPLIED] Using improved version: "${sanitizedSelector}"\n`);
        return sanitizedElement.first();
      } catch {
        return null;
      }
    }
  }

  private async tryCachedLocator(selector: string, timeout: number): Promise<Locator | null> {
    const cachedSelector = this.healingCache.get(selector);
    if (!cachedSelector) return null;

    const cachedLocator = this.page.locator(cachedSelector);
    try {
      await cachedLocator.waitFor({ state: "visible", timeout: Math.min(timeout, HealingBase.SHORT_TIMEOUT) });
      const firstLocator = cachedLocator.first();
      if ((await cachedLocator.count()) > 0 && (await firstLocator.isEnabled())) {
        this.log(`[CACHED HEAL USED] Cached healed selector: "${cachedSelector}"`);
        return firstLocator;
      }
      this.log(`[CACHED HEAL INVALID] "${cachedSelector}" - Removed from cache`);
    } catch {
      this.log(`[CACHED HEAL BROKEN] "${cachedSelector}" - Removed from cache\n`);
    }
    this.healingCache.delete(selector);
    return null;
  }

  private async findBestCandidate(selector: string, contextSelector: string, timeout: number): Promise<Locator> {
    this.log(`[HEALING ATTEMPT] Searching alternative for "${selector}"`);
    const elementSignatures = await HealingCollector.searchCandidatesAdvanced(this.page, contextSelector);

    if (elementSignatures.length === 0) {
      throw new Error(`Healing failed: No candidates found for "${selector}"`);
    }

    const scoredElements = elementSignatures
      .map((signature) => ({ signature, score: HealingMatcher.calculateSimilarity(selector, signature) }))
      .sort((a, b) => b.score - a.score);

    const hasHighConfidence = scoredElements.some((e) => e.score >= HealingUtils.MIN_HEALING_THRESHOLD);
    const filteredElements = hasHighConfidence
      ? scoredElements.filter((e) => e.score >= HealingUtils.MIN_HEALING_THRESHOLD)
      : [scoredElements[0]];

    for (const match of filteredElements) {
      if (match.score < HealingUtils.MIN_HEALING_THRESHOLD) {
        this.log(`[LOW CONFIDENCE SKIP] "${selector}" - Confidence too low (${match.score.toFixed(3)})`);
        continue;
      }

      const healedSelector = HealingMatcher.generateSelectorFromSignature(match.signature);
      const healedLocator = this.page.locator(healedSelector);

      try {
        await healedLocator.first().waitFor({ state: "visible", timeout: Math.min(timeout, HealingBase.MEDIUM_TIMEOUT) });
        if (await this.isInteractable(healedLocator.first())) {
          this.healingCache.set(selector, healedSelector);
          this.log(`[HEALED SUCCESS] Original locator broken → Using healed locator: "${healedSelector}"`);
          this.log(`[HEALED DETAILS] Tag: ${match.signature.tagName} | Confidence Score: ${match.score.toFixed(3)}\n`);
          return healedLocator.first();
        }
      } catch {
      }
    }

    throw new Error(`[HEALING FAILED COMPLETELY] "${selector}"`);
  }

  private async getHealingLocator(selector: string, options: HealingOptions = {}): Promise<Locator> {
    const { contextSelector = HealingUtils.DEFAULT_CONTEXT_SELECTOR, timeout = HealingUtils.DEFAULT_TIMEOUT } = options;

    return (
      (await this.tryDirectLocator(selector, timeout)) ??
      (await this.tryCachedLocator(selector, timeout)) ??
      (await this.findBestCandidate(selector, contextSelector, timeout))
    );
  }

  protected async safeAction<T>(
    methodName: string,
    action: () => Promise<T>,
    options?: HealingOptions
  ): Promise<T | null> {
    try {
      return await action();
    } catch (err: unknown) {
      const error = err as Error;
      if (options?.suppressError) {
        this.log(`[ACTION FAILURE SUPPRESSED] ${methodName}`);
        return null;
      }
      this.log(`[ACTION FAILED] ${methodName} -> ${error.message}`);
      throw error;
    }
  }
}
