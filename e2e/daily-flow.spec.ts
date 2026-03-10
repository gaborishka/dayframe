import { expect, test } from "@playwright/test";

test("daily flow works end-to-end with the mocked provider", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Sign in with Google" }).click();

  await expect(page.getByRole("heading", { name: /Hello, DayFrame Demo/i })).toBeVisible();

  await page.getByLabel("Reflection").fill("Today was a good day to turn scaffolding into something visible.");
  await page.getByPlaceholder("Add a concrete thing you touched today.").fill("Create the first runnable scaffold");
  await page.getByRole("button", { name: "Save context" }).click();
  await expect(page.getByText("Context saved. Your day is ready for generation.")).toBeVisible();

  await page.getByRole("button", { name: "Generate issue" }).click();
  await expect(page.getByText("Generation queued. The worker is building your issue now.")).toBeVisible();
  await expect(page.getByText("Your comic is ready")).toBeVisible({ timeout: 20_000 });
  await expect(page.getByRole("img", { name: /Small Victories/i })).toBeVisible();
});
