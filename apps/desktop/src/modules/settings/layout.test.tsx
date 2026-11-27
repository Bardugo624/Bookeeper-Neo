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
    expect(page).toMatch(/max-width:\s*1280px/);
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
