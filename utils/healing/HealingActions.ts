import { Locator, Page } from "@playwright/test";
import { METHOD_NAMES, HealingOptions, RandomSelectOptions } from "./HealingTypes";
import { HealingUtils } from "./HealingUtils";

export class HealingActions {
  constructor(
    private readonly page: Page,
    private readonly log: (msg: string) => void,
    private readonly safeAction: <T>(
      method: string,
      operation: () => Promise<T>,
      options?: HealingOptions
    ) => Promise<T | null>,
    private readonly getHealingLocator: (selector: string, options?: HealingOptions) => Promise<Locator>,
    private readonly normalizeLocator: (locator: string | Locator) => Locator
  ) {}

  actions = {
    click: this.create("click", async (el, options?: { force?: boolean; retries?: number }) => {
      const retries = options?.retries ?? 2;
      for (let i = 0; i < retries; i++) {
        try {
          if (options?.force) await el.click({ force: true });
          else await el.click();
          return;
        } catch {
          if (i === retries - 1) {
            this.log("[HEALING DIAG] Final retry with force click");
            await el.click({ force: true });
          } else {
            await this.page.waitForTimeout(500);
          }
        }
      }
    }),
    
    checkboxClick: this.create("checkboxClick", async (el) => {
      const tag = await el.evaluate((node) => node.tagName.toLowerCase());
      const type = await el.evaluate((node: any) => node.getAttribute("type"));

      if (tag === "input" && (type === "checkbox" || type === "radio")) {
        return el.check({ force: true });
      }

      const isVisible = await el.isVisible();
      if (!isVisible) return el.click({ force: true });
      return el.click();
    }),

    fill: this.create("fill", (el, value: string) => el.fill(value)),
    type: this.create("type", (el, value: string) => el.type(value)),
    isVisible: this.create("isVisible", (el) => el.isVisible(), { suppressError: true }),
    clear: this.create("clear", (el) => el.fill("")),
    press: this.create("press", (el, key: string) => el.press(key)),
    hover: this.create("hover", (el) => el.hover()),
    check: this.create("check", (el) => el.check()),
    uncheck: this.create("uncheck", (el) => el.uncheck()),
    selectOption: this.create("selectOption", (el, value: string) => el.selectOption(value)),
    getText: this.create("getText", async (el) => (await el.textContent()) || ""),
    getAttribute: this.create("getAttribute", (el, attr: string) => el.getAttribute(attr)),
    scrollIntoView: this.create("scrollIntoView", (el) =>
      el.evaluate((e: HTMLElement) => e.scrollIntoView({ behavior: "smooth", block: "center" }))
    ),
    doubleClick: this.create("doubleClick", (el) => el.dblclick()),
    rightClick: this.create("rightClick", (el) => el.click({ button: "right" })),
    dragAndDrop: this.create("dragAndDrop", async (source, targetSelector: string) => {
      const target = await this.getHealingLocator(targetSelector);
      const boxSource = await source.boundingBox();
      const boxTarget = await target.boundingBox();
      if (!boxSource || !boxTarget) throw new Error("Cannot drag, element box not found");
      await this.page.mouse.move(boxSource.x + boxSource.width / 2, boxSource.y + boxSource.height / 2);
      await this.page.mouse.down();
      await this.page.mouse.move(boxTarget.x + boxTarget.width / 2, boxTarget.y + boxTarget.height / 2);
      await this.page.mouse.up();
    }),

    waitForVisible: this.create(
      "waitForVisible",
      (el, timeout: number) => el.waitFor({ state: "visible", timeout: timeout || HealingUtils.DEFAULT_TIMEOUT }),
      { timeout: HealingUtils.DEFAULT_TIMEOUT }
    ),

    waitForHidden: this.create(
      "waitForHidden",
      (el, timeout: number) => el.waitFor({ state: "hidden", timeout: timeout || HealingUtils.DEFAULT_TIMEOUT }),
      { timeout: HealingUtils.DEFAULT_TIMEOUT }
    ),

    waitForEnabled: this.create(
      "waitForEnabled",
      async (el, timeout: number) => {
        const start = Date.now();
        while (!(await el.isEnabled())) {
          if (Date.now() - start > (timeout || HealingUtils.DEFAULT_TIMEOUT))
            throw new Error(`Element not enabled in ${timeout || HealingUtils.DEFAULT_TIMEOUT}ms`);
          await new Promise((r) => setTimeout(r, 100));
        }
      },
      { timeout: HealingUtils.DEFAULT_TIMEOUT }
    ),

    screenshot: this.create("screenshot", (el, path?: string) => el.screenshot({ path })),
    clickIfVisible: this.create(
      "clickIfVisible",
      async (el) => {
        if (await el.isVisible()) await el.click();
      },
      { suppressError: true }
    ),
    fillIfVisible: this.create(
      "fillIfVisible",
      async (el, value: string) => {
        if (await el.isVisible()) await el.fill(value);
      },
      { suppressError: true }
    ),

    selectRandomOption: (toggleLocator: string | Locator, optionLocator: string | Locator, options: RandomSelectOptions = {}) =>
      this.safeAction(METHOD_NAMES.SELECT_RANDOM_OPTION, async () => {
        const { retries = 3, triggerEvents = true, timeout = HealingUtils.DEFAULT_TIMEOUT } = options;
        const toggle = this.normalizeLocator(toggleLocator);
        const optionsLocator = this.normalizeLocator(optionLocator);

        for (let attempt = 1; attempt <= retries; attempt++) {
          try {
            await toggle.click({ force: true });
            await optionsLocator.first().waitFor({ state: "visible", timeout });

            const allOptions = await optionsLocator.all();
            const validOptions: Locator[] = (
              await Promise.all(
                allOptions.map(async (opt: Locator) => {
                  const rect = await opt.evaluate((el: HTMLElement) => el.getBoundingClientRect());
                  const style = await opt.evaluate((el: HTMLElement) => window.getComputedStyle(el));
                  const isValid =
                    rect.width > 0 &&
                    rect.height > 0 &&
                    style.display !== "none" &&
                    !(await opt.evaluate((el) => el.hasAttribute("disabled")));
                  return isValid ? opt : null;
                })
              )
            ).filter((opt): opt is Locator => opt !== null);

            if (!validOptions.length) throw new Error("No valid options found");

            const randomIndex = Math.floor(Math.random() * validOptions.length);
            const selectedOption = validOptions[randomIndex];
            await selectedOption.click({ force: true });

            if (triggerEvents) {
              await selectedOption.evaluate((el: HTMLElement) => el.setAttribute("aria-selected", "true"));
              await toggle.evaluate((el: HTMLElement) => {
                el.dispatchEvent(new Event("change", { bubbles: true }));
                el.dispatchEvent(new Event("input", { bubbles: true }));
              });
            }

            this.log(`[ACTION SUCCESS] selectRandomOption succeeded`);
            return selectedOption;
          } catch (err) {
            if (attempt === retries) throw err;
            await new Promise((r) => setTimeout(r, 1000));
          }
        }
      }, options),
  };

  private create<T>(
    methodName: string,
    action: (locator: Locator, ...args: any[]) => Promise<T>,
    defaultOptions: HealingOptions = {}
  ) {
    return async (selector: string, ...args: any[]): Promise<T | null> => {
      return this.safeAction(methodName, async () => {
        const el = await this.getHealingLocator(selector, defaultOptions);
        return await action(el, ...args);
      }, defaultOptions);
    };
  }
}
