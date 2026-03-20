import { useEffect, useState } from 'react'
import { Zap, TrendingUp, Activity, BarChart2, GitBranch } from 'lucide-react'
import toast from 'react-hot-toast'
import { fetchStrategies, Strategy } from '../api/backtest'
import { Link } from 'react-router-dom'

const STRATEGY_ICONS: Record<string, any> = {
  sma_crossover: TrendingUp,
  ema_crossover: GitBranch,
  rsi_oversold: Activity,
  macd: BarChart2,
  bollinger_bands: Zap,
}

const STRATEGY_COLORS: Record<string, string> = {
  sma_crossover: 'blue',
  ema_crossover: 'purple',
  rsi_oversold: 'green',
  macd: 'yellow',
  bollinger_bands: 'pink',
}

const colorMap: Record<string, { bg: string; text: string; border: string }> = {
  blue: { bg: 'bg-blue-500/10', text: 'text-blue-400', border: 'border-blue-500/30' },
  purple: { bg: 'bg-purple-500/10', text: 'text-purple-400', border: 'border-purple-500/30' },
  green: { bg: 'bg-green-500/10', text: 'text-green-400', border: 'border-green-500/30' },
  yellow: { bg: 'bg-yellow-500/10', text: 'text-yellow-400', border: 'border-yellow-500/30' },
  pink: { bg: 'bg-pink-500/10', text: 'text-pink-400', border: 'border-pink-500/30' },
}

export default function Strategies() {
  const [strategies, setStrategies] = useState<Strategy[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchStrategies()
      .then(setStrategies)
      .catch(() => toast.error('Failed to load strategies'))
      .finally(() => setLoading(false))
  }, [])

  if (loading) {
    return (
      <div className="p-6 flex items-center justify-center h-64">
        <div className="flex items-center gap-3 text-gray-400">
          <div className="w-5 h-5 border-2 border-gray-600 border-t-blue-500 rounded-full animate-spin" />
          Loading strategies...
        </div>
      </div>
    )
  }

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-white">Strategy Library</h1>
        <p className="text-gray-400 mt-1">
          {strategies.length} strategies available. Click any to run a backtest.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {strategies.map((strategy) => {
          const color = STRATEGY_COLORS[strategy.id] || 'blue'
          const colors = colorMap[color]
          const Icon = STRATEGY_ICONS[strategy.id] || TrendingUp

          return (
            <div key={strategy.id} className={`card p-6 border ${colors.border}`}>
              <div className="flex items-start gap-4 mb-4">
                <div className={`w-10 h-10 rounded-xl ${colors.bg} flex items-center justify-center flex-shrink-0`}>
                  <Icon className={`w-5 h-5 ${colors.text}`} />
                </div>
                <div>
                  <h2 className="text-lg font-semibold text-white">{strategy.name}</h2>
                  <p className="text-sm text-gray-400 mt-0.5 leading-relaxed">{strategy.description}</p>
                </div>
              </div>

              <div className="mb-4 p-3 bg-gray-800/50 rounded-lg">
                <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">Best Use Case</span>
                <p className="text-sm text-gray-300 mt-1">{strategy.best_use_case}</p>
              </div>

              <div className="mb-5">
                <span className="text-xs font-medium text-gray-500 uppercase tracking-wide block mb-2">Parameters</span>
                <div className="space-y-2">
                  {strategy.params.map((param) => (
                    <div key={param.name} className="flex items-center justify-between text-sm">
                      <span className="text-gray-400">{param.label}</span>
                      <div className="flex items-center gap-2">
                        <span className="text-gray-500 text-xs">
                          Range: {param.min} – {param.max}
                        </span>
                        <span className={`font-mono font-medium ${colors.text}`}>
                          Default: {param.default}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <Link
                to={`/backtest?strategy=${strategy.id}`}
                className="btn-primary w-full text-center text-sm"
              >
                Backtest this strategy
              </Link>
            </div>
          )
        })}
      </div>
    </div>
  )
}
