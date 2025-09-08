import { Locator, Page } from "@playwright/test";
import { ElementSignature } from "./HealingTypes";

export class HealingCollector {
  static async collectElementSignatures(context: Locator): Promise<ElementSignature[]> {
    const signatures: ElementSignature[] = [];
    const candidates = await context.all();
    for (const candidate of candidates) {
      try {
        const elementData = await candidate.evaluate((el: HTMLElement) => {
          const attributes: Record<string, string> = {};
          for (const attr of el.getAttributeNames()) attributes[attr] = el.getAttribute(attr) || "";
          return {
            id: el.id || undefined,
            name: (el as HTMLInputElement).name || undefined,
            className: el.className || undefined,
            tagName: el.tagName.toLowerCase(),
            type: (el as HTMLInputElement).type || undefined,
            textContent: el.textContent?.trim() || undefined,
            attributes,
          };
        });
        signatures.push({ ...elementData, locator: candidate });

        const hasShadow = await candidate.evaluate(el => !!(el as HTMLElement).shadowRoot);
        if (hasShadow) {
          const shadowRootChildren = candidate.locator('*');
          const shadowSignatures = await HealingCollector.collectElementSignatures(shadowRootChildren);
          signatures.push(...shadowSignatures);
        }
      } catch { continue; }
    }
    return signatures;
  }

  static async searchCandidatesAdvanced(page: Page, contextSelector: string): Promise<ElementSignature[]> {
    let signatures = await HealingCollector.collectElementSignatures(page.locator(contextSelector));
    for (const frame of page.frames()) {
      if (frame === page.mainFrame()) continue;
      try {
        const frameSignatures = await HealingCollector.collectElementSignatures(frame.locator(contextSelector));
        signatures.push(...frameSignatures);
      } catch { continue; }
    }
    return signatures;
  }
}
