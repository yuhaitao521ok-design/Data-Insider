"use client";

interface SparklineProps {
  data: number[];
  positive: boolean;
  className?: string;
}

/** 迷你走势图：viewBox 拉伸 + 非缩放描边，任意尺寸都保持线条粗细一致 */
export default function Sparkline({ data, positive, className = "" }: SparklineProps) {
  if (!data || data.length < 2) {
    return <svg viewBox="0 0 100 30" className={className} aria-hidden="true" />;
  }

  const min = Math.min(...data);
  const max = Math.max(...data);
  const span = max - min || 1;
  const step = 100 / (data.length - 1);

  const points = data.map((value, index) => {
    const x = index * step;
    const y = 28 - ((value - min) / span) * 26;
    return `${x.toFixed(2)},${y.toFixed(2)}`;
  });

  return (
    <svg
      viewBox="0 0 100 30"
      preserveAspectRatio="none"
      className={className}
      aria-hidden="true"
    >
      <polyline
        points={points.join(" ")}
        fill="none"
        style={{ stroke: positive ? "var(--positive)" : "var(--negative)" }}
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}
