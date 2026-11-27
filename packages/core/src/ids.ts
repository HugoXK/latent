import { randomBytes } from "node:crypto";

export type IdPrefix =
  | "frg"
  | "idea"
  | "clm"
  | "gate"
  | "brf"
  | "spec"
  | "evt"
  | "edg"
  | "outcome"
  | "sug"
  | "job";

export function newId(prefix: IdPrefix): string {
  const time = Date.now().toString(36);
  const rand = randomBytes(6).toString("hex");
  return `${prefix}_${time}${rand}`;
}
