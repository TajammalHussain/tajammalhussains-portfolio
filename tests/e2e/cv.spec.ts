import { test, expect } from "@playwright/test";

test.describe("CV page", () => {
  test("renders the on-page CV with core sections", async ({ page }) => {
    await page.goto("/cv");
    await expect(page.getByRole("heading", { name: "Summary" })).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Education" }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Certifications" }),
    ).toBeVisible();
    await expect(page.getByText("University of Hertfordshire")).toBeVisible();
  });

  test("download link points at the configured PDF path", async ({ page }) => {
    await page.goto("/cv");
    const downloadLink = page.getByRole("link", { name: "Download PDF" });
    await expect(downloadLink).toHaveAttribute("href", /\.pdf$/);
    await expect(downloadLink).toHaveAttribute("download", "");
  });

  test("print button is present and triggers the browser print dialog", async ({
    page,
  }) => {
    let printCalled = false;
    await page.exposeFunction("__printCalled", () => {
      printCalled = true;
    });
    await page.addInitScript(() => {
      window.print = () =>
        (window as unknown as { __printCalled: () => void }).__printCalled();
    });
    await page.goto("/cv");
    await page.getByRole("button", { name: "Print" }).click();
    expect(printCalled).toBe(true);
  });
});
