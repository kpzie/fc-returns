import { describe, it, expect } from "vitest";
import { validateReturn } from "@/lib/returns/validate";
import { readAcceptedReturn } from "./helpers/accepted-xml";

describe("validation rules against CBN-accepted data", () => {
  it("raises no errors on accepted call reports, apart from the SFCR sheets they don't include", () => {
    const errors = validateReturn(readAcceptedReturn()).issues.filter((i) => i.severity === "error");
    const unexpected = errors.filter((i) => !(i.rule === "missing-sheet" && i.sheet?.startsWith("SFCR")));
    expect(unexpected).toEqual([]);
    expect(errors).toHaveLength(7);
  });
});
