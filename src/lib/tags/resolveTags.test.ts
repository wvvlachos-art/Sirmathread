import { describe, it, expect } from "vitest";
import { resolveTags, tagIdsFor, type ExistingTagValue } from "./resolveTags";

const existing: ExistingTagValue[] = [
  { id: "v1", value: "Ting Lee" },
  { id: "v2", value: "Lodgify" },
  { id: "v3", value: "booking" },
];

describe("resolveTags", () => {
  it("links existing tags case-insensitively and creates the rest", () => {
    const r = resolveTags(["lodgify", "Horizon Villas", "BOOKING"], existing);
    expect(r.linkIds.sort()).toEqual(["v2", "v3"]);
    expect(r.toCreate).toEqual(["Horizon Villas"]);
  });

  it("de-dupes the detected list case-insensitively (first casing wins)", () => {
    const r = resolveTags(["Villas", "villas", "VILLAS"], []);
    expect(r.toCreate).toEqual(["Villas"]);
    expect(r.linkIds).toEqual([]);
  });

  it("trims whitespace on both sides of the match", () => {
    const r = resolveTags(["  ting lee  ", "  "], existing);
    expect(r.linkIds).toEqual(["v1"]);
    expect(r.toCreate).toEqual([]);
  });

  it("ignores empty / blank detected tags", () => {
    const r = resolveTags(["", "   ", "Lodgify"], existing);
    expect(r.linkIds).toEqual(["v2"]);
    expect(r.toCreate).toEqual([]);
  });

  it("first existing value wins on a duplicate-name collision", () => {
    const dupes: ExistingTagValue[] = [
      { id: "a", value: "Client" },
      { id: "b", value: "client" },
    ];
    const r = resolveTags(["client"], dupes);
    expect(r.linkIds).toEqual(["a"]);
  });

  it("empty input yields empty result", () => {
    const r = resolveTags([], existing);
    expect(r.linkIds).toEqual([]);
    expect(r.toCreate).toEqual([]);
    expect(r.matched.size).toBe(0);
  });

  it("exposes a lower(name)→id map for matched values", () => {
    const r = resolveTags(["LODGIFY", "Ting Lee"], existing);
    expect(r.matched.get("lodgify")).toBe("v2");
    expect(r.matched.get("ting lee")).toBe("v1");
  });
});

describe("tagIdsFor", () => {
  const map = new Map([
    ["lodgify", "v2"],
    ["ting lee", "v1"],
  ]);

  it("maps names to ids case-insensitively, deduped, in order", () => {
    expect(tagIdsFor(["Ting Lee", "lodgify", "TING LEE"], map)).toEqual(["v1", "v2"]);
  });

  it("skips names not present in the map", () => {
    expect(tagIdsFor(["Unknown", "Lodgify"], map)).toEqual(["v2"]);
  });

  it("handles undefined / empty input", () => {
    expect(tagIdsFor(undefined, map)).toEqual([]);
    expect(tagIdsFor([], map)).toEqual([]);
  });
});
