export function normalizeCoverFraming(value) {
  const clamp = (number, min, max, fallback) => typeof number === "number" && Number.isFinite(number)
    ? Math.max(min, Math.min(max, number)) : fallback;
  return { x: clamp(value?.x, 0, 100, 50), y: clamp(value?.y, 0, 100, 50), zoom: clamp(value?.zoom, 1, 2.5, 1) };
}

export function coverFramingStyle(value) {
  if (!value) return undefined;
  const { x, y, zoom } = normalizeCoverFraming(value);
  const position = `${x}% ${y}%`;
  return { objectPosition: position, transformOrigin: position, transform: zoom === 1 ? undefined : `scale(${zoom})` };
}
