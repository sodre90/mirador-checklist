import { chmodSync, existsSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { helpers, startHostWithThisPlugin, type TestHost } from "./mirador.ts";

let host: TestHost;
let openedLog: string;
const profileName = "file-links";

/** Stand-ins for the system's opener, which note what they were given. */
function fakeOpeners() {
  openedLog = join(host.root, "opened.log");
  for (const opener of ["open", "xdg-open"]) {
    writeFileSync(join(host.fakeProgramsDir, opener), `#!/bin/sh\necho "${opener} $*" >> '${openedLog}'\n`);
    chmodSync(join(host.fakeProgramsDir, opener), 0o755);
  }
}

test.beforeAll(async () => {
  ({ host } = await startHostWithThisPlugin());
  fakeOpeners();
  mkdirSync(join(host.projectDir, "docs"), { recursive: true });
  writeFileSync(join(host.projectDir, "docs", "release.md"), "# Release\n");
});
test.afterAll(async () => {
  await host?.stop();
  await host?.cleanUp();
});

const checklistView = (page: Page) => page.frameLocator(".checklist:visible .canvas-frame.plugin iframe");
const openedSoFar = () => (existsSync(openedLog) ? readFileSync(openedLog, "utf8") : "");

async function startConversationWithoutModel(page: Page) {
  const previousUrl = page.url();
  await page.getByRole("button", { name: "+ New conversation" }).click();
  await expect(page).not.toHaveURL(previousUrl);
  return page.url().match(/#\/c\/(.+)$/)![1]!;
}

test("a file path in an item's detail is a link that opens the file, and other code stays code", async ({ page }) => {
  await helpers().signIn(page, host);
  await helpers().addWorkspace(page, host.projectDir);
  const profiles = await helpers().createProfile(page, profileName, "", "", "opencode");
  await profiles.getByRole("button", { name: "Close" }).click();
  await page.getByLabel("Agent", { exact: true }).selectOption({ label: `${profileName} · opencode` });
  const conversationId = await startConversationWithoutModel(page);
  await helpers().callCanvasTool(host, conversationId, "checklist", {
    title: "Release",
    sections: [{ items: [{ id: "notes", text: "Write the notes", detail: "In `docs/release.md`, with `npm run notes`" }] }],
  });

  const detail = checklistView(page).locator(".checklist-detail");
  await expect(detail.getByRole("button", { name: "docs/release.md", exact: true })).toBeVisible();
  await expect(detail.locator("button.file-link", { hasText: "npm run notes" })).toHaveCount(0);
  await detail.getByRole("button", { name: "docs/release.md", exact: true }).click();
  await expect.poll(openedSoFar).toContain(realpathSync.native(join(host.projectDir, "docs", "release.md")));
});
