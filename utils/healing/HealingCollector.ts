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

        const tag = elementData.tagName?.toLowerCase();
        const allowedTags = ["input", "textarea", "select", "button", "a", "label"];
        const interactiveRoles = ["textbox", "combobox", "button", "link"];
        const type = (elementData.type || "").toLowerCase();

        const isInteractable =
          allowedTags.includes(tag) ||
          ["email", "text", "password", "search", "number"].includes(type) ||
          Object.entries(elementData.attributes || {}).some(
            ([attr, val]) =>
              attr.toLowerCase() === "role" &&
              interactiveRoles.some((role) => val.toLowerCase().includes(role))
          );

        const disallowedTags = ["div", "span", "p", "section", "article", "header", "footer", "main", "h1", "h2", "h3", "h4", "h5", "h6"];
        if (!isInteractable || disallowedTags.includes(tag)) continue;

        signatures.push({ ...elementData, locator: candidate });
        const hasShadow = await candidate.evaluate(el => !!(el as HTMLElement).shadowRoot);
        if (hasShadow) {
          const shadowRootChildren = candidate.locator('*');
          const shadowSignatures = await HealingCollector.collectElementSignatures(shadowRootChildren);
          signatures.push(...shadowSignatures);
        }
      } catch {
        continue;
      }
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
      } catch {
        continue;
      }
    }

    return signatures;
  }
}
