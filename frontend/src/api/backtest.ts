import apiClient from './client'
import { BacktestConfig, BacktestResult } from '../store/backtestStore'

export interface Strategy {
  id: string
  name: string
  description: string
  best_use_case: string
  params: StrategyParam[]
}

export interface StrategyParam {
  name: string
  label: string
  type: 'int' | 'float'
  default: number
  min: number
  max: number
}

export const fetchStrategies = async (): Promise<Strategy[]> => {
  const response = await apiClient.get('/backtest/strategies')
  return response.data.strategies
}

export const runBacktest = async (config: BacktestConfig): Promise<BacktestResult> => {
  const response = await apiClient.post('/backtest/run', {
    symbol: config.symbol,
    from_date: config.from_date,
    to_date: config.to_date,
    strategy_type: config.strategy_type,
    params: config.params,
    initial_capital: config.initial_capital,
    commission_per_trade: config.commission_per_trade,
  })
  return response.data
}
