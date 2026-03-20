import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts'
import { BarChart2, TrendingUp, TrendingDown, Zap } from 'lucide-react'
import toast from 'react-hot-toast'
import { fetchStrategies, runBacktest, Strategy, StrategyParam } from '../api/backtest'
import { fetchSymbols } from '../api/data'
import { useBacktestStore, Metrics } from '../store/backtestStore'

const STRATEGY_PARAM_DEFAULTS: Record<string, Record<string, number>> = {
  ict_order_block: { lookback: 20, impulse_bars: 3 },
  ict_fvg: { min_gap_pct: 0.15, max_active_fvgs: 5 },
  ema_pullback: { fast_ema: 9, mid_ema: 21, slow_ema: 50 },
  breakout: { period: 20, exit_period: 10 },
  sma_crossover: { fast_period: 10, slow_period: 30 },
  ema_crossover: { fast_period: 9, slow_period: 21 },
  rsi_oversold: { period: 14, oversold_threshold: 30, overbought_threshold: 70 },
  macd: { fast: 12, slow: 26, signal: 9 },
  bollinger_bands: { period: 20, std_dev: 2 },
}

function MetricCard({ label, value, sub, positive }: { label: string; value: string; sub?: string; positive?: boolean }) {
  const valueColor = positive === undefined ? 'text-gray-100' : positive ? 'text-green-400' : 'text-red-400'
  return (
    <div className="card p-4">
      <p className="text-xs text-gray-500 uppercase tracking-wide mb-1">{label}</p>
      <p className={`text-xl font-bold font-mono ${valueColor}`}>{value}</p>
      {sub && <p className="text-xs text-gray-500 mt-0.5">{sub}</p>}
    </div>
  )
}

function pct(n: number) {
  return `${n >= 0 ? '+' : ''}${n.toFixed(2)}%`
}

function fmt(n: number, decimals = 2) {
  return n.toFixed(decimals)
}

export default function Backtest() {
  const [searchParams] = useSearchParams()
  const { config, result, loading, setConfig, setResult, setLoading, setError } = useBacktestStore()

  const [strategies, setStrategies] = useState<Strategy[]>([])
  const [symbols, setSymbols] = useState<string[]>([])
  const [localParams, setLocalParams] = useState<Record<string, number>>(config.params)

  // Load strategies + symbols once
  useEffect(() => {
    fetchStrategies().then(setStrategies).catch(() => toast.error('Failed to load strategies'))
    fetchSymbols().then(setSymbols).catch(() => {})
  }, [])

  // Pre-select strategy from query param (e.g. from Strategies page)
  useEffect(() => {
    const strategyParam = searchParams.get('strategy')
    if (strategyParam && strategyParam !== config.strategy_type) {
      const defaults = STRATEGY_PARAM_DEFAULTS[strategyParam] ?? {}
      setConfig({ strategy_type: strategyParam, params: defaults })
      setLocalParams(defaults)
    }
  }, [searchParams]) // eslint-disable-line

  const currentStrategy = strategies.find((s) => s.id === config.strategy_type)

  function handleStrategyChange(id: string) {
    const defaults = STRATEGY_PARAM_DEFAULTS[id] ?? {}
    setConfig({ strategy_type: id, params: defaults })
    setLocalParams(defaults)
  }

  function handleParamChange(name: string, value: string) {
    const num = parseFloat(value)
    if (!isNaN(num)) {
      const updated = { ...localParams, [name]: num }
      setLocalParams(updated)
      setConfig({ params: updated })
    }
  }

  async function handleRun() {
    setLoading(true)
    setError(null)
    try {
      const result = await runBacktest({ ...config, params: localParams })
      setResult(result)
      if ((result as any).warning) {
        toast((result as any).warning, { duration: 6000, icon: '⚠️' })
      } else {
        toast.success(`Backtest complete — ${result.trades.length} trades found`)
      }
    } catch (e: any) {
      const msg = e?.response?.data?.detail ?? 'Backtest failed'
      setError(msg)
      toast.error(msg)
    } finally {
      setLoading(false)
    }
  }

  const metrics: Metrics | null = result?.metrics ?? null

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white">Run a Backtest</h1>
        <p className="text-gray-400 mt-1">Configure a strategy and test it against historical market data.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Config panel */}
        <div className="lg:col-span-1 space-y-5">
          <div className="card p-5">
            <h2 className="text-sm font-semibold text-white mb-4">Configuration</h2>

            {/* Symbol */}
            <div className="mb-4">
              <label className="label">Symbol</label>
              <select
                className="input"
                value={config.symbol}
                onChange={(e) => setConfig({ symbol: e.target.value })}
              >
                {(symbols.length ? symbols : ['AAPL', 'MSFT', 'GOOGL', 'TSLA', 'SPY']).map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </div>

            {/* Dates */}
            <div className="grid grid-cols-2 gap-3 mb-4">
              <div>
                <label className="label">From</label>
                <input
                  type="date"
                  className="input"
                  value={config.from_date}
                  onChange={(e) => setConfig({ from_date: e.target.value })}
                />
              </div>
              <div>
                <label className="label">To</label>
                <input
                  type="date"
                  className="input"
                  value={config.to_date}
                  onChange={(e) => setConfig({ to_date: e.target.value })}
                />
              </div>
            </div>

            {/* Strategy */}
            <div className="mb-4">
              <label className="label">Strategy</label>
              <select
                className="input"
                value={config.strategy_type}
                onChange={(e) => handleStrategyChange(e.target.value)}
              >
                {strategies.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </div>

            {/* Strategy params */}
            {currentStrategy && currentStrategy.params.length > 0 && (
              <div className="mb-4">
                <label className="label">Parameters</label>
                <div className="space-y-3">
                  {currentStrategy.params.map((param: StrategyParam) => (
                    <div key={param.name}>
                      <div className="flex justify-between mb-1">
                        <span className="text-xs text-gray-400">{param.label}</span>
                        <span className="text-xs text-gray-500">
                          {param.min} – {param.max}
                        </span>
                      </div>
                      <input
                        type="number"
                        className="input text-sm"
                        value={localParams[param.name] ?? param.default}
                        min={param.min}
                        max={param.max}
                        step={param.type === 'float' ? 0.1 : 1}
                        onChange={(e) => handleParamChange(param.name, e.target.value)}
                      />
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Capital + commission */}
            <div className="grid grid-cols-2 gap-3 mb-5">
              <div>
                <label className="label">Capital ($)</label>
                <input
                  type="number"
                  className="input"
                  value={config.initial_capital}
                  min={100}
                  onChange={(e) => setConfig({ initial_capital: parseFloat(e.target.value) })}
                />
              </div>
              <div>
                <label className="label">Commission ($)</label>
                <input
                  type="number"
                  className="input"
                  value={config.commission_per_trade}
                  min={0}
                  step={0.5}
                  onChange={(e) => setConfig({ commission_per_trade: parseFloat(e.target.value) })}
                />
              </div>
            </div>

            <button
              className="btn-primary w-full flex items-center justify-center gap-2"
              onClick={handleRun}
              disabled={loading}
            >
              {loading ? (
                <>
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Running...
                </>
              ) : (
                <>
                  <Zap className="w-4 h-4" />
                  Run Backtest
                </>
              )}
            </button>
          </div>
        </div>

        {/* Results */}
        <div className="lg:col-span-2 space-y-5">
          {!result && !loading && (
            <div className="card p-12 flex flex-col items-center justify-center text-center h-full min-h-[400px]">
              <BarChart2 className="w-12 h-12 text-gray-700 mb-3" />
              <p className="text-gray-400 font-medium">No results yet</p>
              <p className="text-gray-600 text-sm mt-1">Configure a strategy and click Run Backtest.</p>
            </div>
          )}

          {loading && (
            <div className="card p-12 flex flex-col items-center justify-center min-h-[400px]">
              <div className="w-8 h-8 border-2 border-gray-600 border-t-blue-500 rounded-full animate-spin mb-3" />
              <p className="text-gray-400">Running backtest…</p>
            </div>
          )}

          {result && metrics && !loading && (
            <>
              {/* Key metrics */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <MetricCard
                  label="Total Return"
                  value={pct(metrics.total_return_pct)}
                  positive={metrics.total_return_pct >= 0}
                />
                <MetricCard
                  label="CAGR"
                  value={pct(metrics.cagr)}
                  positive={metrics.cagr >= 0}
                />
                <MetricCard
                  label="Sharpe Ratio"
                  value={fmt(metrics.sharpe_ratio)}
                  positive={metrics.sharpe_ratio >= 1}
                />
                <MetricCard
                  label="Max Drawdown"
                  value={pct(-Math.abs(metrics.max_drawdown_pct))}
                  positive={false}
                />
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <MetricCard label="Win Rate" value={pct(metrics.win_rate)} />
                <MetricCard label="Profit Factor" value={fmt(metrics.profit_factor)} />
                <MetricCard label="Total Trades" value={String(metrics.total_trades)} />
                <MetricCard
                  label="Final Capital"
                  value={`$${metrics.final_capital.toLocaleString('en-US', { maximumFractionDigits: 0 })}`}
                />
              </div>

              {/* Equity curve */}
              {result.equity_curve?.length > 0 && (
                <div className="card p-5">
                  <h3 className="text-sm font-semibold text-white mb-4 flex items-center gap-2">
                    <TrendingUp className="w-4 h-4 text-blue-400" />
                    Equity Curve
                  </h3>
                  <ResponsiveContainer width="100%" height={200}>
                    <AreaChart data={result.equity_curve}>
                      <defs>
                        <linearGradient id="equityGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.2} />
                          <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
                      <XAxis
                        dataKey="time"
                        tick={{ fill: '#6b7280', fontSize: 11 }}
                        tickLine={false}
                        tickFormatter={(v) => v.slice(0, 7)}
                        interval="preserveStartEnd"
                      />
                      <YAxis
                        tick={{ fill: '#6b7280', fontSize: 11 }}
                        tickLine={false}
                        axisLine={false}
                        tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`}
                        width={48}
                      />
                      <Tooltip
                        contentStyle={{ background: '#111827', border: '1px solid #374151', borderRadius: 8 }}
                        labelStyle={{ color: '#9ca3af', fontSize: 12 }}
                        formatter={(v: number) => [`$${v.toLocaleString()}`, 'Portfolio']}
                      />
                      <Area
                        type="monotone"
                        dataKey="value"
                        stroke="#3b82f6"
                        strokeWidth={2}
                        fill="url(#equityGrad)"
                        dot={false}
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              )}

              {/* Drawdown curve */}
              {result.drawdown_curve?.length > 0 && (
                <div className="card p-5">
                  <h3 className="text-sm font-semibold text-white mb-4 flex items-center gap-2">
                    <TrendingDown className="w-4 h-4 text-red-400" />
                    Drawdown
                  </h3>
                  <ResponsiveContainer width="100%" height={120}>
                    <AreaChart data={result.drawdown_curve}>
                      <defs>
                        <linearGradient id="ddGrad" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#ef4444" stopOpacity={0.3} />
                          <stop offset="95%" stopColor="#ef4444" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
                      <XAxis
                        dataKey="time"
                        tick={{ fill: '#6b7280', fontSize: 11 }}
                        tickLine={false}
                        tickFormatter={(v) => v.slice(0, 7)}
                        interval="preserveStartEnd"
                      />
                      <YAxis
                        tick={{ fill: '#6b7280', fontSize: 11 }}
                        tickLine={false}
                        axisLine={false}
                        tickFormatter={(v) => `${v.toFixed(0)}%`}
                        width={40}
                      />
                      <Tooltip
                        contentStyle={{ background: '#111827', border: '1px solid #374151', borderRadius: 8 }}
                        labelStyle={{ color: '#9ca3af', fontSize: 12 }}
                        formatter={(v: number) => [`${v.toFixed(2)}%`, 'Drawdown']}
                      />
                      <Area
                        type="monotone"
                        dataKey="value"
                        stroke="#ef4444"
                        strokeWidth={1.5}
                        fill="url(#ddGrad)"
                        dot={false}
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              )}

              {/* Trades table */}
              {result.trades?.length > 0 && (
                <div className="card overflow-hidden">
                  <div className="px-5 py-4 border-b border-gray-800">
                    <h3 className="text-sm font-semibold text-white">
                      Trade History ({result.trades.length} trades)
                    </h3>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-gray-800">
                          <th className="text-left text-gray-500 font-medium px-4 py-2">Entry</th>
                          <th className="text-left text-gray-500 font-medium px-4 py-2">Exit</th>
                          <th className="text-right text-gray-500 font-medium px-4 py-2">Entry $</th>
                          <th className="text-right text-gray-500 font-medium px-4 py-2">Exit $</th>
                          <th className="text-right text-gray-500 font-medium px-4 py-2">P&amp;L</th>
                          <th className="text-right text-gray-500 font-medium px-4 py-2">Return</th>
                        </tr>
                      </thead>
                      <tbody>
                        {result.trades.slice(0, 50).map((t, i) => (
                          <tr key={i} className="border-b border-gray-800/50 hover:bg-gray-800/30">
                            <td className="px-4 py-2 text-gray-400">{t.entry_date}</td>
                            <td className="px-4 py-2 text-gray-400">{t.exit_date}</td>
                            <td className="px-4 py-2 text-right font-mono text-gray-300">${t.entry_price.toFixed(2)}</td>
                            <td className="px-4 py-2 text-right font-mono text-gray-300">${t.exit_price.toFixed(2)}</td>
                            <td className={`px-4 py-2 text-right font-mono font-semibold ${t.pnl >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                              {t.pnl >= 0 ? '+' : ''}${t.pnl.toFixed(2)}
                            </td>
                            <td className={`px-4 py-2 text-right font-mono ${t.return_pct >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                              {pct(t.return_pct)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {result.trades.length > 50 && (
                      <p className="text-center text-xs text-gray-500 py-3">
                        Showing 50 of {result.trades.length} trades
                      </p>
                    )}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}
