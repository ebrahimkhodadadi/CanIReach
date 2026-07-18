import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { AppShell } from "./AppShell";

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
});
