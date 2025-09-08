# Playwright Self-Healing Framework

**License**: This project is licensed under the [Apache License 2.0](LICENSE).  
© 2025 Harish Chintala

![License](https://img.shields.io/badge/License-Apache%202.0-blue.svg)

This project is a self-healing automation framework built with Playwright and TypeScript, designed for testing the [Sauce Demo](https://www.saucedemo.com/) website. It automatically detects and heals broken selectors to ensure robust and reliable test automation.

## Features

- **Self-Healing Locators**: Automatically repairs broken XPath or CSS selectors using advanced matching algorithms with a minimum similarity threshold of 40% (0.4) for matching attributes or tags.
- **Custom Actions**: Includes actions like `click`, `fill`, `selectRandomOption`, `clickIfVisible`, `fillIfVisible`, and more for flexible automation.
- **XPath and CSS Support**: Supports both XPath and CSS selectors with normalization for consistent element identification.
- **Shadow DOM and iFrame Support**: Handles elements within shadow DOM and iframes for comprehensive healing.
- **Error Suppression**: Optionally suppresses errors for non-critical actions to maintain test flow.
- **Logging**: Provides detailed logs for debugging and tracking healing processes.
- **Sauce Demo Integration**: Includes a dedicated `LoginPage` class with locators for the Sauce Demo login page.

## Installation

1. **Clone the Repository**:
   Replace `your-username` with your actual GitHub username in the command below:
   ```bash
   git clone https://github.com/your-username/playwright-self-healing-framework.git
   cd playwright-self-healing-framework
   ```

2. **Install Dependencies**:
   Ensure Node.js is installed, then run:
   ```bash
   npm install
   ```

3. **Install Playwright Browsers**:
   ```bash
   npx playwright install
   ```

4. **Verify .gitignore**:
   The repository includes a `.gitignore` file to exclude unnecessary files (e.g., `node_modules/`, `test-results/`, `playwright-report/`) from version control. Review `.gitignore` in the project root to ensure it suits your needs.

## Project Structure

- `src/pages/LoginPage.ts`: Implements the `LoginPage` class, extending `HealingBase`, to handle interactions with the Sauce Demo login page using self-healing actions. The code is as follows:
  ```typescript
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
  ```

- `src/locators/SauceDemoLocators.ts`: Defines XPath or CSS locators for the Sauce Demo login page. Example configurations:
  ```typescript
  // XPath Locators
  export const SauceDemoLocators = {
    usernameInput: "//input[@id='user-name']",
    passwordInput: "//input[@id='password']",
    loginButton: "//input[@id='login-button']"
  };

  // CSS Locators (alternative, comment out one version)
  // export const SauceDemoLocators = {
  //   usernameInput: "#user-name",
  //   passwordInput: "#password",
  //   loginButton: "#login-button"
  // };
  ```

- `src/utils/healing/HealingBase.ts`: Core class initializing the self-healing framework and providing access to healing actions.
- `src/utils/healing/HealingActions.ts`: Defines custom actions with self-healing capabilities.
- `src/utils/healing/HealingCollector.ts`: Collects element signatures from DOM, including shadow DOM and iframes.
- `src/utils/healing/HealingMatcher.ts`: Implements selector matching and scoring logic for healing.
- `src/utils/healing/HealingTypes.ts`: TypeScript interfaces and enums for the framework.
- `src/utils/healing/HealingUtils.ts`: Utility functions for selector normalization, string similarity, and configuration.
- `tests/example.spec.ts`: Example test script demonstrating the self-healing framework on the Sauce Demo login page.

## Usage

1. **Running Tests**:
   Use the provided test script in `tests/example.spec.ts` to automate the Sauce Demo login page:
   ```typescript
   import { test } from "@playwright/test";
   import { LoginPage } from "../src/pages/SauceDemoPage";

   test("Sauce Demo login test", async ({ page }) => {
     const loginPage = new LoginPage(page);
     await page.goto("https://www.saucedemo.com/");
     await loginPage.login("standard_user", "secret_sauce");
     await page.pause();
   });
   ```

   Run the test with:
   ```bash
   npx playwright test
   ```

2. **Switching Locators**:
   The framework supports both XPath and CSS locators for the Sauce Demo login page. Configure them in `src/locators/SauceDemoLocators.ts` (see the `Project Structure` section for details). To switch, comment out the unused version in `SauceDemoLocators.ts`.

3. **Testing Self-Healing**:
   To observe the self-healing mechanism, intentionally break a locator in `src/locators/SauceDemoLocators.ts` by modifying a tag or attribute (e.g., change `usernameInput: "#user-name"` to `usernameInput: "#wrong-user-name"` or `usernameInput: "//div[@id='user-name']"` to alter the tag). Avoid changing the entire locator name to ensure partial similarity (at least 40% (0.4) matching). Then, run the test:
   ```bash
   npx playwright test tests/example.spec.ts
   ```
   Review the live console logs to see how the framework detects the broken selector, searches for candidates, and heals it by matching attributes or tags with at least 60% similarity. Watch the [Self_Heal_Framework_demo_UI.gif](Self_Heal_Framework_demo_UI.gif) or [Self_Heal_Framework_demo_headless.gif](Self_Heal_Framework_demo_headless.gif) to see the self-healing process in action.


## Testing on Sauce Demo

The `LoginPage` class in `src/pages/LoginPage.ts` uses the self-healing framework to interact with the Sauce Demo login page. If locators (e.g., `usernameInput`, `passwordInput`, `loginButton`) defined in `src/locators/SauceDemoLocators.ts` break due to DOM changes, the framework attempts to heal them by finding alternative selectors with at least 60% similarity.

To test:
1. Configure `src/locators/SauceDemoLocators.ts` with your preferred locators (XPath or CSS).
2. Break a locator by modifying its tag or attribute (e.g., change `#user-name` to `#wrong-user-name` or `//input[@id='user-name']` to `//div[@id='user-name']`).
3. Run the test and review the live logs:
   ```bash
   npx playwright test tests/example.spec.ts
   ```
## Demo Videos

Please find the demo videos in the `demo_videos` folder located in the project root:

- `Self_Heal_Framework_demo_UI.mp4` – Test execution in UI mode  
- `Self_Heal_Framework_demo_headless.mp4` – Test execution in headless mode  

## Contributing

Contributions are welcome! To contribute:
1. Fork the repository.
2. Create a new branch (`git checkout -b feature/your-feature`).
3. Commit your changes (`git commit -m 'Add your feature'`).
4. Push to the branch (`git push origin feature/your-feature`).
5. Open a Pull Request.
