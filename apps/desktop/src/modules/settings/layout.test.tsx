import { readFileSync } from "node:fs";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { SettingsBlock, SettingsFull } from "./SettingsBlock";
import { renderSettings } from "./testkit";

const css = (name: string) =>
  readFileSync(new URL(name, import.meta.url), "utf8");

describe("settings layout", () => {
  it("has no 640px cap and sets cards side by side on wide content", () => {
    const page = css("./SettingsPage.module.css");
    expect(page).not.toMatch(/max-width:\s*640px/);
    expect(page).toMatch(/max-width:\s*1600px/);
    expect(page).not.toMatch(/margin-inline:\s*auto/);
    expect(page).toMatch(/container-type:\s*inline-size/);
    expect(page).toMatch(
      /@container[^{]*min-width:\s*960px[^{]*\{\s*\.content\s*\{\s*grid-template-columns:\s*repeat\(2/,
    );
  });

  it("gives a full-width block and wrapper their own class", () => {
    render(
      <>
        <SettingsBlock title="Pieno" span="full">
          x
        </SettingsBlock>
        <SettingsBlock title="Normale">x</SettingsBlock>
        <SettingsFull>
          <p>zona</p>
        </SettingsFull>
      </>,
    );
    expect(screen.getByRole("region", { name: "Pieno" }).className).toMatch(
      /full/,
    );
    expect(
      screen.getByRole("region", { name: "Normale" }).className,
    ).not.toMatch(/full/);
    expect(screen.getByText("zona").parentElement?.className).toMatch(/full/);
  });

  it("puts data blocks and danger zones on the whole row", async () => {
    renderSettings({}, "/settings/backup");
    expect(
      (await screen.findByRole("region", { name: /Backup automatici/i }))
        .className,
    ).toMatch(/full/);
  });
});

describe("settings styles", () => {
  const audit = css("./sections/audit/AuditSection.module.css");

  it("starts the page where the others start, with a readable maximum", () => {
    const page = css("./SettingsPage.module.css");
    expect(page).not.toMatch(/margin-inline:\s*auto|margin:\s*0\s+auto/);
    expect(page).toMatch(/\.page\s*\{[^}]*max-width:\s*1600px/);
  });

  it("keeps the audit columns at content width, without fixed widths", () => {
    const table = css("./sections/audit/AuditTable.tsx");
    expect(table).not.toMatch(/width:\s*'/);
    expect(audit).toMatch(/\.wide td:nth-child\(-n \+ 3\)[^{]*\{[^}]*white-space:\s*nowrap/);
  });

  it("clips a very long person or device name, with the full name in the title", () => {
    const table = css("./sections/audit/AuditTable.tsx");
    expect(table.match(/className=\{styles\.clip\} title=\{/g)).toHaveLength(2);
    expect(audit).toMatch(/\.clip\s*\{[^}]*max-width:\s*14rem[^}]*overflow:\s*hidden[^}]*text-overflow:\s*ellipsis/);
  });

  it("does not let screen readers read the separator dot", () => {
    expect(audit).toMatch(/content:\s*'·'\s*\/\s*''/);
  });

  it("turns each entry into a block inside a settings-content container query", () => {
    expect(audit).toMatch(/@container settings-content \(max-width:\s*720px\)\s*\{[\s\S]*\.wide tbody tr\s*\{[^}]*display:\s*flex/);
    expect(audit).toMatch(/@container settings-content[\s\S]*\.wide thead\s*\{[^}]*clip-path/);
    expect(audit).not.toMatch(/overflow-x:\s*(auto|scroll)/);
  });

  it("keeps the audit filters wider than the field cap of SettingsBlock", () => {
    const block = css("./SettingsBlock.module.css");
    // The cap lives in :where(), so it weighs one class; the filters weigh two and lift the cap.
    expect(block).toMatch(/\.body > :where\(input, select, label, form\)\s*\{[^}]*max-width:\s*28rem/);
    expect(audit).toMatch(/\.filters\.filters\s*\{[^}]*max-width:\s*none/);
    expect(audit).not.toMatch(/(^|\n)\.filters\s*\{/);
  });
});
