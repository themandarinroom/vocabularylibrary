export function fitSingleLineText(node, { minimumSize } = {}) {
  if (!node || node.hidden || !node.textContent) return;
  node.style.removeProperty("font-size");
  const available = node.parentElement?.clientWidth || 0;
  let naturalWidth = node.scrollWidth;
  if (!available || naturalWidth <= available) return;
  let currentSize = Number.parseFloat(getComputedStyle(node).fontSize) || 72;
  const minimum = minimumSize ?? (matchMedia("(max-width: 660px)").matches ? 28 : 34);
  for (let pass = 0; pass < 2 && naturalWidth > available; pass += 1) {
    currentSize = Math.max(minimum, Math.floor(currentSize * available / naturalWidth * 0.96));
    node.style.fontSize = `${currentSize}px`;
    naturalWidth = node.scrollWidth;
  }
}

export function scheduleSingleLineFit(node, options) {
  requestAnimationFrame(() => fitSingleLineText(node, options));
}

export const fitSingleLineHanzi = fitSingleLineText;
export const scheduleHanziFit = scheduleSingleLineFit;
