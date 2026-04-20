import { expect, test } from "@playwright/test";

const operatorUsername = process.env.APP_GATE_USERNAME ?? "cash96";
const operatorPassword = process.env.APP_GATE_PASSWORD ?? "Map-RevEd-042026";

test("operator can reach the site and enter the dashboard", async ({ page }) => {
  await page.goto("/login");

  await expect(page.getByRole("heading", { name: "ProjectMapper" })).toBeVisible();

  await page.getByLabel("Username").fill(operatorUsername);
  await page.getByLabel("Password").fill(operatorPassword);
  await page.getByRole("button", { name: "Enter command center" }).click();

  await expect(page).toHaveURL(/dashboard/);
  await expect(
    page.getByRole("heading", { name: "ProjectMapper Overview" }),
  ).toBeVisible();
});