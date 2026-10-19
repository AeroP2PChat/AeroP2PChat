import { defaultRangeExtractor } from "@tanstack/virtual-core";

export const DEFAULT_MESSAGE_WINDOW = 180;
export const MESSAGE_WINDOW_STEP = 180;

export function getMessageWindow(items, requestedCount = DEFAULT_MESSAGE_WINDOW) {
  const count = items.length;
  const visibleCount = Math.max(1, Math.min(count, requestedCount));
  const startIndex = Math.max(0, count - visibleCount);
  const indexes = defaultRangeExtractor({
    startIndex,
    endIndex: Math.max(startIndex, count - 1),
    overscan: 0,
    count,
  });
  return {
    items: indexes.map((index) => items[index]).filter(Boolean),
    hiddenCount: startIndex,
  };
}
