import { describe, expect, it } from "vitest";
import { paginateItems } from "./Primitives";

describe("paginateItems", () => {
  it("returns the requested slice and pagination metadata", () => {
    const result = paginateItems([1, 2, 3, 4, 5], 2, 2);

    expect(result.items).toEqual([3, 4]);
    expect(result.currentPage).toBe(2);
    expect(result.totalPages).toBe(3);
    expect(result.totalItems).toBe(5);
    expect(result.hasPrev).toBe(true);
    expect(result.hasNext).toBe(true);
  });
});
