import { parseTown } from "./load";
import type { Town } from "./types";

/**
 * Looks for a town file served next to the viewer. Returns null when there is
 * none. The development server answers a missing file with the web page
 * itself, so only a reply that really is JSON counts as a town.
 */
export async function loadDefaultTown(
  fetchFn: typeof fetch = fetch,
  url = "/town.json",
): Promise<Town | null> {
  let response: Response;
  try {
    response = await fetchFn(url);
  } catch {
    return null;
  }
  if (!response.ok) return null;
  const type = response.headers.get("content-type") ?? "";
  if (!type.includes("json")) return null;
  return parseTown(await response.text());
}
