"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { formatMoneyCompact } from "@/lib/format";

/**
 * Charts use the brand-derived categorical palette declared in globals.css, so
 * a chart in one module is visually consistent with a chart in another.
 */
const SERIES = [
  "hsl(var(--chart-1))",
  "hsl(var(--chart-2))",
  "hsl(var(--chart-3))",
  "hsl(var(--chart-4))",
  "hsl(var(--chart-5))",
  "hsl(var(--chart-6))",
];

const AXIS = {
  stroke: "hsl(var(--muted-foreground))",
  fontSize: 11,
};

function tooltipStyle() {
  return {
    contentStyle: {
      backgroundColor: "hsl(var(--card))",
      border: "1px solid hsl(var(--border))",
      borderRadius: 2,
      fontSize: 12,
      padding: "6px 10px",
    },
    labelStyle: { color: "hsl(var(--muted-foreground))", fontSize: 11 },
  };
}

export interface TrendDatum {
  label: string;
  revenue: number;
  profit: number;
  transactions: number;
}

export function RevenueTrendChart({
  data,
  currency = "INR",
}: {
  data: TrendDatum[];
  currency?: string;
}) {
  return (
    <ResponsiveContainer width="100%" height={230}>
      <LineChart data={data} margin={{ top: 6, right: 8, bottom: 0, left: -12 }}>
        <CartesianGrid
          stroke="hsl(var(--border))"
          strokeDasharray="3 3"
          vertical={false}
        />
        <XAxis dataKey="label" tickLine={false} axisLine={false} {...AXIS} />
        <YAxis
          tickLine={false}
          axisLine={false}
          {...AXIS}
          tickFormatter={(v: number) => formatMoneyCompact(v, currency)}
          width={62}
        />
        <Tooltip
          {...tooltipStyle()}
          formatter={(value: number, name: string) => [
            formatMoneyCompact(value, currency),
            name === "revenue" ? "Revenue" : "Profit",
          ]}
        />
        <Legend
          iconType="plainline"
          wrapperStyle={{ fontSize: 11, paddingTop: 6 }}
          formatter={(value) => (value === "revenue" ? "Revenue" : "Gross profit")}
        />
        <Line
          type="monotone"
          dataKey="revenue"
          stroke={SERIES[0]}
          strokeWidth={2}
          dot={false}
          activeDot={{ r: 3 }}
        />
        <Line
          type="monotone"
          dataKey="profit"
          stroke={SERIES[1]}
          strokeWidth={2}
          dot={false}
          activeDot={{ r: 3 }}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}

export function PaymentMixChart({
  data,
  currency = "INR",
}: {
  data: { method: string; amount: number }[];
  currency?: string;
}) {
  return (
    <ResponsiveContainer width="100%" height={200}>
      <PieChart>
        <Pie
          data={data}
          dataKey="amount"
          nameKey="method"
          cx="50%"
          cy="50%"
          innerRadius={44}
          outerRadius={72}
          paddingAngle={1}
          stroke="hsl(var(--card))"
          strokeWidth={2}
        >
          {data.map((_, i) => (
            <Cell key={i} fill={SERIES[i % SERIES.length]} />
          ))}
        </Pie>
        <Tooltip
          {...tooltipStyle()}
          formatter={(value: number, name: string) => [
            formatMoneyCompact(value, currency),
            name.replace(/_/g, " "),
          ]}
        />
        <Legend
          wrapperStyle={{ fontSize: 11 }}
          formatter={(value: string) =>
            value.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())
          }
        />
      </PieChart>
    </ResponsiveContainer>
  );
}

export function CategoryBarChart({
  data,
  currency = "INR",
  label = "Revenue",
}: {
  data: { label: string; value: number }[];
  currency?: string;
  label?: string;
}) {
  return (
    <ResponsiveContainer width="100%" height={Math.max(180, data.length * 34)}>
      <BarChart
        data={data}
        layout="vertical"
        margin={{ top: 4, right: 16, bottom: 4, left: 4 }}
      >
        <CartesianGrid
          stroke="hsl(var(--border))"
          strokeDasharray="3 3"
          horizontal={false}
        />
        <XAxis
          type="number"
          tickLine={false}
          axisLine={false}
          {...AXIS}
          tickFormatter={(v: number) => formatMoneyCompact(v, currency)}
        />
        <YAxis
          type="category"
          dataKey="label"
          tickLine={false}
          axisLine={false}
          {...AXIS}
          width={130}
        />
        <Tooltip
          {...tooltipStyle()}
          formatter={(value: number) => [formatMoneyCompact(value, currency), label]}
        />
        <Bar dataKey="value" fill={SERIES[0]} radius={[0, 2, 2, 0]} barSize={16} />
      </BarChart>
    </ResponsiveContainer>
  );
}
