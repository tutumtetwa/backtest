import { Link } from 'react-router-dom'
import { TrendingUp, Play, BarChart2, Zap, ArrowRight, Activity, DollarSign, Target, Clock } from 'lucide-react'
import { useAuthStore } from '../store/authStore'
import { useBacktestStore } from '../store/backtestStore'

const STRATEGY_NAMES: Record<string, string> = {
  sma_crossover: 'SMA Crossover',
  ema_crossover: 'EMA Crossover',
  rsi_oversold: 'RSI Oversold',
  macd: 'MACD',
  bollinger_bands: 'Bollinger Bands',
}

export default function Dashboard() {
  const { user } = useAuthStore()
  const { history } = useBacktestStore()

  const totalRuns = history.length
  const bestReturn = history.length > 0
    ? Math.max(...history.map((r) => r.metrics?.total_return_pct ?? 0))
    : null
  const avgSharpe = history.length > 0
    ? history.reduce((acc, r) => acc + (r.metrics?.sharpe_ratio ?? 0), 0) / history.length
    : null

  const stats = [
    {
      label: 'Backtests Run',
      value: totalRuns.toString(),
      icon: Activity,
      color: 'text-blue-400',
      bg: 'bg-blue-500/10',
    },
    {
      label: 'Best Return',
      value: bestReturn !== null ? `${bestReturn >= 0 ? '+' : ''}${bestReturn.toFixed(2)}%` : '—',
      icon: TrendingUp,
      color: bestReturn !== null && bestReturn >= 0 ? 'text-green-400' : 'text-red-400',
      bg: bestReturn !== null && bestReturn >= 0 ? 'bg-green-500/10' : 'bg-red-500/10',
    },
    {
      label: 'Avg Sharpe Ratio',
      value: avgSharpe !== null ? avgSharpe.toFixed(2) : '—',
      icon: Target,
      color: 'text-purple-400',
      bg: 'bg-purple-500/10',
    },
    {
      label: 'Strategies Available',
      value: '5',
      icon: Zap,
      color: 'text-yellow-400',
      bg: 'bg-yellow-500/10',
    },
  ]

  const quickActions = [
    {
      title: 'Run a Backtest',
      description: 'Test a trading strategy against historical data with real performance metrics.',
      icon: BarChart2,
      href: '/backtest',
      color: 'blue',
    },
    {
      title: 'Market Replay',
      description: 'Replay a trading day bar by bar and practice manual trading decisions.',
      icon: Play,
      href: '/replay',
      color: 'green',
    },
    {
      title: 'Strategy Library',
      description: 'Explore all available strategies, their parameters, and best use cases.',
      icon: TrendingUp,
      href: '/strategies',
      color: 'purple',
    },
  ]

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-white">
          Good morning{user?.email ? `, ${user.email.split('@')[0]}` : ''}
        </h1>
        <p className="text-gray-400 mt-1">Here's your trading research overview.</p>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {stats.map((stat) => (
          <div key={stat.label} className="card p-5">
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm text-gray-400">{stat.label}</span>
              <div className={`w-8 h-8 rounded-lg ${stat.bg} flex items-center justify-center`}>
                <stat.icon className={`w-4 h-4 ${stat.color}`} />
              </div>
            </div>
            <div className={`text-2xl font-bold ${stat.color}`}>{stat.value}</div>
          </div>
        ))}
      </div>

      {/* Quick actions */}
      <div className="mb-8">
        <h2 className="text-lg font-semibold text-white mb-4">Quick Actions</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {quickActions.map((action) => (
            <Link
              key={action.title}
              to={action.href}
              className="card p-6 hover:border-gray-700 transition-all group"
            >
              <div className={`w-10 h-10 rounded-xl mb-4 flex items-center justify-center ${
                action.color === 'blue' ? 'bg-blue-500/10' :
                action.color === 'green' ? 'bg-green-500/10' : 'bg-purple-500/10'
              }`}>
                <action.icon className={`w-5 h-5 ${
                  action.color === 'blue' ? 'text-blue-400' :
                  action.color === 'green' ? 'text-green-400' : 'text-purple-400'
                }`} />
              </div>
              <h3 className="font-semibold text-white mb-1 group-hover:text-blue-400 transition-colors">
                {action.title}
              </h3>
              <p className="text-sm text-gray-400 leading-relaxed">{action.description}</p>
              <div className="mt-4 flex items-center gap-1 text-sm text-blue-400 font-medium">
                Get started <ArrowRight className="w-3.5 h-3.5 group-hover:translate-x-1 transition-transform" />
              </div>
            </Link>
          ))}
        </div>
      </div>

      {/* Recent backtests */}
      <div>
        <h2 className="text-lg font-semibold text-white mb-4">Recent Backtests</h2>
        {history.length === 0 ? (
          <div className="card p-8 text-center">
            <BarChart2 className="w-12 h-12 text-gray-700 mx-auto mb-3" />
            <p className="text-gray-400 font-medium">No backtests yet</p>
            <p className="text-gray-600 text-sm mt-1">Run your first backtest to see results here.</p>
            <Link to="/backtest" className="btn-primary inline-block mt-4 text-sm">
              Run a backtest
            </Link>
          </div>
        ) : (
          <div className="card overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-800">
                  <th className="text-left text-gray-400 font-medium px-4 py-3">Symbol</th>
                  <th className="text-left text-gray-400 font-medium px-4 py-3">Strategy</th>
                  <th className="text-left text-gray-400 font-medium px-4 py-3">Period</th>
                  <th className="text-right text-gray-400 font-medium px-4 py-3">Return</th>
                  <th className="text-right text-gray-400 font-medium px-4 py-3">Sharpe</th>
                  <th className="text-right text-gray-400 font-medium px-4 py-3">Trades</th>
                </tr>
              </thead>
              <tbody>
                {history.slice(0, 10).map((bt, i) => (
                  <tr key={i} className="border-b border-gray-800/50 hover:bg-gray-800/30 transition-colors">
                    <td className="px-4 py-3 font-mono font-semibold text-white">{bt.symbol}</td>
                    <td className="px-4 py-3 text-gray-300">{STRATEGY_NAMES[bt.strategy_type] ?? bt.strategy_type}</td>
                    <td className="px-4 py-3 text-gray-400">{bt.from_date} – {bt.to_date}</td>
                    <td className={`px-4 py-3 text-right font-semibold font-mono ${
                      bt.metrics.total_return_pct >= 0 ? 'text-green-400' : 'text-red-400'
                    }`}>
                      {bt.metrics.total_return_pct >= 0 ? '+' : ''}{bt.metrics.total_return_pct.toFixed(2)}%
                    </td>
                    <td className={`px-4 py-3 text-right font-mono ${
                      bt.metrics.sharpe_ratio >= 1 ? 'text-green-400' :
                      bt.metrics.sharpe_ratio >= 0 ? 'text-yellow-400' : 'text-red-400'
                    }`}>
                      {bt.metrics.sharpe_ratio.toFixed(2)}
                    </td>
                    <td className="px-4 py-3 text-right text-gray-300">{bt.metrics.total_trades}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
