import { expect, type Page } from "@playwright/test";

type FocusStop = {
  label: string;
  tag: string;
  role: string | null;
  top: number;
  left: number;
  width: number;
  height: number;
  visibleFocus: boolean;
};

type ContrastIssue = {
  selector: string;
  text: string;
  ratio: number;
  threshold: number;
};

type LayoutIssue = {
  selector: string;
  issue: string;
};

export async function expectNoUnnamedInteractive(page: Page, rootSelector: string) {
  const failures = await page.evaluate((selector) => {
    const root = document.querySelector(selector);
    if (!root) return ["Missing root selector: " + selector];

    const isVisible = (element: Element) => {
      const rect = element.getBoundingClientRect();
      const style = window.getComputedStyle(element);
      return rect.width > 0 && rect.height > 0 && style.display !== "none" && style.visibility !== "hidden";
    };

    const textFromLabelledBy = (element: Element) =>
      (element.getAttribute("aria-labelledby") || "")
        .split(/\s+/)
        .map((id) => document.getElementById(id)?.textContent ?? "")
        .join(" ");

    const accessibleName = (element: Element) => {
      const input = element as HTMLInputElement;
      const labels = input.labels ? Array.from(input.labels).map((label) => label.textContent ?? "").join(" ") : "";
      return [
        element.getAttribute("aria-label"),
        textFromLabelledBy(element),
        labels,
        element.getAttribute("title"),
        input.placeholder,
        element.textContent,
      ]
        .join(" ")
        .replace(/\s+/g, " ")
        .trim();
    };

    return Array.from(
      root.querySelectorAll(
        'button, a[href], input:not([type="hidden"]), textarea, select, [role="button"], [role="tab"], [role="menuitem"]',
      ),
    )
      .filter((element) => isVisible(element) && !element.closest('[aria-hidden="true"]'))
      .filter((element) => accessibleName(element).length === 0)
      .map((element) => element.outerHTML.slice(0, 160));
  }, rootSelector);

  expect(failures).toEqual([]);
}

export async function expectKeyboardFocusOrder(page: Page, expectedLabels: RegExp[]) {
  await page.evaluate(() => {
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
  });

  const stops: FocusStop[] = [];
  for (let index = 0; index < expectedLabels.length; index += 1) {
    await page.keyboard.press("Tab");
    stops.push(await activeFocusStop(page));
  }

  stops.forEach((stop, index) => {
    expect.soft(stop.width, "focus stop " + (index + 1) + " should be visible").toBeGreaterThan(0);
    expect.soft(stop.height, "focus stop " + (index + 1) + " should be visible").toBeGreaterThan(0);
    expect.soft(stop.visibleFocus, (stop.label || stop.tag) + " should show a visible focus indicator").toBe(true);
    expect.soft(stop.label, "focus stop " + (index + 1)).toMatch(expectedLabels[index]);
    if (index > 0) {
      expect.soft(stop.top, "focus stop " + (index + 1) + " should not jump backward visually").toBeGreaterThanOrEqual(stops[index - 1].top - 16);
    }
  });

  expect(stops.map((stop) => stop.label)).toHaveLength(expectedLabels.length);
  return stops;
}

async function activeFocusStop(page: Page): Promise<FocusStop> {
  return page.evaluate(() => {
    const element = document.activeElement as HTMLElement | null;
    if (!element) {
      return { label: "", tag: "none", role: null, top: 0, left: 0, width: 0, height: 0, visibleFocus: false };
    }

    const textFromLabelledBy = (target: Element) =>
      (target.getAttribute("aria-labelledby") || "")
        .split(/\s+/)
        .map((id) => document.getElementById(id)?.textContent ?? "")
        .join(" ");
    const input = element as HTMLInputElement;
    const labels = input.labels ? Array.from(input.labels).map((label) => label.textContent ?? "").join(" ") : "";
    const label = [
      element.getAttribute("aria-label"),
      textFromLabelledBy(element),
      labels,
      element.getAttribute("title"),
      input.placeholder,
      element.textContent,
    ]
      .join(" ")
      .replace(/\s+/g, " ")
      .trim();
    const rect = element.getBoundingClientRect();
    const style = window.getComputedStyle(element);
    const outlineWidth = Number.parseFloat(style.outlineWidth) || 0;
    const visibleFocus =
      (style.outlineStyle !== "none" && outlineWidth >= 2) ||
      (style.boxShadow !== "none" && style.boxShadow !== "") ||
      style.outlineColor === "rgb(37, 99, 235)";

    return {
      label,
      tag: element.tagName.toLowerCase(),
      role: element.getAttribute("role"),
      top: Math.round(rect.top),
      left: Math.round(rect.left),
      width: Math.round(rect.width),
      height: Math.round(rect.height),
      visibleFocus,
    };
  });
}

export async function expectContrast(page: Page, selectors: string[]) {
  const issues = await page.evaluate((targetSelectors) => {
    const parseColor = (value: string) => {
      const match = value.match(/rgba?\(([^)]+)\)/);
      if (!match) return null;
      const [r, g, b, a = "1"] = match[1].split(",").map((part) => part.trim());
      return { r: Number(r), g: Number(g), b: Number(b), a: Number(a) };
    };
    const blend = (top: { r: number; g: number; b: number; a: number }, bottom: { r: number; g: number; b: number; a: number }) => {
      const alpha = top.a + bottom.a * (1 - top.a);
      return {
        r: Math.round((top.r * top.a + bottom.r * bottom.a * (1 - top.a)) / alpha),
        g: Math.round((top.g * top.a + bottom.g * bottom.a * (1 - top.a)) / alpha),
        b: Math.round((top.b * top.a + bottom.b * bottom.a * (1 - top.a)) / alpha),
        a: alpha,
      };
    };
    const channel = (value: number) => {
      const scaled = value / 255;
      return scaled <= 0.03928 ? scaled / 12.92 : ((scaled + 0.055) / 1.055) ** 2.4;
    };
    const luminance = (color: { r: number; g: number; b: number }) =>
      0.2126 * channel(color.r) + 0.7152 * channel(color.g) + 0.0722 * channel(color.b);
    const contrast = (a: { r: number; g: number; b: number }, b: { r: number; g: number; b: number }) => {
      const light = Math.max(luminance(a), luminance(b));
      const dark = Math.min(luminance(a), luminance(b));
      return (light + 0.05) / (dark + 0.05);
    };
    const effectiveBackground = (element: Element) => {
      const colors: Array<{ r: number; g: number; b: number; a: number }> = [];
      let current: Element | null = element;
      while (current) {
        const parsed = parseColor(window.getComputedStyle(current).backgroundColor);
        if (parsed && parsed.a > 0) colors.unshift(parsed);
        current = current.parentElement;
      }
      return colors.reduce((background, color) => blend(color, background), { r: 255, g: 255, b: 255, a: 1 });
    };
    const isVisible = (element: Element) => {
      const rect = element.getBoundingClientRect();
      const style = window.getComputedStyle(element);
      return rect.width > 0 && rect.height > 0 && style.display !== "none" && style.visibility !== "hidden";
    };

    const failures: ContrastIssue[] = [];
    for (const selector of targetSelectors) {
      for (const element of Array.from(document.querySelectorAll(selector))) {
        if (!isVisible(element)) continue;
        const text = (element.textContent || "").replace(/\s+/g, " ").trim();
        if (!text) continue;
        const style = window.getComputedStyle(element);
        const foreground = parseColor(style.color);
        if (!foreground) continue;
        const background = effectiveBackground(element);
        const foregroundOverBackground = foreground.a < 1 ? blend(foreground, background) : foreground;
        const ratio = contrast(foregroundOverBackground, background);
        const fontSize = Number.parseFloat(style.fontSize) || 16;
        const numericWeight = Number.parseInt(style.fontWeight, 10);
        const fontWeight = Number.isNaN(numericWeight) ? (style.fontWeight === "bold" ? 700 : 400) : numericWeight;
        const largeText = fontSize >= 24 || (fontSize >= 18.66 && fontWeight >= 700);
        const threshold = largeText ? 3 : 4.5;
        if (ratio + 0.01 < threshold) {
          failures.push({ selector, text: text.slice(0, 80), ratio: Number(ratio.toFixed(2)), threshold });
        }
      }
    }
    return failures;
  }, selectors);

  expect(issues).toEqual([]);
}

export async function expectReadableMobileLayout(page: Page, rootSelector: string) {
  const issues = await page.evaluate((selector) => {
    const root = document.querySelector(selector);
    if (!root) return [{ selector, issue: "missing root" }];
    const failures: LayoutIssue[] = [];
    if (document.documentElement.scrollWidth > window.innerWidth + 4) {
      failures.push({ selector: "document", issue: "horizontal overflow: " + document.documentElement.scrollWidth + "px > " + window.innerWidth + "px" });
    }

    const watched = Array.from(
      root.querySelectorAll('h1, h2, p, .landing-primary, .landing-secondary, .landing-platform-list button, .landing-mobile-card, .mobile-step, .landing-feature-matrix article, .landing-doc-section, .landing-screenshot-card, .landing-workflow-strip article, .demo-choice-card'),
    );
    for (const element of watched) {
      const rect = element.getBoundingClientRect();
      const style = window.getComputedStyle(element);
      if (rect.width === 0 || rect.height === 0 || style.display === "none" || style.visibility === "hidden") continue;
      const className = String((element as HTMLElement).className || "").replace(/\s+/g, ".");
      const label = element.tagName.toLowerCase() + (className ? "." + className : "");
      if (rect.left < -2 || rect.right > window.innerWidth + 2) {
        failures.push({ selector: label, issue: "extends outside the phone viewport" });
      }
      if (element.scrollWidth > element.clientWidth + 2 || element.scrollHeight > element.clientHeight + 2) {
        failures.push({ selector: label, issue: "clips or scrolls its own text" });
      }
    }

    const tapTargets = Array.from(root.querySelectorAll('.landing-primary, .landing-secondary, .landing-platform-list button, .landing-nav-link, .landing-link-button, .landing-screenshot-preview, .demo-download-card .ghost-button'));
    for (const element of tapTargets) {
      const rect = element.getBoundingClientRect();
      const style = window.getComputedStyle(element);
      if (rect.width === 0 || rect.height === 0 || style.display === "none" || style.visibility === "hidden") continue;
      if (rect.width < 44 || rect.height < 44) {
        failures.push({ selector: element.textContent?.replace(/\s+/g, " ").trim() || element.tagName.toLowerCase(), issue: "primary touch target is smaller than 44px" });
      }
    }
    return failures;
  }, rootSelector);

  expect(issues).toEqual([]);
}
