import { Box, Stack, Typography } from "@mui/material";

interface ChartLegendItem {
  label: string;
  color: string;
}

export interface LineAreaSeries {
  key: string;
  label: string;
  color: string;
  fillOpacity?: number;
}

export interface LineAreaDatum {
  label: string;
  [key: string]: number | string | undefined;
}

export interface StackedBarSegment {
  label: string;
  value: number;
  color: string;
}

export interface StackedBarDatum {
  label: string;
  segments: StackedBarSegment[];
}

export interface DonutSegment {
  label: string;
  value: number;
  color: string;
}

function clampNumber(value: number): number {
  return Number.isFinite(value) ? value : 0;
}

function polarToCartesian(cx: number, cy: number, radius: number, angleInDegrees: number) {
  const angleInRadians = ((angleInDegrees - 90) * Math.PI) / 180;
  return {
    x: cx + radius * Math.cos(angleInRadians),
    y: cy + radius * Math.sin(angleInRadians),
  };
}

function arcPath(cx: number, cy: number, radius: number, startAngle: number, endAngle: number) {
  const start = polarToCartesian(cx, cy, radius, endAngle);
  const end = polarToCartesian(cx, cy, radius, startAngle);
  const largeArcFlag = endAngle - startAngle <= 180 ? 0 : 1;
  return `M ${start.x} ${start.y} A ${radius} ${radius} 0 ${largeArcFlag} 0 ${end.x} ${end.y}`;
}

function Legend({ items }: { items: ChartLegendItem[] }) {
  return (
    <Stack direction="row" spacing={1.5} useFlexGap flexWrap="wrap">
      {items.map((item) => (
        <Stack key={item.label} direction="row" spacing={0.75} alignItems="center">
          <Box
            sx={{
              width: 10,
              height: 10,
              borderRadius: "999px",
              backgroundColor: item.color,
              flexShrink: 0,
            }}
          />
          <Typography variant="caption" color="text.secondary">
            {item.label}
          </Typography>
        </Stack>
      ))}
    </Stack>
  );
}

export function LineAreaChart({
  data,
  series,
  height = 220,
}: {
  data: LineAreaDatum[];
  series: LineAreaSeries[];
  height?: number;
}) {
  const width = Math.max(360, data.length * 52);
  const padding = { top: 16, right: 12, bottom: 28, left: 10 };
  const innerHeight = height - padding.top - padding.bottom;
  const innerWidth = width - padding.left - padding.right;
  const maxValue = Math.max(
    1,
    ...data.flatMap((entry) => series.map((item) => clampNumber(Number(entry[item.key] ?? 0)))),
  );
  const labelStep = data.length > 7 ? Math.ceil(data.length / 6) : 1;

  function x(index: number) {
    if (data.length <= 1) {
      return padding.left + innerWidth / 2;
    }

    return padding.left + (index / (data.length - 1)) * innerWidth;
  }

  function y(value: number) {
    return padding.top + innerHeight - (clampNumber(value) / maxValue) * innerHeight;
  }

  function linePath(key: string) {
    return data
      .map((entry, index) => `${index === 0 ? "M" : "L"} ${x(index)} ${y(Number(entry[key] ?? 0))}`)
      .join(" ");
  }

  function areaPath(key: string) {
    if (data.length === 0) {
      return "";
    }

    const line = linePath(key);
    const lastX = x(data.length - 1);
    const firstX = x(0);
    const baseY = padding.top + innerHeight;
    return `${line} L ${lastX} ${baseY} L ${firstX} ${baseY} Z`;
  }

  return (
    <Stack spacing={1.5}>
      <Box sx={{ width: "100%", overflowX: "auto" }}>
        <svg viewBox={`0 0 ${width} ${height}`} width="100%" height={height} role="img" aria-label="Line chart">
          {[0, 1, 2, 3].map((step) => {
            const guideY = padding.top + (innerHeight / 3) * step;
            return (
              <line
                key={step}
                x1={padding.left}
                y1={guideY}
                x2={padding.left + innerWidth}
                y2={guideY}
                stroke="currentColor"
                strokeOpacity={0.1}
                strokeDasharray="4 4"
              />
            );
          })}

          {series.map((item, index) => (
            <g key={item.key}>
              {index === 0 ? (
                <path d={areaPath(item.key)} fill={item.color} fillOpacity={item.fillOpacity ?? 0.12} />
              ) : null}
              <path
                d={linePath(item.key)}
                fill="none"
                stroke={item.color}
                strokeWidth={3}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              {data.map((entry, pointIndex) => (
                <circle
                  key={`${item.key}-${entry.label}`}
                  cx={x(pointIndex)}
                  cy={y(Number(entry[item.key] ?? 0))}
                  r={3}
                  fill={item.color}
                />
              ))}
            </g>
          ))}

          {data.map((entry, index) =>
            index % labelStep === 0 || index === data.length - 1 ? (
              <text
                key={entry.label}
                x={x(index)}
                y={height - 8}
                textAnchor="middle"
                fontSize="11"
                fill="currentColor"
                opacity="0.55"
              >
                {entry.label}
              </text>
            ) : null,
          )}
        </svg>
      </Box>

      <Legend items={series.map((item) => ({ label: item.label, color: item.color }))} />
    </Stack>
  );
}

export function StackedBarChart({
  data,
  height = 230,
}: {
  data: StackedBarDatum[];
  height?: number;
}) {
  const width = Math.max(360, data.length * 72);
  const padding = { top: 16, right: 12, bottom: 36, left: 10 };
  const innerHeight = height - padding.top - padding.bottom;
  const innerWidth = width - padding.left - padding.right;
  const maxTotal = Math.max(
    1,
    ...data.map((entry) => entry.segments.reduce((sum, segment) => sum + clampNumber(segment.value), 0)),
  );
  const barWidth = Math.min(42, innerWidth / Math.max(data.length, 1) - 12);
  const legendMap = new Map<string, string>();

  for (const entry of data) {
    for (const segment of entry.segments) {
      if (!legendMap.has(segment.label)) {
        legendMap.set(segment.label, segment.color);
      }
    }
  }

  return (
    <Stack spacing={1.5}>
      <Box sx={{ width: "100%", overflowX: "auto" }}>
        <svg viewBox={`0 0 ${width} ${height}`} width="100%" height={height} role="img" aria-label="Stacked bar chart">
          {[0, 1, 2, 3].map((step) => {
            const guideY = padding.top + (innerHeight / 3) * step;
            return (
              <line
                key={step}
                x1={padding.left}
                y1={guideY}
                x2={padding.left + innerWidth}
                y2={guideY}
                stroke="currentColor"
                strokeOpacity={0.1}
                strokeDasharray="4 4"
              />
            );
          })}

          {data.map((entry, index) => {
            const total = entry.segments.reduce((sum, segment) => sum + clampNumber(segment.value), 0);
            let offsetHeight = 0;
            const xPosition =
              padding.left +
              (index + 0.5) * (innerWidth / Math.max(data.length, 1)) -
              barWidth / 2;

            return (
              <g key={entry.label}>
                {entry.segments.map((segment) => {
                  const segmentHeight = (clampNumber(segment.value) / maxTotal) * innerHeight;
                  const yPosition = padding.top + innerHeight - offsetHeight - segmentHeight;
                  offsetHeight += segmentHeight;
                  return (
                    <rect
                      key={`${entry.label}-${segment.label}`}
                      x={xPosition}
                      y={yPosition}
                      width={barWidth}
                      height={segmentHeight}
                      rx={segmentHeight > 8 ? 8 : 4}
                      fill={segment.color}
                    />
                  );
                })}

                <text
                  x={xPosition + barWidth / 2}
                  y={height - 10}
                  textAnchor="middle"
                  fontSize="11"
                  fill="currentColor"
                  opacity="0.55"
                >
                  {entry.label}
                </text>
                <text
                  x={xPosition + barWidth / 2}
                  y={padding.top + innerHeight - ((total / maxTotal) * innerHeight) - 8}
                  textAnchor="middle"
                  fontSize="11"
                  fill="currentColor"
                  opacity="0.7"
                >
                  {Math.round(total)}
                </text>
              </g>
            );
          })}
        </svg>
      </Box>

      <Legend items={[...legendMap.entries()].map(([label, color]) => ({ label, color }))} />
    </Stack>
  );
}

export function DonutChart({
  segments,
  centerLabel,
  centerValue,
  size = 220,
  thickness = 28,
}: {
  segments: DonutSegment[];
  centerLabel: string;
  centerValue: string;
  size?: number;
  thickness?: number;
}) {
  const total = Math.max(0, segments.reduce((sum, segment) => sum + clampNumber(segment.value), 0));
  const radius = size / 2 - thickness / 2 - 8;
  const center = size / 2;
  let startAngle = 0;

  return (
    <Stack direction={{ xs: "column", sm: "row" }} spacing={2.5} alignItems="center">
      <Box sx={{ width: size, height: size, flexShrink: 0 }}>
        <svg viewBox={`0 0 ${size} ${size}`} width={size} height={size} role="img" aria-label="Donut chart">
          <circle
            cx={center}
            cy={center}
            r={radius}
            fill="none"
            stroke="currentColor"
            strokeOpacity={0.08}
            strokeWidth={thickness}
          />

          {total > 0
            ? segments.map((segment) => {
                const segmentAngle = (clampNumber(segment.value) / total) * 360;
                const endAngle = startAngle + segmentAngle;
                const path = arcPath(center, center, radius, startAngle, endAngle);
                startAngle = endAngle;
                return (
                  <path
                    key={segment.label}
                    d={path}
                    fill="none"
                    stroke={segment.color}
                    strokeWidth={thickness}
                    strokeLinecap="round"
                  />
                );
              })
            : null}

          <text x={center} y={center - 4} textAnchor="middle" fontSize="13" fill="currentColor" opacity="0.6">
            {centerLabel}
          </text>
          <text x={center} y={center + 20} textAnchor="middle" fontSize="24" fill="currentColor" fontWeight="700">
            {centerValue}
          </text>
        </svg>
      </Box>

      <Stack spacing={1.25} sx={{ width: "100%" }}>
        {segments.map((segment) => {
          const share = total > 0 ? (segment.value / total) * 100 : 0;
          return (
            <Stack
              key={segment.label}
              direction="row"
              justifyContent="space-between"
              alignItems="center"
              spacing={1.5}
            >
              <Stack direction="row" spacing={1} alignItems="center">
                <Box
                  sx={{
                    width: 10,
                    height: 10,
                    borderRadius: "999px",
                    backgroundColor: segment.color,
                    flexShrink: 0,
                  }}
                />
                <Typography variant="body2">{segment.label}</Typography>
              </Stack>
              <Typography variant="body2" color="text.secondary">
                {share.toFixed(0)}%
              </Typography>
            </Stack>
          );
        })}
      </Stack>
    </Stack>
  );
}
