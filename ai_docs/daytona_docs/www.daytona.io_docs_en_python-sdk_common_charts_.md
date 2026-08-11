---
url: "https://www.daytona.io/docs/en/python-sdk/common/charts/"
title: "Charts | Daytona"
---

[Skip to content](https://www.daytona.io/docs/en/python-sdk/common/charts/#_top)

Copy for LLM[View as Markdown](https://www.daytona.io/docs/en/python-sdk/common/charts.md)Open

## [\#](https://www.daytona.io/docs/en/python-sdk/common/charts/\#chart) Chart

[Section titled “Chart”](https://www.daytona.io/docs/en/python-sdk/common/charts/#chart)

```
class Chart(GeneratedChart)
```

Base chart class. All chart types inherit from this. Fields are sourced from the daemon’s typed response.

## [\#](https://www.daytona.io/docs/en/python-sdk/common/charts/\#charttype) ChartType

[Section titled “ChartType”](https://www.daytona.io/docs/en/python-sdk/common/charts/#charttype)

```
class ChartType(str, Enum)
```

Supported chart types returned by the daemon’s code-run endpoint.

## [\#](https://www.daytona.io/docs/en/python-sdk/common/charts/\#pointdata) PointData

[Section titled “PointData”](https://www.daytona.io/docs/en/python-sdk/common/charts/#pointdata)

```
class PointData(GeneratedChartElement)
```

Data element for line and scatter charts. Fields: label, points.

## [\#](https://www.daytona.io/docs/en/python-sdk/common/charts/\#bardata) BarData

[Section titled “BarData”](https://www.daytona.io/docs/en/python-sdk/common/charts/#bardata)

```
class BarData(GeneratedChartElement)
```

Data element for bar charts. Fields: label, value, group.

## [\#](https://www.daytona.io/docs/en/python-sdk/common/charts/\#piedata) PieData

[Section titled “PieData”](https://www.daytona.io/docs/en/python-sdk/common/charts/#piedata)

```
class PieData(GeneratedChartElement)
```

Data element for pie charts. Fields: label, angle, radius.

## [\#](https://www.daytona.io/docs/en/python-sdk/common/charts/\#boxandwhiskerdata) BoxAndWhiskerData

[Section titled “BoxAndWhiskerData”](https://www.daytona.io/docs/en/python-sdk/common/charts/#boxandwhiskerdata)

```
class BoxAndWhiskerData(GeneratedChartElement)
```

Data element for box-and-whisker charts.
Fields: label, min, first\_quartile, median, third\_quartile, max, outliers.

## [\#](https://www.daytona.io/docs/en/python-sdk/common/charts/\#chart2d) Chart2D

[Section titled “Chart2D”](https://www.daytona.io/docs/en/python-sdk/common/charts/#chart2d)

```
class Chart2D(Chart)
```

Chart with x/y axes. Adds x\_label, y\_label fields.

## [\#](https://www.daytona.io/docs/en/python-sdk/common/charts/\#pointchart) PointChart

[Section titled “PointChart”](https://www.daytona.io/docs/en/python-sdk/common/charts/#pointchart)

```
class PointChart(Chart2D)
```

Chart with axis ticks and scales. Adds x\_ticks, y\_ticks, x\_scale, y\_scale fields.

## [\#](https://www.daytona.io/docs/en/python-sdk/common/charts/\#linechart) LineChart

[Section titled “LineChart”](https://www.daytona.io/docs/en/python-sdk/common/charts/#linechart)

```
class LineChart(PointChart)
```

Line chart. Elements are PointData.

## [\#](https://www.daytona.io/docs/en/python-sdk/common/charts/\#scatterchart) ScatterChart

[Section titled “ScatterChart”](https://www.daytona.io/docs/en/python-sdk/common/charts/#scatterchart)

```
class ScatterChart(PointChart)
```

Scatter plot. Elements are PointData.

## [\#](https://www.daytona.io/docs/en/python-sdk/common/charts/\#barchart) BarChart

[Section titled “BarChart”](https://www.daytona.io/docs/en/python-sdk/common/charts/#barchart)

```
class BarChart(Chart2D)
```

Bar chart. Elements are BarData.

## [\#](https://www.daytona.io/docs/en/python-sdk/common/charts/\#piechart) PieChart

[Section titled “PieChart”](https://www.daytona.io/docs/en/python-sdk/common/charts/#piechart)

```
class PieChart(Chart)
```

Pie chart. Elements are PieData.

## [\#](https://www.daytona.io/docs/en/python-sdk/common/charts/\#boxandwhiskerchart) BoxAndWhiskerChart

[Section titled “BoxAndWhiskerChart”](https://www.daytona.io/docs/en/python-sdk/common/charts/#boxandwhiskerchart)

```
class BoxAndWhiskerChart(Chart2D)
```

Box-and-whisker chart. Elements are BoxAndWhiskerData.

## [\#](https://www.daytona.io/docs/en/python-sdk/common/charts/\#compositechart) CompositeChart

[Section titled “CompositeChart”](https://www.daytona.io/docs/en/python-sdk/common/charts/#compositechart)

```
class CompositeChart(Chart)
```

Composite chart containing multiple sub-charts as elements.