import { Page } from "@playwright/test";
import { HealingBase } from "../../utils/healing/HealingBase"; 
import { SauceDemoLocators } from "../locators/SauceDemoLocators";

export class LoginPage extends HealingBase {
  constructor(page: Page) {
    super(page);
  }

  async login(username: string, password: string) {
    await this.heal.fill(SauceDemoLocators.usernameInput, username);
    await this.heal.fill(SauceDemoLocators.passwordInput, password);
    await this.heal.click(SauceDemoLocators.loginButton);
  }
}
