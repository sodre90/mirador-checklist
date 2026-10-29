import { describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Checklist } from "../checklist.ts";

/** Mirador's checkout, whose host code the tests run the plugin in; by default it sits next to this one. */
const miradorDir = process.env.MIRADOR_DIR ?? join(import.meta.dir, "..", "..", "visualized-claude-sessions");
type Mirador = {
  host: typeof import("../../visualized-claude-sessions/tests/canvas-plugin-host.ts");
  harnesses: typeof import("../../visualized-claude-sessions/host/acp/harnesses.ts");
  guidance: typeof import("../../visualized-claude-sessions/host/canvas/guidance.ts");
};
const { canvasPluginHost } = (await import(join(miradorDir, "tests", "canvas-plugin-host.ts"))) as Mirador["host"];
const { claudeSessionMeta } = (await import(join(miradorDir, "host", "acp", "harnesses.ts"))) as Mirador["harnesses"];
const { canvasInstructions, canvasUseGuidance } = (await import(join(miradorDir, "host", "canvas", "guidance.ts"))) as Mirador["guidance"];

/** A plugins folder holding this checkout, built, as Mirador installs it. */
function pluginsFolderWithThisPlugin() {
  const folder = join(mkdtempSync(join(tmpdir(), "mirador-checklist-")), "plugins");
  mkdirSync(folder);
  symlinkSync(join(import.meta.dir, ".."), join(folder, "checklist"));
  return folder;
}

const setUp = () => canvasPluginHost(pluginsFolderWithThisPlugin());
type PluginCanvasItem = ReturnType<Awaited<ReturnType<typeof setUp>>["items"]>[number];

const release = { title: "Release", sections: [{ items: [{ id: "tests", text: "Run the tests" }, { id: "build", text: "Build the app" }] }] };

const dataOf = (item: PluginCanvasItem | undefined) => item?.data as Checklist;
const doneStates = (item: PluginCanvasItem | undefined) => dataOf(item).sections.flatMap(({ items }) => items.map(({ done }) => done));

describe("the checklist plugin", () => {
  test("update_checklist describes an item's fields once, in addItems", async () => {
    const { mcpRequest } = await setUp();
    const { tools } = await mcpRequest("tools/list", {});
    const { items, addItems } = tools.find(({ name }: { name: string }) => name === "update_checklist").inputSchema.properties;
    expect(addItems.items.properties.owner.description).toStartWith("Who is expected to do it");
    expect(Object.entries(items.items.properties).filter(([, field]) => (field as { description?: string }).description).map(([name]) => name)).toEqual(["id"]);
  });

  test("its tools are pre-allowed, and its lines of guidance follow ask's", async () => {
    const { plugins } = await setUp();
    const { guidance } = plugins;
    expect(guidance.toolNames).toEqual(expect.arrayContaining(["checklist", "update_checklist"]));
    expect(claudeSessionMeta("often", { canvasPlugins: guidance }).claudeCode.options.allowedTools).toEqual(expect.arrayContaining(["mcp__canvas__checklist", "mcp__canvas__update_checklist"]));
    expect(canvasInstructions("http://127.0.0.1:4601", guidance)).toContain("\"change some answers\" as options.\n- checklist: when you work through several steps,");
    expect(canvasUseGuidance(guidance)).toContain("add a preview when it helps.\n- checklist: work with several steps,");
  });

  test("a published checklist goes in the tab with its count; the agent's ticks change it in place, as the agent's change", async () => {
    const { callTool, items } = await setUp();
    expect((await callTool("checklist", release)).text).toBe(
      "Shown to the user in the canvas's Checklist tab: 2 items, 0 of 2 done. Tick items with update_checklist as you finish them, naming them by id: tests, build.",
    );
    expect(items()[0]).toMatchObject({ plugin: "checklist", type: "checklist", icon: "☑", placement: "tab", title: "Release", count: "0/2" });
    expect(items()[0]).not.toHaveProperty("agentEditedAt");

    expect((await callTool("update_checklist", { items: [{ id: "tests", done: true }] })).text).toBe('On the checklist, updated "tests"; 1 of 2 done.');
    expect(items()[0]).toMatchObject({ count: "1/2", agentEditedAt: expect.any(Number), data: { agentChanged: ["tests"] } });
  });

  test("the user's tick in the view reaches the agent with the next message, once, and isn't the agent's change", async () => {
    const { plugins, callTool, items } = await setUp();
    await callTool("checklist", release);
    const checklistId = items()[0]!.id;
    expect(await plugins.act(checklistId, { kind: "tick", itemId: "build", done: true })).toBeNull();
    expect(items()[0]).toMatchObject({ count: "1/2" });
    expect(items()[0]).not.toHaveProperty("agentEditedAt");
    await expect(plugins.act(checklistId, { kind: "tick", itemId: "lint", done: true })).rejects.toThrow("Unknown checklist item.");
    await expect(plugins.act(checklistId, { kind: "press" })).rejects.toThrow("A checklist item can only be ticked or unticked.");

    const [note] = plugins.notesForAgent("c1");
    expect(note!.text).toBe('On your checklist "Release", the user ticked "build" (Build the app).');
    note!.heard();
    expect(plugins.notesForAgent("c1")).toEqual([]);
    expect(items()[0]).not.toHaveProperty("agentEditedAt");
  });

  test("tool problems reach the agent as the core's checklist worded them", async () => {
    const { callTool } = await setUp();
    expect(await callTool("update_checklist", { items: [{ id: "tests", done: true }] })).toEqual({
      text: "The checklist was not changed. Fix these and call update_checklist again:\n- This conversation has no checklist; publish one with the checklist tool.",
      isError: true,
    });
    const twice = { title: "T", sections: [{ items: [{ id: "a", text: "A" }, { id: "a", text: "A again" }] }] };
    expect(await callTool("checklist", twice)).toEqual({
      text: 'The checklist was not shown. Fix these and call checklist again:\n- "a" names more than one item; give each item its own id.',
      isError: true,
    });
  });
});

describe("a checklist dismissed by the user", () => {
  async function dismissedAfterTicking(...tickedIds: string[]) {
    const host = await setUp();
    await host.callTool("checklist", release);
    const item = host.items()[0]!;
    for (const itemId of tickedIds) await host.plugins.act(item.id, { kind: "tick", itemId, done: true });
    host.plugins.dismiss(item.id);
    return host;
  }

  test("ticks made before dismissing reach the agent once, with the next message", async () => {
    const { plugins } = await dismissedAfterTicking("tests", "build");
    const [note] = plugins.notesForAgent("c1");
    expect(note!.text).toBe('On your checklist "Release", the user ticked "tests" (Run the tests), "build" (Build the app).');
    note!.heard();
    expect(plugins.notesForAgent("c1")).toEqual([]);
  });

  test("with nothing unheard, there's no note", async () => {
    const { plugins } = await dismissedAfterTicking();
    expect(plugins.notesForAgent("c1")).toEqual([]);
  });

  test("update_checklist after the dismissal says the user dismissed it, and does not invite publishing again", async () => {
    const { callTool } = await dismissedAfterTicking("tests");
    expect(await callTool("update_checklist", { items: [{ id: "tests", done: true }] })).toEqual({
      text: "The checklist was not changed:\n- The user dismissed this conversation's checklist; don't publish it again unless they ask for one.",
      isError: true,
    });
  });

  test("publishing after the dismissal starts afresh and reports the ticks the agent had not heard", async () => {
    const { callTool, items, plugins } = await dismissedAfterTicking("tests");
    expect((await callTool("checklist", release)).text).toBe(
      'Shown to the user in the canvas\'s Checklist tab: 2 items, 0 of 2 done. On the checklist it replaces ("Release"), the user ticked "tests" (Run the tests). Tick items with update_checklist as you finish them, naming them by id: tests, build.',
    );
    expect(doneStates(items()[1])).toEqual([false, false]);
    expect(plugins.notesForAgent("c1")).toEqual([]);
  });

  test("publishing after the dismissal reports nothing more once the note delivered the ticks", async () => {
    const { callTool, plugins } = await dismissedAfterTicking("tests");
    plugins.notesForAgent("c1")[0]!.heard();
    expect((await callTool("checklist", release)).text).not.toContain("the user ticked");
  });
});
