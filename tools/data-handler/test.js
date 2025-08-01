import * as vega from 'vega';
import * as vegaLite from 'vega-lite';
import fs from 'fs';

/**
 * Generate a pie chart SVG using Vega-Lite.
 * @param {number[]} data - Array of values for the pie slices.
 * @param {string[]} labels - Array of labels for the slices.
 * @param {string[]} [colors] - Array of color strings for the slices.
 * @param {number} [width=400] - Width of the SVG.
 * @param {number} [height=400] - Height of the SVG.
 * @returns {Promise<string>} SVG string
 */
async function generateVegaLitePieSVG(
  data,
  labels,
  colors = ['#ff6384', '#36a2eb', '#ffce56', '#4bc0c0'],
  width = 400,
  height = 400
) {
  const values = labels.map((label, i) => ({ category: label, value: data[i] }));

  const vlSpec = {
    "$schema": "https://vega.github.io/schema/vega-lite/v6.json",
    "description": "Pie Chart with percentage_tooltip",
    "data": {
      "values": [
        {"category": 1, "value": 4},
        {"category": 2, "value": 6},
        {"category": 3, "value": 10},
        {"category": 4, "value": 3},
        {"category": 5, "value": 7},
        {"category": 6, "value": 8}
      ]
    },
    "mark": {"type": "arc", "tooltip": true},
    "encoding": {
      "theta": {"field": "value", "type": "quantitative", "stack": "normalize"},
      "color": {"field": "category", "type": "nominal"}
    }
  }
  

  const compiled = vegaLite.compile(vlSpec).spec;
  const view = new vega.View(vega.parse(compiled), { renderer: 'none' });
  return await view.toSVG();
}

// Usage example:
generateVegaLitePieSVG([30, 70, 45, 55], ['A', 'B', 'C', 'D']).then(svg => {
  console.log(svg);
});