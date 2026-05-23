const SVG_PALETTE = ["#16C77A", "#FF5E7A", "#21A7FF", "#D36BFF", "#FF8738", "#7F88FF", "#E7B84A"];

export function buildColorMap(names: string[]): Map<string, string> {
  const map = new Map<string, string>();
  names.forEach((name, index) => {
    map.set(name, SVG_PALETTE[index % SVG_PALETTE.length]);
  });
  return map;
}

function linearize(c: number): number {
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

function relativeLuminance(hex: string): number {
  const r = linearize(parseInt(hex.slice(1, 3), 16) / 255);
  const g = linearize(parseInt(hex.slice(3, 5), 16) / 255);
  const b = linearize(parseInt(hex.slice(5, 7), 16) / 255);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function getTextColor(bgHex: string): string {
  return relativeLuminance(bgHex) > 0.179 ? "#1A2235" : "#FFFFFF";
}
