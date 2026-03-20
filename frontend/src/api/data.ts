import apiClient from './client'

export interface OHLCVBar {
  time: string
  open: number
  high: number
  low: number
  close: number
  volume: number
}

export const fetchSymbols = async (): Promise<string[]> => {
  const response = await apiClient.get('/data/symbols')
  return response.data.symbols
}

export const fetchOHLCV = async (
  symbol: string,
  from: string,
  to: string
): Promise<OHLCVBar[]> => {
  const response = await apiClient.get('/data/ohlcv', {
    params: { symbol, from, to },
  })
  return response.data.data
}

export interface SessionDay {
  date: string
  start_bar: number
  daily_bar: OHLCVBar
}

export interface ReplaySession {
  symbol: string
  date: string
  daily_bar: OHLCVBar
  bars: Array<{
    time: number
    open: number
    high: number
    low: number
    close: number
    volume: number
  }>
  sessions: SessionDay[]
}

export const fetchReplaySession = async (
  symbol: string,
  date: string,
  days: number = 1
): Promise<ReplaySession> => {
  const response = await apiClient.get('/replay/session', {
    params: { symbol, date, days },
  })
  return response.data
}
