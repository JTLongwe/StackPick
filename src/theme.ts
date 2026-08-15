/**
 * The chart series palette.
 *
 * These eight hues were validated with the data-viz validator against the
 * app's actual chart surface (#14181f): every slot clears the dark lightness
 * band, the chroma floor, adjacent-pair CVD separation, the normal-vision
 * floor, and 3:1 contrast. The ORDER is the colorblind-safety mechanism, not
 * decoration. Assign slots in sequence and never cycle or reorder them.
 *
 * The chart also carries direct end-labels, so identity never rests on hue alone.
 *
 * Surface and ink values mirror the tokens in style.css. Chart.js paints to a
 * canvas and cannot read CSS custom properties, so they are duplicated here;
 * change them in both places or not at all.
 */
export const SERIES_PALETTE = [
  '#3987e5', // blue
  '#d95926', // orange
  '#199e70', // aqua
  '#c98500', // yellow
  '#d55181', // magenta
  '#008300', // green
  '#9085e9', // violet
  '#e66767', // red
] as const

export const CHART_INK = {
  grid: '#222836',
  axis: '#39414f',
  text: '#96a0b0',
  label: '#e6eaf0',
  surface: '#14181f',
  tooltipBg: '#1b2029',
  tooltipBorder: '#37404f',
}
