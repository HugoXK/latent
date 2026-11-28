import test from "node:test";
import assert from "node:assert/strict";
import { canonicalize, mechanismFamily } from "../src/index.js";

test("the canonical tuple normalizes case, spaces and punctuation", () => {
  const tuple = canonicalize({
    mechanism: "  Arsenic Responsive Repressor ",
    interface: "Whole-cell fluorescence",
    host: "E. coli",
    readout: "Fluorescence",
  });
  assert.equal(tuple.mechanism, "arsenic-responsive-repressor");
  assert.equal(tuple.interface, "whole-cell-fluorescence");
  assert.equal(tuple.host, "e-coli");
  assert.equal(tuple.readout, "fluorescence");
});

test("known mechanism aliases share a family", () => {
  assert.equal(mechanismFamily("ArsR"), "arsenic-responsive-repressor");
  assert.equal(mechanismFamily("CRISPR-Cas9"), "crispr");
  assert.equal(mechanismFamily("Other Mechanism"), "other-mechanism");
});
