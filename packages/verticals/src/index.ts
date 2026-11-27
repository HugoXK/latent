import type { VerticalPack } from "@latent/core";
import { igem } from "@latent/vertical-igem";
import { research } from "@latent/vertical-research";

export const VERTICALS: Readonly<Record<string, VerticalPack>> = {
  igem,
  research,
};

export function verticalById(id: string): VerticalPack {
  const pack = VERTICALS[id];
  if (!pack) throw new Error(`unknown vertical: ${id}`);
  return pack;
}

export function isVerticalId(id: string): boolean {
  return Object.prototype.hasOwnProperty.call(VERTICALS, id);
}

export function listVerticals(): VerticalPack[] {
  return Object.values(VERTICALS);
}
