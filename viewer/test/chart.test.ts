import { describe, expect, it } from "vitest";
import { barChart, esc, historyChart, lineChart } from "../src/chart";
import { wealthBuckets } from "../src/stats";
import { makeTown } from "./fixtures";

describe("esc", () => {
  it("escapes the characters that could break out of text", () => {
    expect(esc(`<script>"&"</script>`)).toBe("&lt;script&gt;&quot;&amp;&quot;&lt;/script&gt;");
  });
});

describe("line charts", () => {
  it("describe themselves for screen readers", () => {
    const svg = lineChart("Population", [0, 10], [{ label: "Living", color: "#000", values: [4, 9] }]);
    expect(svg).toContain('role="img"');
    expect(svg).toContain("Population. Living ends at 9");
    expect(svg).toContain("<polyline");
  });

  it("survive empty and all zero data", () => {
    expect(() => lineChart("Empty", [], [])).not.toThrow();
    const flat = lineChart("Flat", [0, 1], [{ label: "Zero", color: "#000", values: [0, 0] }]);
    expect(flat).not.toContain("NaN");
  });

  it("escape titles and labels", () => {
    const svg = lineChart(`<b>Bad</b>`, [0], [{ label: `<i>x</i>`, color: "#000", values: [1] }]);
    expect(svg).not.toContain("<b>");
    expect(svg).not.toContain("<i>");
  });

  it("draw one line per field of the history", () => {
    const town = makeTown();
    const svg = historyChart("Work", town.history, [
      { key: "employed", label: "Employed", color: "#111" },
      { key: "homeless", label: "Homeless", color: "#222" },
    ]);
    expect(svg.match(/<polyline/g)).toHaveLength(2);
  });
});

describe("bar charts", () => {
  it("draw one bar per bucket with a text label", () => {
    const town = makeTown();
    const svg = barChart("Savings", wealthBuckets(town.people), "#123456");
    expect(svg.match(/<rect/g)).toHaveLength(10);
    expect(svg).toContain("people</title>");
    expect(svg).not.toContain("NaN");
  });
});
