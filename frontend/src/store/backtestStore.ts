import { create } from 'zustand'

export interface Trade {
  entry_date: string
  exit_date: string
  entry_price: number
  exit_price: number
  side: string
  pnl: number
  pnl_pct: number
  return_pct: number
}

export interface Metrics {
  total_return_pct: number
  cagr: number
  sharpe_ratio: number
  sortino_ratio: number
  max_drawdown_pct: number
  max_drawdown_duration_days: number
  win_rate: number
  profit_factor: number
  avg_win_pct: number
  avg_loss_pct: number
  total_trades: number
  winning_trades: number
  losing_trades: number
  exposure_pct: number
  final_capital: number
  initial_capital: number
}

export interface TimeSeriesPoint {
  time: string
  value: number
}

export interface BacktestResult {
  symbol: string
  strategy_type: string
  from_date: string
  to_date: string
  trades: Trade[]
  metrics: Metrics
  equity_curve: TimeSeriesPoint[]
  drawdown_curve: TimeSeriesPoint[]
}

export interface BacktestConfig {
  symbol: string
  from_date: string
  to_date: string
  strategy_type: string
  params: Record<string, number>
  initial_capital: number
  commission_per_trade: number
}

interface BacktestState {
  config: BacktestConfig
  result: BacktestResult | null
  loading: boolean
  error: string | null
  history: BacktestResult[]
  setConfig: (config: Partial<BacktestConfig>) => void
  setResult: (result: BacktestResult) => void
  setLoading: (loading: boolean) => void
  setError: (error: string | null) => void
  clearResult: () => void
}

const defaultConfig: BacktestConfig = {
  symbol: 'AAPL',
  from_date: '2022-01-01',
  to_date: '2024-01-01',
  strategy_type: 'sma_crossover',
  params: { fast_period: 10, slow_period: 30 },
  initial_capital: 10000,
  commission_per_trade: 1,
}

export const useBacktestStore = create<BacktestState>((set, get) => ({
  config: defaultConfig,
  result: null,
  loading: false,
  error: null,
  history: [],
  setConfig: (config) => set((state) => ({ config: { ...state.config, ...config } })),
  setResult: (result) =>
    set((state) => ({
      result,
      error: null,
      history: [result, ...state.history].slice(0, 20),
    })),
  setLoading: (loading) => set({ loading }),
  setError: (error) => set({ error }),
  clearResult: () => set({ result: null, error: null }),
}))
