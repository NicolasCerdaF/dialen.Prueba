import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  DollarSign,
  TrendingUp,
  Users as UsersIcon,
  Sparkles,
  Building2,
  Coins,
  Percent,
  ArrowUpRight,
} from "lucide-react";
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  Legend,
} from "recharts";
import {
  getPlatformMetrics,
  getFinancialSeries,
} from "@/lib/platform-admin.functions";

// ============================================================================
// Business inputs — pricing model (CLP monthly + credit economics)
// ============================================================================
const PRICING = {
  start: { name: "Plan Start", priceCLP: 79_000, monthlyCredits: 1_400 },
  business: { name: "Plan Business", priceCLP: 129_000, monthlyCredits: 4_600 },
};
// Costo real estimado por crédito consumido en producción.
// Base Gemini 2.0 flash ~CLP 0.38, pero al agregar contexto multi-turno,
// RAG, reintentos y fallback ocasional a OpenAI/Claude sube a ~CLP 2.
// Start (1.400 cr) ≈ CLP 2.800 | Business (4.600 cr) ≈ CLP 9.200.
const AI_COST_PER_CREDIT_CLP = 2.0;
const USD_CLP = 950;

const fmtCLP = (n: number) =>
  `$${Math.round(n).toLocaleString("es-CL", { maximumFractionDigits: 0 })}`;
const fmtUSD = (n: number) => `US$${(n).toFixed(2)}`;
const pct = (n: number) => `${(n * 100).toFixed(1)}%`;

// Chart palette adapted to slate dark theme
const CHART = {
  primary: "#f59e0b",
  primary2: "#fbbf24",
  emerald: "#10b981",
  indigo: "#6366f1",
  rose: "#f43f5e",
  cyan: "#22d3ee",
  slate: "#334155",
  slateFg: "#94a3b8",
};

function Card({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`rounded-xl border border-slate-800 bg-slate-900/60 p-5 shadow-[0_1px_0_rgba(255,255,255,0.02)_inset] ${className}`}
    >
      {children}
    </div>
  );
}

function KPI({
  label,
  value,
  hint,
  icon: Icon,
  tint = "text-amber-300",
  trend,
}: {
  label: string;
  value: string;
  hint?: string;
  icon: any;
  tint?: string;
  trend?: string;
}) {
  return (
    <Card className="!p-4">
      <div className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-wide text-slate-500">
        <Icon className={`h-3.5 w-3.5 ${tint}`} /> {label}
      </div>
      <div className="mt-2 flex items-baseline gap-2">
        <div className="text-2xl font-semibold text-slate-100">{value}</div>
        {trend && (
          <span className="inline-flex items-center gap-0.5 text-[11px] font-medium text-emerald-400">
            <ArrowUpRight className="h-3 w-3" />
            {trend}
          </span>
        )}
      </div>
      {hint && <div className="mt-1 text-[11px] text-slate-500">{hint}</div>}
    </Card>
  );
}

const tooltipStyle = {
  backgroundColor: "#0f172a",
  border: "1px solid #1e293b",
  borderRadius: 8,
  color: "#e2e8f0",
  fontSize: 12,
};

export function MetricsFinance() {
  const metricsFn = useServerFn(getPlatformMetrics);
  const seriesFn = useServerFn(getFinancialSeries);
  const mQ = useQuery({ queryKey: ["platform-metrics"], queryFn: () => metricsFn() });
  const sQ = useQuery({ queryKey: ["platform-financial-series"], queryFn: () => seriesFn() });

  const m = mQ.data;
  const s = sQ.data;

  const financial = useMemo(() => {
    if (!m) return null;
    const startCount = m.plans.basic;
    const businessCount = m.plans.business;

    const mrr = startCount * PRICING.start.priceCLP + businessCount * PRICING.business.priceCLP;
    const arr = mrr * 12;

    const totalCompanies = startCount + businessCount || 1;
    const arpu = mrr / totalCompanies;

    // Total credits included across the platform per month
    const includedCredits =
      startCount * PRICING.start.monthlyCredits +
      businessCount * PRICING.business.monthlyCredits;

    // Actual AI credits consumed this month (approximation from ai_suggestions + automation_runs + director_insights)
    const consumedCredits = s?.currentMonthAi ?? 0;

    // Raw AI cost (CLP + USD)
    const aiCostCLP = consumedCredits * AI_COST_PER_CREDIT_CLP;
    const aiCostUSD = aiCostCLP / USD_CLP;
    const grossMargin = mrr > 0 ? (mrr - aiCostCLP) / mrr : 0;

    // Utilization: how much of included credits are actually used
    const utilization = includedCredits > 0 ? consumedCredits / includedCredits : 0;

    return {
      mrr,
      arr,
      arpu,
      includedCredits,
      consumedCredits,
      aiCostCLP,
      aiCostUSD,
      grossMargin,
      utilization,
      startCount,
      businessCount,
    };
  }, [m, s]);

  // Forecast: linear projection from the last 3 months of new companies
  const forecast = useMemo(() => {
    if (!s || !financial) return [];
    const last3 = s.series.slice(-3);
    const avgNewCompanies =
      last3.reduce((sum, r) => sum + r.companies, 0) / Math.max(last3.length, 1);
    // Assume 30% of new companies go to Business, 70% Start (weighted average price)
    const avgTicket = PRICING.start.priceCLP * 0.7 + PRICING.business.priceCLP * 0.3;
    let mrr = financial.mrr;
    const out: { month: string; mrr: number; new: number }[] = [];
    for (let i = 1; i <= 3; i++) {
      const d = new Date();
      d.setMonth(d.getMonth() + i);
      mrr += avgNewCompanies * avgTicket;
      out.push({
        month: d.toLocaleDateString("es-CL", { month: "short", year: "2-digit" }),
        mrr,
        new: Math.round(avgNewCompanies),
      });
    }
    return out;
  }, [s, financial]);

  if (mQ.isLoading || sQ.isLoading || !m || !s || !financial) {
    return <div className="text-sm text-slate-500">Cargando métricas financieras…</div>;
  }

  const planPieData = [
    { name: "Plan Start", value: financial.startCount, color: CHART.indigo },
    { name: "Plan Business", value: financial.businessCount, color: CHART.primary },
  ];

  return (
    <div className="space-y-6">
      {/* Financial KPIs */}
      <div>
        <div className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
          Ingresos y rentabilidad
        </div>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
          <KPI
            label="MRR"
            value={fmtCLP(financial.mrr)}
            hint="Ingresos recurrentes mensuales"
            icon={DollarSign}
            tint="text-amber-300"
          />
          <KPI
            label="ARR proyectado"
            value={fmtCLP(financial.arr)}
            hint="MRR × 12"
            icon={TrendingUp}
            tint="text-emerald-400"
          />
          <KPI
            label="ARPU"
            value={fmtCLP(financial.arpu)}
            hint="Ingreso promedio por empresa"
            icon={Building2}
            tint="text-cyan-400"
          />
          <KPI
            label="Costo IA (mes)"
            value={fmtCLP(financial.aiCostCLP)}
            hint={`${fmtUSD(financial.aiCostUSD)} · ${financial.consumedCredits.toLocaleString("es-CL")} créditos`}
            icon={Sparkles}
            tint="text-fuchsia-400"
          />
          <KPI
            label="Margen bruto"
            value={pct(financial.grossMargin)}
            hint="Después de costo IA"
            icon={Percent}
            tint="text-emerald-400"
          />
          <KPI
            label="Uso de créditos"
            value={pct(financial.utilization)}
            hint={`${financial.consumedCredits.toLocaleString("es-CL")} / ${financial.includedCredits.toLocaleString("es-CL")}`}
            icon={Coins}
            tint="text-indigo-400"
          />
        </div>
      </div>

      {/* Chart row 1: Growth + Plan distribution */}
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <div className="mb-3 flex items-center justify-between">
            <div>
              <div className="text-sm font-semibold text-slate-100">Crecimiento (últimos 6 meses)</div>
              <div className="text-[11px] text-slate-500">
                Nuevos usuarios y empresas registradas por mes
              </div>
            </div>
            <UsersIcon className="h-4 w-4 text-slate-500" />
          </div>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={s.series}>
                <CartesianGrid stroke={CHART.slate} strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="month" stroke={CHART.slateFg} fontSize={11} />
                <YAxis stroke={CHART.slateFg} fontSize={11} />
                <Tooltip contentStyle={tooltipStyle} />
                <Legend wrapperStyle={{ fontSize: 11, color: CHART.slateFg }} />
                <Line
                  type="monotone"
                  dataKey="signups"
                  name="Usuarios"
                  stroke={CHART.emerald}
                  strokeWidth={2}
                  dot={{ r: 3 }}
                />
                <Line
                  type="monotone"
                  dataKey="companies"
                  name="Empresas"
                  stroke={CHART.primary}
                  strokeWidth={2}
                  dot={{ r: 3 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card>
          <div className="mb-3">
            <div className="text-sm font-semibold text-slate-100">Distribución de planes</div>
            <div className="text-[11px] text-slate-500">
              {financial.startCount + financial.businessCount} empresas activas
            </div>
          </div>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={planPieData}
                  dataKey="value"
                  nameKey="name"
                  innerRadius={45}
                  outerRadius={80}
                  paddingAngle={3}
                >
                  {planPieData.map((entry, i) => (
                    <Cell key={i} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip contentStyle={tooltipStyle} />
                <Legend wrapperStyle={{ fontSize: 11, color: CHART.slateFg }} />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="mt-2 grid grid-cols-2 gap-2 text-center">
            <div className="rounded-lg border border-indigo-500/20 bg-indigo-500/5 p-2">
              <div className="text-[10px] uppercase tracking-wide text-indigo-300">Start</div>
              <div className="mt-0.5 text-sm font-semibold text-slate-100">
                {fmtCLP(financial.startCount * PRICING.start.priceCLP)}
              </div>
            </div>
            <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 p-2">
              <div className="text-[10px] uppercase tracking-wide text-amber-300">Business</div>
              <div className="mt-0.5 text-sm font-semibold text-slate-100">
                {fmtCLP(financial.businessCount * PRICING.business.priceCLP)}
              </div>
            </div>
          </div>
        </Card>
      </div>

      {/* Chart row 2: AI consumption + Revenue by currency */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <div className="mb-3 flex items-center justify-between">
            <div>
              <div className="text-sm font-semibold text-slate-100">Consumo IA por mes</div>
              <div className="text-[11px] text-slate-500">
                Operaciones IA (sugerencias, automatizaciones e insights)
              </div>
            </div>
            <Sparkles className="h-4 w-4 text-fuchsia-400" />
          </div>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={s.series}>
                <CartesianGrid stroke={CHART.slate} strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="month" stroke={CHART.slateFg} fontSize={11} />
                <YAxis stroke={CHART.slateFg} fontSize={11} />
                <Tooltip contentStyle={tooltipStyle} />
                <Bar dataKey="ai" name="Operaciones IA" fill={CHART.primary} radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card>
          <div className="mb-3 flex items-center justify-between">
            <div>
              <div className="text-sm font-semibold text-slate-100">
                Ingresos por cotizaciones aceptadas
              </div>
              <div className="text-[11px] text-slate-500">
                Total acumulado por moneda (histórico completo)
              </div>
            </div>
            <DollarSign className="h-4 w-4 text-amber-300" />
          </div>
          <div className="h-64">
            {s.revenueByCurrency.length === 0 ? (
              <div className="flex h-full items-center justify-center text-xs text-slate-500">
                Aún no hay cotizaciones aceptadas.
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={s.revenueByCurrency} layout="vertical">
                  <CartesianGrid stroke={CHART.slate} strokeDasharray="3 3" horizontal={false} />
                  <XAxis type="number" stroke={CHART.slateFg} fontSize={11} />
                  <YAxis
                    type="category"
                    dataKey="currency"
                    stroke={CHART.slateFg}
                    fontSize={11}
                    width={50}
                  />
                  <Tooltip
                    contentStyle={tooltipStyle}
                    formatter={(v: any) => Number(v).toLocaleString("es-CL")}
                  />
                  <Bar
                    dataKey="total"
                    name="Total aceptado"
                    fill={CHART.emerald}
                    radius={[0, 4, 4, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </Card>
      </div>

      {/* Forecast + Cost breakdown */}
      <div className="grid gap-4 lg:grid-cols-5">
        <Card className="lg:col-span-3">
          <div className="mb-3">
            <div className="text-sm font-semibold text-slate-100">Proyección de MRR (3 meses)</div>
            <div className="text-[11px] text-slate-500">
              Basado en el promedio de nuevas empresas de los últimos 3 meses · ticket ponderado
              70% Start / 30% Business
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-800 text-left text-[11px] uppercase tracking-wide text-slate-500">
                  <th className="pb-2">Mes</th>
                  <th className="pb-2">Nuevas empresas</th>
                  <th className="pb-2 text-right">MRR estimado</th>
                  <th className="pb-2 text-right">Δ vs hoy</th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-b border-slate-800/60">
                  <td className="py-2 text-slate-300">Hoy</td>
                  <td className="py-2 text-slate-400">
                    {financial.startCount + financial.businessCount} activas
                  </td>
                  <td className="py-2 text-right font-medium text-slate-100">
                    {fmtCLP(financial.mrr)}
                  </td>
                  <td className="py-2 text-right text-slate-500">—</td>
                </tr>
                {forecast.map((f, i) => (
                  <tr key={i} className="border-b border-slate-800/60 last:border-0">
                    <td className="py-2 text-slate-300">{f.month}</td>
                    <td className="py-2 text-slate-400">+{f.new}</td>
                    <td className="py-2 text-right font-medium text-amber-300">{fmtCLP(f.mrr)}</td>
                    <td className="py-2 text-right text-emerald-400">
                      +{fmtCLP(f.mrr - financial.mrr)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        <Card className="lg:col-span-2">
          <div className="mb-3">
            <div className="text-sm font-semibold text-slate-100">Economía por plan</div>
            <div className="text-[11px] text-slate-500">
              Precio final vs. costo real de créditos IA
            </div>
          </div>
          <div className="space-y-3">
            {[
              {
                key: "start",
                ...PRICING.start,
                border: "border-indigo-500/30",
                text: "text-indigo-300",
              },
              {
                key: "business",
                ...PRICING.business,
                border: "border-amber-500/30",
                text: "text-amber-300",
              },
            ].map((p) => {
              const cost = p.monthlyCredits * AI_COST_PER_CREDIT_CLP;
              const margin = (p.priceCLP - cost) / p.priceCLP;
              return (
                <div
                  key={p.key}
                  className={`rounded-lg border ${p.border} bg-slate-950/40 p-3`}
                >
                  <div className="flex items-center justify-between">
                    <div className={`text-xs font-semibold uppercase tracking-wide ${p.text}`}>
                      {p.name}
                    </div>
                    <div className="text-sm font-semibold text-slate-100">
                      {fmtCLP(p.priceCLP)}
                    </div>
                  </div>
                  <div className="mt-2 grid grid-cols-3 gap-2 text-[11px]">
                    <div>
                      <div className="text-slate-500">Créditos</div>
                      <div className="text-slate-300">{p.monthlyCredits.toLocaleString("es-CL")}</div>
                    </div>
                    <div>
                      <div className="text-slate-500">Costo IA</div>
                      <div className="text-slate-300">{fmtCLP(cost)}</div>
                    </div>
                    <div>
                      <div className="text-slate-500">Margen</div>
                      <div className="font-medium text-emerald-400">{pct(margin)}</div>
                    </div>
                  </div>
                </div>
              );
            })}
            <div className="mt-2 rounded-lg border border-slate-700/60 bg-slate-950/60 p-3 text-[11px] text-slate-400">
              Costo estimado: {fmtCLP(AI_COST_PER_CREDIT_CLP)} por crédito consumido (Gemini flash
              con buffer). Ajustable en <code className="text-amber-300">metrics-finance.tsx</code>.
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}
