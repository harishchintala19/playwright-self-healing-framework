import { Locator } from "@playwright/test";

export enum METHOD_NAMES {
  SELECT_RANDOM_OPTION = 'selectRandomOption',
}

export interface HealingOptions {
  timeout?: number;
  contextSelector?: string;
  suppressError?: boolean;
}

export interface RandomSelectOptions extends HealingOptions {
  retries?: number;
  triggerEvents?: boolean;
}

export interface ElementSignature {
  id?: string;
  name?: string;
  className?: string;
  tagName: string;
  type?: string;
  textContent?: string;
  attributes: Record<string, string>;
  locator: Locator;
}
