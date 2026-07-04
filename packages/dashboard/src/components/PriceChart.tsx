// Attested price over time. The amber step line is the price the market was
// told; every violet point is an on-chain attestation transaction.
import { useMemo } from "react";
import {
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Scatter,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { clock, fmt, tokens, type Summary } from "../lib/market";

export function PriceChart({ summary, height = 260 }: { summary: Summary; height?: number }) {
  const data = useMemo(
    () =>
      (summary.priceSeries ?? []).map(p => ({
        at: p.at,
        t: clock(p.at),
        price: tokens(p.price),
      })),
    [summary],
  );

  return (
    <ResponsiveContainer width="100%" height={height}>
      <ComposedChart data={data} margin={{ top: 12, right: 16, bottom: 4, left: 0 }}>
        <CartesianGrid stroke="#1c2733" strokeDasharray="2 6" vertical={false} />
        <XAxis
          dataKey="t"
          tick={{ fill: "#5a6b7b", fontSize: 10 }}
          axisLine={{ stroke: "#1c2733" }}
          tickLine={false}
          minTickGap={40}
        />
        <YAxis
          tick={{ fill: "#5a6b7b", fontSize: 10 }}
          axisLine={false}
          tickLine={false}
          width={44}
          domain={["auto", "auto"]}
        />
        <Tooltip
          contentStyle={{
            background: "#10161f",
            border: "1px solid #1c2733",
            fontFamily: "inherit",
            fontSize: 11,
          }}
          labelStyle={{ color: "#5a6b7b" }}
          formatter={(v: number) => [`${fmt(v, 2)} OJA`, "price"]}
        />
        <Line
          type="stepAfter"
          dataKey="price"
          stroke="#f5a742"
          strokeWidth={2}
          dot={false}
          isAnimationActive={false}
        />
        <Scatter dataKey="price" fill="#a78bfa" isAnimationActive={false} />
      </ComposedChart>
    </ResponsiveContainer>
  );
}
