import { test } from "@playwright/test";
import { LoginPage } from "../src/pages/SauceDemoPage";

test("Sauce Demo login test", async ({ page }) => {
  const loginPage = new LoginPage(page);

  await page.goto("https://www.saucedemo.com/");
  
  await loginPage.login("standard_user", "secret_sauce");

  await page.pause();
});
