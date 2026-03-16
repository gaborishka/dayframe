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
  await page.getByRole("button", { name: "Create public share" }).click();
  await expect(page.getByRole("link", { name: "Open share preview" })).toBeVisible();

  await page.getByRole("button", { name: "Library" }).click();
  await expect(page.getByText(/Small Victories/i)).toBeVisible();
});

test("weekly issues and torn pages surface after generating an older week", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Sign in with Google" }).click();

  await page.getByLabel("Date").fill("2026-03-02");
  await page.getByLabel("Reflection").fill("This was the start of the arc.");
  await page.getByPlaceholder("Add a concrete thing you touched today.").fill("Seed an old week");
  await page.getByRole("button", { name: "Save context" }).click();
  await page.getByRole("button", { name: "Generate issue" }).click();
  await expect(page.getByText("Your comic is ready")).toBeVisible({ timeout: 20_000 });

  await page.getByRole("button", { name: "Weekly Issues" }).click();
  await expect(page.getByText("Issue 2026-W10")).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText("Monday and the Small Victories")).toBeVisible();

  await page.getByRole("button", { name: "Torn Pages" }).click();
  await expect(page.getByText("Write a short reflection to recover the missing story beat for 2026-03-03.")).toBeVisible({ timeout: 20_000 });
});
