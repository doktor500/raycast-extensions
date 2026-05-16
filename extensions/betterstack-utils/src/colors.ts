import { createHash } from "node:crypto";

const SVG_PALETTE = ["#16C77A", "#7F88FF", "#FF8738", "#21A7FF", "#D36BFF", "#FF5E7A", "#E7B84A"];

function hashString(str: string): number {
  const hex = createHash("sha512").update(str).digest("hex");
  return parseInt(hex.slice(0, 8), 16);
}

export function getSvgColorForPerson(name: string): string {
  return SVG_PALETTE[hashString(name) % SVG_PALETTE.length];
}
