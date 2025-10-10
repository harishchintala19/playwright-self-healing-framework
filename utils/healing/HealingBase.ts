import { Page, Locator } from "@playwright/test";
import { HealingActions } from "./HealingActions";
import { HealingCollector } from "./HealingCollector";
import { HealingMatcher } from "./HealingMatcher";
import { HealingUtils } from "./HealingUtils";
import { HealingOptions } from "./HealingTypes";

export class HealingBase {
  protected page: Page;
  private readonly healingCache: Map<string, string> = new Map();
  heal: HealingActions["actions"];

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

  private log(message: string) {
    console.log(message);
  }

  private sanitizeSelector(selector: string): string {
    const original = selector.trim();

    if (original.startsWith("//[")) selector = original.replace("//[", "//*[");
    else if (original.startsWith("//[@")) selector = original.replace("//[@", "//*[@");
    else selector = original.replace(/^\/\/\s*\[/, "//*[");

    const sanitized = selector.replace(
      /(contains|starts-with)\(\s*(?:@([a-zA-Z0-9:_-]+)|text\(\))\s*,\s*'([^']+)'\s*\)/gi,
      (_, fn, attr, val) => {
        if (attr)
          return `${fn}(translate(@${attr},'ABCDEFGHIJKLMNOPQRSTUVWXYZ','abcdefghijklmnopqrstuvwxyz'),'${val.toLowerCase()}')`;
        return `${fn}(translate(text(),'ABCDEFGHIJKLMNOPQRSTUVWXYZ','abcdefghijklmnopqrstuvwxyz'),'${val.toLowerCase()}')`;
      }
    );

    return sanitized;
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
    } else {
      return locator;
    }
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

  private async getHealingLocator(selector: string, options: HealingOptions = {}): Promise<Locator> {
    const { contextSelector = HealingUtils.DEFAULT_CONTEXT_SELECTOR, timeout = HealingUtils.DEFAULT_TIMEOUT } = options;

    const tryDirectLocator = async (): Promise<Locator | null> => {
      const literalElement = this.page.locator(selector);
      try {
        await literalElement.first().waitFor({ state: "visible", timeout: Math.min(timeout, 1000) });
        this.log(`[ORIGINAL LOCATOR] "${selector}" - Passed`);
        return literalElement.first();
      } catch {
        this.log(`[ORIGINAL LOCATOR] "${selector}" - Broken`);
        
        const sanitizedElement = this.normalizeLocator(selector);
        try {
          await sanitizedElement.first().waitFor({ state: "visible", timeout: Math.min(timeout, 1000) });
          this.log(`[SANITIZED LOCATOR] "${selector}" - Used`);
          return sanitizedElement.first();
        } catch {
          return null;
        }
      }
    };

    const tryCachedLocator = async (): Promise<Locator | null> => {
      if (!this.healingCache.has(selector)) return null;
      const cachedSelector = this.healingCache.get(selector)!;
      const cachedLocator = this.normalizeLocator(cachedSelector);
      try {
        await cachedLocator.waitFor({ state: "visible", timeout: Math.min(timeout, 1000) });
        if ((await cachedLocator.count()) > 0 && (await cachedLocator.first().isEnabled())) {
          this.log(`[HEALING] Using cached selector → "${cachedSelector}"`);
          return cachedLocator.first();
        } else this.healingCache.delete(selector);
      } catch {
        this.healingCache.delete(selector);
      }
      return null;
    };

    const findBestCandidate = async (): Promise<Locator> => {
      const elementSignatures = await HealingCollector.searchCandidatesAdvanced(this.page, contextSelector);
      if (!elementSignatures.length) throw new Error(`Healing failed for selector: "${selector}"`);

      const scoredElements = elementSignatures
        .map((signature) => ({ signature, score: HealingMatcher.calculateSimilarity(selector, signature) }))
        .sort((a, b) => b.score - a.score);

      const filteredElements = scoredElements.filter((e) => e.score >= HealingUtils.MIN_HEALING_THRESHOLD).length
        ? scoredElements.filter((e) => e.score >= HealingUtils.MIN_HEALING_THRESHOLD)
        : [scoredElements[0]];

      for (const match of filteredElements) {
        if (match.score < HealingUtils.MIN_HEALING_THRESHOLD) {
          this.log(`[HEALING SKIPPED] Low confidence (score: ${match.score.toFixed(3)}) for selector "${selector}"`);
          continue;
        }

        const healedSelector = HealingMatcher.generateSelectorFromSignature(match.signature);
        const healedLocator = this.normalizeLocator(healedSelector).first();
        try {
          await healedLocator.waitFor({ state: "visible", timeout: Math.min(timeout, 2000) });
          if (await this.isInteractable(healedLocator)) {
            this.healingCache.set(selector, healedSelector);
            this.log(`[HEALING] Match found → "${healedSelector}", tag: ${match.signature.tagName}, score: ${match.score.toFixed(3)}`);
            return healedLocator;
          }
        } catch { continue; }
      }

      throw new Error(`Healing failed for selector: "${selector}"`);
    };

    return (await tryDirectLocator()) ?? (await tryCachedLocator()) ?? (await findBestCandidate());
  }

  protected async safeAction<T>(
    methodName: string,
    action: () => Promise<T>,
    options?: HealingOptions
  ): Promise<T | null> {
    try {
      const result = await action();
      this.log(`[SUCCESS] ${methodName}\n`);
      return result;
    } catch (err: any) {
      if (options?.suppressError) {
        this.log(`[ACTION FAILURE SUPPRESSED] ${methodName}\n`);
        return null;
      }
      throw err;
    }
  }
}
