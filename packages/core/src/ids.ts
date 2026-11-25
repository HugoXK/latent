import { randomBytes } from "node:crypto";

export type IdPrefix = "frg" | "idea" | "clm" | "gate" | "brf" | "evt";

export function newId(prefix: IdPrefix): string {
  const time = Date.now().toString(36);
  const rand = randomBytes(6).toString("hex");
  return `${prefix}_${time}${rand}`;
}
