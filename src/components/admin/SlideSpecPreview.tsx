/**
 * In-browser HTML render of a SlideSpec — mirrors custom-slide-renderer.ts
 * so the preview matches the exported PPT. Fixed 1280×720 canvas, scaled
 * via CSS transform to fit the parent width while preserving 16:9.
 */
import { useEffect, useRef, useState } from 'react';
import {
  Bar, BarChart, CartesianGrid, Cell, Legend, Line, LineChart,
  Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts';
import {
  fmtValue, resolvePath, type KpiBag, type SlideBlock, type SlideSpec,
} from '@/lib/custom-slide-spec';
import {
  PREVIEW_H_PX, PREVIEW_W_PX, layoutBlocks, type BlockFrame,
} from '@/lib/custom-slide-layout';
import { cn } from '@/lib/utils';

// Palette mirrors ppt-builder.ts default tokens (PPT uses no '#').
const C = {
  bgBody:        '#0A1A40',
  cardBody:      '#152C5E',
  cardBorder:    '#1E3A7A',
  textPrimary:   '#FFFFFF',
  textSecondary: '#CADCFC',
  textMuted:     '#8B9BB8',
  cyan:          '#67E8F9',
  error:         '#F87171',
} as const;

const PX_PER_IN = 96;
const inToPx = (n: number) => n * PX_PER_IN;
const hex = (c?: string, fallback?: string) => {
  const v = c ?? fallback;
  if (!v) return undefined;
  return v.startsWith('#') ? v : `#${v}`;
};

function num(v: unknown): number {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}
function asArray(v: unknown): unknown[] {
  return Array.isArray(v) ? v : [];
}
function extractField(arr: unknown[], field?: string): unknown[] {
  if (!field) return arr;
  return arr.map((row) =>
    row && typeof row === 'object' ? (row as Record<string, unknown>)[field] : undefined,
  );
}

// ── Block renderers ────────────────────────────────────────────────

function CardBg({ children, color }: { children: React.ReactNode; color?: string }) {
  return (
    <div
      className="absolute inset-0 rounded-sm"
      style={{
        background: color ?? C.cardBody,
        border: `1px solid ${C.cardBorder}`,
      }}
    >
      {children}
    </div>
  );
}

function RenderBlock({ block: b, frame, kpis }: { block: SlideBlock; frame: BlockFrame; kpis: KpiBag | null }) {
  const style: React.CSSProperties = {
    position: 'absolute',
    left: inToPx(frame.x),
    top: inToPx(frame.y),
    width: inToPx(frame.w),
    height: inToPx(frame.h),
  };

  try {
    switch (b.type) {
      case 'kpi-card': {
        const raw = kpis ? resolvePath(kpis, b.valuePath) : undefined;
        const valueText = fmtValue(raw, { unit: b.unit, decimals: b.decimals });
        const pct = b.barPath
          ? Math.max(0, Math.min(100, num(kpis ? resolvePath(kpis, b.barPath) : 0)))
          : null;
        return (
          <div style={style}>
            <CardBg>
              <div className="absolute inset-0 p-6 flex flex-col">
                <div style={{ color: C.textMuted, fontSize: 16 }}>{b.title}</div>
                <div
                  className="flex-1 flex items-center"
                  style={{
                    color: hex(b.color, C.textPrimary),
                    fontSize: 64, fontWeight: 700, lineHeight: 1,
                  }}
                >
                  {valueText}
                </div>
                {pct != null && (
                  <div className="h-2 rounded-full overflow-hidden" style={{ background: C.cardBorder }}>
                    <div
                      style={{
                        width: `${pct}%`, height: '100%',
                        background: hex(b.color, C.cyan),
                      }}
                    />
                  </div>
                )}
                {b.subtitle && (
                  <div className="mt-2" style={{ color: C.textMuted, fontSize: 14 }}>{b.subtitle}</div>
                )}
              </div>
            </CardBg>
          </div>
        );
      }

      case 'bar-row': {
        const pct = Math.max(0, Math.min(100, num(kpis ? resolvePath(kpis, b.pctPath) : 0)));
        return (
          <div style={style}>
            <CardBg>
              <div className="absolute inset-0 p-5 flex flex-col justify-center gap-3">
                <div className="flex items-center justify-between">
                  <span style={{ color: C.textSecondary, fontSize: 18 }}>{b.label}</span>
                  <span style={{ color: C.textPrimary, fontSize: 18, fontWeight: 700 }}>{pct.toFixed(1)}%</span>
                </div>
                <div className="h-3 rounded-full overflow-hidden" style={{ background: C.cardBorder }}>
                  <div style={{ width: `${pct}%`, height: '100%', background: hex(b.color, C.cyan) }} />
                </div>
              </div>
            </CardBg>
          </div>
        );
      }

      case 'metric-grid': {
        const cols = b.columns ?? Math.min(b.items.length, 4);
        return (
          <div
            style={{
              ...style,
              display: 'grid',
              gridTemplateColumns: `repeat(${cols}, 1fr)`,
              gap: 12,
            }}
          >
            {b.items.map((it, i) => (
              <div key={i} className="relative">
                <CardBg>
                  <div className="absolute inset-0 p-4 flex flex-col">
                    <div style={{ color: C.textMuted, fontSize: 14 }}>{it.label}</div>
                    <div
                      className="flex-1 flex items-center"
                      style={{
                        color: hex(it.color, C.textPrimary),
                        fontSize: 36, fontWeight: 700,
                      }}
                    >
                      {fmtValue(kpis ? resolvePath(kpis, it.valuePath) : undefined, {
                        unit: it.unit, decimals: it.decimals,
                      })}
                    </div>
                  </div>
                </CardBg>
              </div>
            ))}
          </div>
        );
      }

      case 'text-block': {
        return (
          <div
            style={{
              ...style,
              color: hex(b.color, C.textSecondary),
              fontSize: b.fontSize ? b.fontSize * 2 : 20,
              fontWeight: b.bold ? 700 : 400,
              textAlign: b.align ?? 'left',
              whiteSpace: 'pre-wrap',
              overflow: 'hidden',
            }}
          >
            {b.text}
          </div>
        );
      }

      case 'bullet-list': {
        return (
          <div style={style}>
            <CardBg>
              <div className="absolute inset-0 p-5 flex flex-col">
                {b.title && (
                  <div className="mb-3" style={{ color: C.textPrimary, fontSize: 20, fontWeight: 700 }}>
                    {b.title}
                  </div>
                )}
                <ul className="flex-1 overflow-hidden space-y-2" style={{ color: C.textSecondary, fontSize: 16 }}>
                  {b.items.map((t, i) => (
                    <li key={i} className="flex gap-2">
                      <span style={{ color: C.cyan }}>•</span><span>{t}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </CardBg>
          </div>
        );
      }

      case 'simple-table': {
        let rows: (string | number | null)[][];
        if (b.rows?.length) {
          rows = b.rows;
        } else if (kpis && b.rowsPath && b.columnPaths) {
          const arr = asArray(resolvePath(kpis, b.rowsPath));
          rows = arr.slice(0, 10).map((row) =>
            b.columnPaths!.map((cp) => {
              const v = row && typeof row === 'object' ? (row as Record<string, unknown>)[cp] : undefined;
              return v == null ? '' : typeof v === 'number' ? v : String(v);
            }),
          );
        } else {
          rows = [];
        }
        return (
          <div style={style} className="flex flex-col overflow-hidden">
            {b.title && (
              <div className="mb-2" style={{ color: C.textPrimary, fontSize: 18, fontWeight: 700 }}>{b.title}</div>
            )}
            <div className="flex-1 overflow-hidden rounded-sm" style={{ border: `1px solid ${C.cardBorder}` }}>
              <table className="w-full text-left" style={{ fontSize: 13, color: C.textSecondary }}>
                <thead>
                  <tr style={{ background: C.cardBorder, color: C.textPrimary }}>
                    {b.headers.map((h, i) => (
                      <th key={i} className="px-2 py-1.5 font-semibold">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r, ri) => (
                    <tr key={ri} style={{ borderTop: `1px solid ${C.cardBorder}` }}>
                      {r.map((c, ci) => (
                        <td key={ci} className="px-2 py-1.5">{String(c ?? '')}</td>
                      ))}
                    </tr>
                  ))}
                  {rows.length === 0 && (
                    <tr><td colSpan={b.headers.length} className="px-2 py-3 text-center" style={{ color: C.textMuted }}>—</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        );
      }

      case 'bar-chart':
      case 'stacked-bar':
      case 'line-chart': {
        const labelsRaw = kpis ? resolvePath(kpis, b.labelsPath) : [];
        const labels = extractField(asArray(labelsRaw), b.labelField).map((v) => String(v ?? ''));
        const seriesData = b.series.map((s) => ({
          name: s.name,
          color: hex(s.color, C.cyan)!,
          values: kpis
            ? extractField(asArray(resolvePath(kpis, s.valuesPath)), s.valueField).map(num)
            : [],
        }));
        const chartRows = labels.map((label, i) => {
          const row: Record<string, unknown> = { _label: label };
          for (const s of seriesData) row[s.name] = s.values[i] ?? 0;
          return row;
        });
        const isStacked = b.type === 'stacked-bar';
        const isLine = b.type === 'line-chart';
        return (
          <div style={style} className="flex flex-col">
            {b.title && (
              <div className="mb-1" style={{ color: C.textPrimary, fontSize: 18, fontWeight: 700 }}>{b.title}</div>
            )}
            <div className="flex-1 min-h-0">
              <ResponsiveContainer width="100%" height="100%">
                {isLine ? (
                  <LineChart data={chartRows}>
                    <CartesianGrid stroke={C.cardBorder} strokeDasharray="3 3" />
                    <XAxis dataKey="_label" tick={{ fill: C.textMuted, fontSize: 11 }} />
                    <YAxis tick={{ fill: C.textMuted, fontSize: 11 }} />
                    <Tooltip contentStyle={{ background: C.cardBody, border: `1px solid ${C.cardBorder}`, color: C.textPrimary }} />
                    {seriesData.length > 1 && <Legend wrapperStyle={{ color: C.textSecondary, fontSize: 12 }} />}
                    {seriesData.map((s) => (
                      <Line key={s.name} type="monotone" dataKey={s.name} stroke={s.color} strokeWidth={2} dot={false} />
                    ))}
                  </LineChart>
                ) : (
                  <BarChart data={chartRows}>
                    <CartesianGrid stroke={C.cardBorder} strokeDasharray="3 3" />
                    <XAxis dataKey="_label" tick={{ fill: C.textMuted, fontSize: 11 }} />
                    <YAxis tick={{ fill: C.textMuted, fontSize: 11 }} />
                    <Tooltip contentStyle={{ background: C.cardBody, border: `1px solid ${C.cardBorder}`, color: C.textPrimary }} />
                    {seriesData.length > 1 && <Legend wrapperStyle={{ color: C.textSecondary, fontSize: 12 }} />}
                    {seriesData.map((s) => (
                      <Bar
                        key={s.name}
                        dataKey={s.name}
                        fill={s.color}
                        stackId={isStacked ? 'a' : undefined}
                      />
                    ))}
                  </BarChart>
                )}
              </ResponsiveContainer>
            </div>
          </div>
        );
      }

      case 'pie-chart': {
        const labels = kpis
          ? extractField(asArray(resolvePath(kpis, b.labelsPath)), b.labelField).map((v) => String(v ?? ''))
          : [];
        const values = kpis
          ? extractField(asArray(resolvePath(kpis, b.valuesPath)), b.valueField).map(num)
          : [];
        const data = labels.map((l, i) => ({ name: l, value: values[i] ?? 0 }));
        const palette = [C.cyan, '#A78BFA', '#F472B6', '#34D399', '#FBBF24', '#60A5FA', '#FB7185', '#A3E635'];
        return (
          <div style={style} className="flex flex-col">
            {b.title && (
              <div className="mb-1" style={{ color: C.textPrimary, fontSize: 18, fontWeight: 700 }}>{b.title}</div>
            )}
            <div className="flex-1 min-h-0">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={data}
                    dataKey="value"
                    nameKey="name"
                    innerRadius={b.doughnut ? '50%' : 0}
                    outerRadius="80%"
                    label={({ percent }: { percent?: number }) =>
                      percent != null ? `${(percent * 100).toFixed(0)}%` : ''}
                    labelLine={false}
                    stroke={C.bgBody}
                  >
                    {data.map((_, i) => (
                      <Cell key={i} fill={palette[i % palette.length]} />
                    ))}
                  </Pie>
                  <Tooltip contentStyle={{ background: C.cardBody, border: `1px solid ${C.cardBorder}`, color: C.textPrimary }} />
                  <Legend wrapperStyle={{ color: C.textSecondary, fontSize: 12 }} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>
        );
      }
    }
  } catch (err) {
    return (
      <div
        style={{
          ...style,
          color: C.error, fontSize: 12, padding: 8,
          border: `1px dashed ${C.error}`,
          display: 'flex', alignItems: 'center', justifyContent: 'center', textAlign: 'center',
        }}
      >
        Render error: {(err as Error).message}
      </div>
    );
  }
  return null;
}

// ── Main preview ──────────────────────────────────────────────────

interface Props {
  spec: SlideSpec;
  kpis: KpiBag | null;
  loading?: boolean;
  className?: string;
}

export default function SlideSpecPreview({ spec, kpis, loading, className }: Props) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);

  useEffect(() => {
    const el = wrapperRef.current;
    if (!el) return;
    const update = () => {
      const w = el.clientWidth;
      if (w > 0) setScale(w / PREVIEW_W_PX);
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const placed = layoutBlocks(spec);
  const scaledH = PREVIEW_H_PX * scale;

  return (
    <div ref={wrapperRef} className={cn('relative w-full overflow-hidden rounded-md', className)}>
      <div style={{ height: scaledH }}>
        <div
          style={{
            width: PREVIEW_W_PX,
            height: PREVIEW_H_PX,
            transform: `scale(${scale})`,
            transformOrigin: 'top left',
            background: C.bgBody,
            position: 'relative',
            fontFamily: 'Inter, system-ui, sans-serif',
          }}
        >
          {/* Title bar */}
          <div
            style={{
              position: 'absolute', left: inToPx(0.5), top: inToPx(0.3),
              width: inToPx(SLIDE_W_PX_HELPER), color: C.textPrimary,
              fontSize: 32, fontWeight: 700, lineHeight: 1.1,
            }}
          >
            {spec.title}
          </div>
          {spec.subtitle && (
            <div
              style={{
                position: 'absolute', left: inToPx(0.5), top: inToPx(0.78),
                color: C.textMuted, fontSize: 16,
              }}
            >
              {spec.subtitle}
            </div>
          )}

          {/* Blocks */}
          {placed.map((p, i) => (
            <RenderBlock key={i} block={p.block} frame={p.frame} kpis={kpis} />
          ))}

          {/* Footer */}
          <div
            style={{
              position: 'absolute', left: inToPx(0.5), bottom: inToPx(0.2),
              color: C.cyan, fontSize: 13, letterSpacing: 0.5,
              fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
            }}
          >
            SHAW · Custom Slide {loading ? '· loading data…' : kpis ? '' : '· no data — placeholders shown'}
          </div>

          {loading && (
            <div
              className="absolute inset-0 flex items-center justify-center"
              style={{ background: 'rgba(10,26,64,0.55)', color: C.textPrimary, fontSize: 14 }}
            >
              Loading project data…
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// Title bar width helper (12.33 inches available)
const SLIDE_W_PX_HELPER = 12.33;
