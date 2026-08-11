---
url: "https://www.daytona.io/docs/en/typescript-sdk/charts/"
title: "Charts | Daytona"
---

[Skip to content](https://www.daytona.io/docs/en/typescript-sdk/charts/#_top)

Copy for LLM[View as Markdown](https://www.daytona.io/docs/en/typescript-sdk/charts.md)Open

## [\#](https://www.daytona.io/docs/en/typescript-sdk/charts/\#charttype) ChartType

[Section titled “ChartType”](https://www.daytona.io/docs/en/typescript-sdk/charts/#charttype)

**Enum Members**:

- `BAR` (“bar”)
- `LINE` (“line”)
- `PIE` (“pie”)
- `SCATTER` (“scatter”)
- `UNKNOWN` (“unknown”)

## [\#](https://www.daytona.io/docs/en/typescript-sdk/charts/\#parsechart) parseChart()

[Section titled “parseChart()”](https://www.daytona.io/docs/en/typescript-sdk/charts/#parsechart)

```
function parseChart(chart: Chart): Chart
```

**Parameters**:

- `chart` _Chart_

**Returns**:

- `Chart`

* * *

## [\#](https://www.daytona.io/docs/en/typescript-sdk/charts/\#barchart) BarChart

[Section titled “BarChart”](https://www.daytona.io/docs/en/typescript-sdk/charts/#barchart)

```
type BarChart = Chart2D & {

  type: "bar";

};
```

**Type declaration**:

- `type` _“bar”_

## [\#](https://www.daytona.io/docs/en/typescript-sdk/charts/\#bardata) BarData

[Section titled “BarData”](https://www.daytona.io/docs/en/typescript-sdk/charts/#bardata)

```
type BarData = Pick<GeneratedChartElement, "group" | "label" | "value">;
```

* * *

## [\#](https://www.daytona.io/docs/en/typescript-sdk/charts/\#boxandwhiskerchart) BoxAndWhiskerChart

[Section titled “BoxAndWhiskerChart”](https://www.daytona.io/docs/en/typescript-sdk/charts/#boxandwhiskerchart)

```
type BoxAndWhiskerChart = Chart2D & {

  type: "box_and_whisker";

};
```

**Type declaration**:

- `type` _“box\_and\_whisker”_

## [\#](https://www.daytona.io/docs/en/typescript-sdk/charts/\#boxandwhiskerdata) BoxAndWhiskerData

[Section titled “BoxAndWhiskerData”](https://www.daytona.io/docs/en/typescript-sdk/charts/#boxandwhiskerdata)

```
type BoxAndWhiskerData = Pick<GeneratedChartElement, "first_quartile" | "label" | "max" | "median" | "min" | "outliers">;
```

* * *

## [\#](https://www.daytona.io/docs/en/typescript-sdk/charts/\#chart) Chart

[Section titled “Chart”](https://www.daytona.io/docs/en/typescript-sdk/charts/#chart)

```
type Chart = GeneratedChart;
```

* * *

## [\#](https://www.daytona.io/docs/en/typescript-sdk/charts/\#chart2d) Chart2D

[Section titled “Chart2D”](https://www.daytona.io/docs/en/typescript-sdk/charts/#chart2d)

```
type Chart2D = Pick<GeneratedChart, "type" | "title" | "png" | "x_label" | "y_label" | "elements">;
```

* * *

## [\#](https://www.daytona.io/docs/en/typescript-sdk/charts/\#chartelement) ChartElement

[Section titled “ChartElement”](https://www.daytona.io/docs/en/typescript-sdk/charts/#chartelement)

```
type ChartElement = GeneratedChartElement;
```

* * *

## [\#](https://www.daytona.io/docs/en/typescript-sdk/charts/\#compositechart) CompositeChart

[Section titled “CompositeChart”](https://www.daytona.io/docs/en/typescript-sdk/charts/#compositechart)

```
type CompositeChart = Pick<GeneratedChart, "type" | "title" | "png" | "elements"> & {

  type: "composite_chart";

};
```

**Type declaration**:

- `type` _“composite\_chart”_

## [\#](https://www.daytona.io/docs/en/typescript-sdk/charts/\#linechart) LineChart

[Section titled “LineChart”](https://www.daytona.io/docs/en/typescript-sdk/charts/#linechart)

```
type LineChart = PointChart & {

  type: "line";

};
```

**Type declaration**:

- `type` _“line”_

## [\#](https://www.daytona.io/docs/en/typescript-sdk/charts/\#piechart) PieChart

[Section titled “PieChart”](https://www.daytona.io/docs/en/typescript-sdk/charts/#piechart)

```
type PieChart = Pick<GeneratedChart, "type" | "title" | "png" | "elements"> & {

  type: "pie";

};
```

**Type declaration**:

- `type` _“pie”_

## [\#](https://www.daytona.io/docs/en/typescript-sdk/charts/\#piedata) PieData

[Section titled “PieData”](https://www.daytona.io/docs/en/typescript-sdk/charts/#piedata)

```
type PieData = Pick<GeneratedChartElement, "angle" | "label" | "radius">;
```

* * *

## [\#](https://www.daytona.io/docs/en/typescript-sdk/charts/\#pointchart) PointChart

[Section titled “PointChart”](https://www.daytona.io/docs/en/typescript-sdk/charts/#pointchart)

```
type PointChart = Pick<GeneratedChart,

  | "type"

  | "title"

  | "png"

  | "x_label"

  | "y_label"

  | "x_ticks"

  | "y_ticks"

  | "x_tick_labels"

  | "y_tick_labels"

  | "x_scale"

  | "y_scale"

| "elements">;
```

* * *

## [\#](https://www.daytona.io/docs/en/typescript-sdk/charts/\#pointdata) PointData

[Section titled “PointData”](https://www.daytona.io/docs/en/typescript-sdk/charts/#pointdata)

```
type PointData = Pick<GeneratedChartElement, "label" | "points">;
```

* * *

## [\#](https://www.daytona.io/docs/en/typescript-sdk/charts/\#scatterchart) ScatterChart

[Section titled “ScatterChart”](https://www.daytona.io/docs/en/typescript-sdk/charts/#scatterchart)

```
type ScatterChart = PointChart & {

  type: "scatter";

};
```

**Type declaration**:

- `type` _“scatter”_