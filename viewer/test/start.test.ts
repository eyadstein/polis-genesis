import { describe, expect, it } from "vitest";
import { loadDefaultTown } from "../src/start";
import { makeTown } from "./fixtures";

function reply(body: string, type: string, status = 200): typeof fetch {
  return (async () => new Response(body, { status, headers: { "content-type": type } })) as typeof fetch;
}

describe("looking for a town next to the viewer", () => {
  it("loads a real town file", async () => {
    const town = await loadDefaultTown(reply(JSON.stringify(makeTown()), "application/json"));
    expect(town?.people).toHaveLength(6);
  });

  it("treats the web page the dev server sends for a missing file as no file", async () => {
    expect(await loadDefaultTown(reply("<!doctype html><html></html>", "text/html"))).toBeNull();
  });

  it("treats an error status as no file", async () => {
    expect(await loadDefaultTown(reply("nope", "application/json", 404))).toBeNull();
  });

  it("treats a failed request as no file", async () => {
    const broken = (async () => {
      throw new TypeError("network down");
    }) as typeof fetch;
    expect(await loadDefaultTown(broken)).toBeNull();
  });

  it("still complains about a JSON file that is not a town", async () => {
    await expect(loadDefaultTown(reply("{\"hello\": 1}", "application/json"))).rejects.toThrow("version");
  });
});
