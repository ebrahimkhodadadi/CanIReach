import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { AppShell } from "./AppShell";

const __dirname = dirname(fileURLToPath(import.meta.url));
const appCss = readFileSync(resolve(__dirname, "../../App.css"), "utf8");

describe("AppShell", () => {
  it("renders a scrollable main content area for the app workspace", () => {
    const markup = renderToStaticMarkup(
      <AppShell activeTab="overview" onTabChange={() => {}} problemsCount={0}>
        <div>content</div>
      </AppShell>
    );

    expect(markup).toContain("overflow-auto");
    expect(markup).toContain("min-h-0");
  });

  it("defines a more readable global typography scale", () => {
    expect(appCss).toContain("15px");
    expect(appCss).toContain("0.95rem");
    expect(appCss).toContain(".text-xs");
  });
});
