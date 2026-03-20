import { useEffect, useRef, useState, useCallback } from 'react'
import {
  createChart, IChartApi, ISeriesApi, UTCTimestamp, LineStyle, IPriceLine,
} from 'lightweight-charts'
import {
  Play, Pause, SkipForward, RefreshCw,
  Maximize2, Minimize2, Minus, Trash2, MousePointer,
} from 'lucide-react'
import toast from 'react-hot-toast'
import { fetchSymbols, fetchReplaySession, ReplaySession, SessionDay } from '../api/data'

// ── Constants ─────────────────────────────────────────────────────────────────
const DEFAULT_SYMBOLS = ['NQ=F', 'ES=F', 'GC=F', 'AAPL', 'MSFT', 'GOOGL', 'TSLA', 'SPY', 'QQQ', 'NVDA']
const SPEEDS = [1, 2, 5, 10, 20]
const DAY_OPTIONS = [
  { label: '1D', days: 1 },
  { label: '2D', days: 2 },
  { label: '3D', days: 3 },
  { label: 'Week', days: 5 },
]
const TIMEFRAMES = [
  { label: '1m',  tf: 1 },
  { label: '5m',  tf: 5 },
  { label: '15m', tf: 15 },
  { label: '30m', tf: 30 },
  { label: '1h',  tf: 60 },
  { label: '4h',  tf: 240 },
]

type Tool = 'cursor' | 'hline'

interface BarRaw { time: number; open: number; high: number; low: number; close: number; volume: number }
interface OpenTrade { id: number; side: 'long' | 'short'; entryPrice: number; lots: number; priceLine?: IPriceLine }
interface ClosedTrade { entry: number; exit: number; lots: number; pnl: number; side: 'long' | 'short' }

let _uid = 0
const uid = () => ++_uid

function lastWeekday() {
  const d = new Date(); d.setDate(d.getDate() - 2)
  while (d.getDay() === 0 || d.getDay() === 6) d.setDate(d.getDate() - 1)
  return d.toISOString().split('T')[0]
}

function fmtTime(ts: number) {
  const d = new Date(ts * 1000)
  const h = String(d.getUTCHours()).padStart(2, '0')
  const m = String(d.getUTCMinutes()).padStart(2, '0')
  return `${h}:${m} ET`
}

/** Aggregate raw 1-min bars up to barIndex into TF-sized candles */
function aggregate(bars: BarRaw[], upTo: number, tf: number) {
  const out: { time: UTCTimestamp; open: number; high: number; low: number; close: number }[] = []
  for (let i = 0; i <= upTo; i += tf) {
    const end = Math.min(i + tf - 1, upTo)
    const s = bars.slice(i, end + 1)
    if (!s.length) continue
    out.push({
      time: s[0].time as UTCTimestamp,
      open: s[0].open,
      high: Math.max(...s.map(b => b.high)),
      low:  Math.min(...s.map(b => b.low)),
      close: s[s.length - 1].close,
    })
  }
  return out
}

// ── Component ─────────────────────────────────────────────────────────────────
export default function Replay() {
  const [symbols, setSymbols] = useState(DEFAULT_SYMBOLS)
  const [symbol, setSymbol] = useState('NQ=F')
  const [date, setDate] = useState(lastWeekday)
  const [days, setDays] = useState(2)
  const [session, setSession] = useState<ReplaySession | null>(null)
  const [loadingSession, setLoadingSession] = useState(false)

  const [barIndex, setBarIndex] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [speed, setSpeed] = useState(2)
  const [tf, setTf] = useState(1)

  // Paper trading
  const [openTrades, setOpenTrades] = useState<OpenTrade[]>([])
  const [closedTrades, setClosedTrades] = useState<ClosedTrade[]>([])
  const [lots, setLots] = useState(1)
  const [realizedPnl, setRealizedPnl] = useState(0)

  // Drawing (only horizontal lines — confirmed working)
  const [tool, setTool] = useState<Tool>('cursor')
  const [hLines, setHLines] = useState<IPriceLine[]>([])
  const [isFullscreen, setIsFullscreen] = useState(false)

  // Refs
  const wrapperRef   = useRef<HTMLDivElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const overlayRef   = useRef<HTMLCanvasElement>(null)
  const chartRef     = useRef<IChartApi | null>(null)
  const candleRef    = useRef<ISeriesApi<'Candlestick'> | null>(null)
  const intervalRef  = useRef<ReturnType<typeof setInterval> | null>(null)
  const toolRef      = useRef<Tool>('cursor')
  const dayBoundaries = useRef<{ time: number; label: string }[]>([])

  useEffect(() => { toolRef.current = tool }, [tool])

  // ── Draw canvas overlay (day boundary lines only) ──────────────────────────
  const redrawOverlay = useCallback(() => {
    const canvas = overlayRef.current
    const chart  = chartRef.current
    if (!canvas || !chart) return
    const W = canvas.width, H = canvas.height
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.clearRect(0, 0, W, H)

    const toX = (t: number) => chart.timeScale().timeToCoordinate(t as UTCTimestamp)

    ctx.setLineDash([6, 4])
    ctx.lineWidth = 1.5
    ctx.strokeStyle = '#f59e0b'
    ctx.fillStyle = '#f59e0b'
    ctx.font = '10px monospace'
    ctx.textAlign = 'left'
    for (const db of dayBoundaries.current) {
      const x = toX(db.time)
      if (x === null) continue
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke()
      ctx.fillText(db.label, x + 3, 12)
    }
    ctx.setLineDash([])
  }, [])

  // ── Init chart ────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!containerRef.current || chartRef.current) return

    const CHART_H = 400

    const chart = createChart(containerRef.current, {
      width: containerRef.current.clientWidth || 700,
      height: CHART_H,
      layout: { background: { color: '#111827' }, textColor: '#9ca3af' },
      grid: { vertLines: { color: '#1f2937' }, horzLines: { color: '#1f2937' } },
      timeScale: { timeVisible: true, secondsVisible: false, borderColor: '#374151' },
      rightPriceScale: { borderColor: '#374151' },
      crosshair: {
        vertLine: { color: '#4b5563', labelBackgroundColor: '#374151' },
        horzLine: { color: '#4b5563', labelBackgroundColor: '#374151' },
      },
    })

    const candles = chart.addCandlestickSeries({
      upColor: '#22c55e', downColor: '#ef4444',
      borderUpColor: '#22c55e', borderDownColor: '#ef4444',
      wickUpColor: '#22c55e', wickDownColor: '#ef4444',
    })

    chartRef.current = chart
    candleRef.current = candles

    if (overlayRef.current) {
      overlayRef.current.width  = containerRef.current.clientWidth || 700
      overlayRef.current.height = CHART_H
    }

    chart.timeScale().subscribeVisibleTimeRangeChange(() => redrawOverlay())
    chart.subscribeCrosshairMove(() => redrawOverlay())

    // Horizontal line via chart click (reliable — uses chart's own coordinate system)
    chart.subscribeClick((param) => {
      if (toolRef.current !== 'hline' || !param.point || !candleRef.current) return
      const price = candleRef.current.coordinateToPrice(param.point.y)
      if (price === null) return
      const line = candleRef.current.createPriceLine({
        price,
        color: '#facc15',
        lineWidth: 1,
        lineStyle: LineStyle.Dashed,
        axisLabelVisible: true,
        title: price.toFixed(2),
      })
      setHLines(prev => [...prev, line])
    })

    const onResize = () => {
      if (!containerRef.current || !chartRef.current) return
      const w = containerRef.current.clientWidth
      chartRef.current.applyOptions({ width: w })
      if (overlayRef.current) { overlayRef.current.width = w; redrawOverlay() }
    }
    window.addEventListener('resize', onResize)

    return () => {
      window.removeEventListener('resize', onResize)
      chart.remove()
      chartRef.current = null
      candleRef.current = null
    }
  }, [redrawOverlay])

  // ── Day boundaries ────────────────────────────────────────────────────────
  useEffect(() => {
    if (!session?.sessions) { dayBoundaries.current = []; return }
    dayBoundaries.current = session.sessions
      .filter((_, i) => i > 0)
      .map(s => ({ time: session.bars[s.start_bar]?.time ?? 0, label: s.date }))
      .filter(d => d.time > 0)
  }, [session])

  // ── Update candles on barIndex/tf change ─────────────────────────────────
  useEffect(() => {
    if (!candleRef.current || !session) return
    candleRef.current.setData(aggregate(session.bars, barIndex, tf))
    chartRef.current?.timeScale().scrollToRealTime()
    redrawOverlay()
  }, [barIndex, session, tf, redrawOverlay])

  // ── Fullscreen resize ─────────────────────────────────────────────────────
  useEffect(() => {
    const H = isFullscreen ? window.innerHeight - 160 : 400
    setTimeout(() => {
      if (!containerRef.current || !chartRef.current) return
      const w = containerRef.current.clientWidth
      chartRef.current.applyOptions({ width: w, height: H })
      if (overlayRef.current) { overlayRef.current.width = w; overlayRef.current.height = H }
      redrawOverlay()
    }, 60)
  }, [isFullscreen, redrawOverlay])

  // ── Playback ──────────────────────────────────────────────────────────────
  useEffect(() => {
    if (playing && session) {
      intervalRef.current = setInterval(() => {
        setBarIndex(prev => {
          if (prev >= session.bars.length - 1) { setPlaying(false); return prev }
          return prev + 1
        })
      }, 1000 / speed)
    } else {
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
    return () => { if (intervalRef.current) clearInterval(intervalRef.current) }
  }, [playing, speed, session])

  // Fullscreen detection
  useEffect(() => {
    const h = () => setIsFullscreen(!!document.fullscreenElement)
    document.addEventListener('fullscreenchange', h)
    return () => document.removeEventListener('fullscreenchange', h)
  }, [])

  useEffect(() => { fetchSymbols().then(setSymbols).catch(() => {}) }, [])

  // ── Load session ──────────────────────────────────────────────────────────
  async function handleLoad() {
    setLoadingSession(true)
    setPlaying(false); setBarIndex(0)
    setOpenTrades([]); setClosedTrades([]); setRealizedPnl(0)
    if (candleRef.current) hLines.forEach(l => { try { candleRef.current!.removePriceLine(l) } catch {} })
    setHLines([])
    candleRef.current?.setData([])
    try {
      const data = await fetchReplaySession(symbol, date, days)
      setSession(data)
      const dayCount = data.sessions?.length ?? 1
      toast.success(`Loaded ${symbol} — ${dayCount} day${dayCount > 1 ? 's' : ''} ending ${data.date}`)
    } catch (e: any) {
      toast.error(e?.response?.data?.detail ?? 'Failed to load session')
    } finally { setLoadingSession(false) }
  }

  // ── Paper trading ─────────────────────────────────────────────────────────
  function openPosition(side: 'long' | 'short') {
    if (!session || !candleRef.current) return
    const bar = session.bars[barIndex]
    const pl = candleRef.current.createPriceLine({
      price: bar.close,
      color: side === 'long' ? '#22c55e' : '#ef4444',
      lineWidth: 1,
      lineStyle: LineStyle.Dashed,
      axisLabelVisible: true,
      title: `${side === 'long' ? 'L' : 'S'} ${lots}×`,
    })
    setOpenTrades(prev => [...prev, { id: uid(), side, entryPrice: bar.close, lots, priceLine: pl }])
    toast(`${side === 'long' ? '▲ Long' : '▼ Short'} ${lots}× @ ${bar.close.toFixed(2)}`)
  }

  function calcPnl(t: OpenTrade, exitPrice: number) {
    return t.side === 'long'
      ? (exitPrice - t.entryPrice) * t.lots
      : (t.entryPrice - exitPrice) * t.lots
  }

  function handleCloseAll() {
    if (!session || !openTrades.length) return
    const bar = session.bars[barIndex]
    let pnl = 0
    const closed = openTrades.map(t => {
      const p = calcPnl(t, bar.close); pnl += p
      if (t.priceLine && candleRef.current) try { candleRef.current.removePriceLine(t.priceLine) } catch {}
      return { entry: t.entryPrice, exit: bar.close, lots: t.lots, pnl: p, side: t.side }
    })
    setClosedTrades(prev => [...prev, ...closed])
    setRealizedPnl(prev => prev + pnl)
    setOpenTrades([])
    toast(pnl >= 0 ? `✓ Closed all +${pnl.toFixed(2)}` : `✗ Closed all ${pnl.toFixed(2)}`)
  }

  function handleCloseOne(id: number) {
    if (!session) return
    const bar = session.bars[barIndex]
    const t = openTrades.find(x => x.id === id); if (!t) return
    const pnl = calcPnl(t, bar.close)
    if (t.priceLine && candleRef.current) try { candleRef.current.removePriceLine(t.priceLine) } catch {}
    setClosedTrades(prev => [...prev, { entry: t.entryPrice, exit: bar.close, lots: t.lots, pnl, side: t.side }])
    setRealizedPnl(prev => prev + pnl)
    setOpenTrades(prev => prev.filter(x => x.id !== id))
  }

  function clearHLines() {
    if (candleRef.current) hLines.forEach(l => { try { candleRef.current!.removePriceLine(l) } catch {} })
    setHLines([])
    toast('Lines cleared')
  }

  // ── Derived values ────────────────────────────────────────────────────────
  const bars = session?.bars ?? []
  const currentBar = bars[barIndex] ?? null
  const barChange = currentBar ? currentBar.close - currentBar.open : 0
  const currentSessionDay = session?.sessions
    ? [...session.sessions].reverse().find(s => barIndex >= s.start_bar)
    : null
  const unrealizedPnl = currentBar
    ? openTrades.reduce((s, t) => s + calcPnl(t, currentBar.close), 0) : 0
  const totalPnl = realizedPnl + unrealizedPnl

  return (
    <div ref={wrapperRef} className={isFullscreen ? 'fixed inset-0 z-50 bg-gray-950 overflow-auto p-4' : 'p-6 max-w-[1600px] mx-auto'}>
      {!isFullscreen && (
        <div className="mb-5">
          <h1 className="text-2xl font-bold text-white">Market Replay</h1>
          <p className="text-gray-400 mt-1">Regular session 09:30–16:00 ET · Times shown in ET</p>
        </div>
      )}

      {/* Load bar */}
      <div className="card p-4 mb-4">
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label className="label">Symbol</label>
            <select className="input w-32" value={symbol} onChange={e => setSymbol(e.target.value)}>
              {symbols.map(s => <option key={s}>{s}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Date</label>
            <input type="date" className="input w-40" value={date} onChange={e => setDate(e.target.value)} />
          </div>
          <div>
            <label className="label">Days</label>
            <div className="flex gap-1">
              {DAY_OPTIONS.map(o => (
                <button key={o.days} onClick={() => setDays(o.days)}
                  className={`px-2.5 py-1.5 rounded text-xs font-mono transition-colors ${days === o.days ? 'bg-blue-600 text-white' : 'bg-gray-800 text-gray-400 hover:text-white'}`}>
                  {o.label}
                </button>
              ))}
            </div>
          </div>
          <button className="btn-primary flex items-center gap-2" onClick={handleLoad} disabled={loadingSession}>
            {loadingSession
              ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              : <Play className="w-4 h-4" />}
            Load Session
          </button>
          <p className="text-xs text-gray-500 self-end pb-2">
            NQ/ES trade 23h/day. Showing regular session only (intraday data requires live feed).
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
        {/* Chart column */}
        <div className="lg:col-span-3 space-y-3">
          <div className="card p-3">
            {/* Toolbar */}
            <div className="flex items-center gap-2 mb-3 flex-wrap">
              {/* OHLC info */}
              <div className="flex items-center gap-2 text-xs font-mono flex-1 min-w-0">
                <span className="font-bold text-white text-sm">{session?.symbol ?? '—'}</span>
                {currentBar && (
                  <>
                    <span className={`px-1.5 py-0.5 rounded ${barChange >= 0 ? 'bg-green-500/15 text-green-400' : 'bg-red-500/15 text-red-400'}`}>
                      {barChange >= 0 ? '+' : ''}{barChange.toFixed(2)}
                    </span>
                    <span className="text-gray-500 hidden md:block">
                      O {currentBar.open.toFixed(2)} &nbsp;
                      H <span className="text-green-400">{currentBar.high.toFixed(2)}</span> &nbsp;
                      L <span className="text-red-400">{currentBar.low.toFixed(2)}</span> &nbsp;
                      C <span className="text-white">{currentBar.close.toFixed(2)}</span>
                    </span>
                  </>
                )}
              </div>

              {/* Timeframes */}
              <div className="flex gap-1">
                {TIMEFRAMES.map(({ label, tf: t }) => (
                  <button key={t} onClick={() => setTf(t)}
                    className={`px-2 py-1 rounded text-xs font-mono transition-colors ${tf === t ? 'bg-blue-600 text-white' : 'bg-gray-800 text-gray-400 hover:text-white'}`}>
                    {label}
                  </button>
                ))}
              </div>

              <div className="w-px h-5 bg-gray-700" />

              {/* Drawing tools */}
              <button title="Cursor" onClick={() => setTool('cursor')}
                className={`p-1.5 rounded transition-colors ${tool === 'cursor' ? 'bg-blue-600 text-white' : 'bg-gray-800 text-gray-400 hover:text-white'}`}>
                <MousePointer className="w-3.5 h-3.5" />
              </button>
              <button title="Horizontal Line — click chart to place" onClick={() => setTool(t => t === 'hline' ? 'cursor' : 'hline')}
                className={`p-1.5 rounded transition-colors ${tool === 'hline' ? 'bg-blue-600 text-white' : 'bg-gray-800 text-yellow-400 hover:text-white'}`}>
                <Minus className="w-3.5 h-3.5" />
              </button>
              {hLines.length > 0 && (
                <button title="Clear all lines" onClick={clearHLines}
                  className="p-1.5 rounded bg-gray-800 text-red-400 hover:text-red-300 transition-colors">
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              )}

              <div className="w-px h-5 bg-gray-700" />

              {/* Fullscreen */}
              <button onClick={() => !document.fullscreenElement ? wrapperRef.current?.requestFullscreen() : document.exitFullscreen()}
                className="p-1.5 rounded bg-gray-800 text-gray-400 hover:text-white transition-colors" title="Fullscreen">
                {isFullscreen ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
              </button>
            </div>

            {tool === 'hline' && (
              <div className="mb-2 text-center text-xs text-yellow-400/80">
                → Click anywhere on the chart to place a horizontal line
              </div>
            )}

            {/* Chart + canvas overlay (canvas is pointer-events:none — only for day markers) */}
            <div className="relative">
              <div ref={containerRef} className="w-full" />
              <canvas
                ref={overlayRef}
                className="absolute top-0 left-0"
                style={{ pointerEvents: 'none' }}
              />
              {!session && !loadingSession && (
                <div className="absolute inset-0 flex flex-col items-center justify-center bg-gray-900/80 rounded pointer-events-none">
                  <Play className="w-10 h-10 text-gray-600 mb-2" />
                  <p className="text-gray-500 text-sm">Load a session to see candlesticks</p>
                </div>
              )}
              {loadingSession && (
                <div className="absolute inset-0 flex items-center justify-center bg-gray-900/80 rounded pointer-events-none">
                  <div className="w-6 h-6 border-2 border-gray-600 border-t-blue-500 rounded-full animate-spin" />
                </div>
              )}
            </div>

            {/* Scrub + progress */}
            <div className="mt-3">
              <div className="flex justify-between text-xs text-gray-500 mb-1">
                <span>
                  Bar {session ? barIndex + 1 : 0} / {bars.length}
                  {currentSessionDay && session?.sessions && session.sessions.length > 1 && (
                    <span className="ml-2 text-amber-400 font-mono">{currentSessionDay.date}</span>
                  )}
                </span>
                <span>
                  {currentBar ? fmtTime(currentBar.time) : '—'}
                  {bars.length > 0 && ` · ${fmtTime(bars[0].time)}–${fmtTime(bars[bars.length - 1].time)}`}
                </span>
              </div>
              <input type="range" min={0} max={Math.max(bars.length - 1, 0)} value={barIndex}
                onChange={e => { setPlaying(false); setBarIndex(Number(e.target.value)) }}
                className="w-full h-1.5 accent-blue-500 cursor-pointer" disabled={!session} />
            </div>
          </div>

          {/* Playback controls */}
          <div className="card p-3 flex items-center gap-2">
            <button onClick={() => setPlaying(v => !v)} disabled={!session || barIndex >= bars.length - 1}
              className={`p-2 rounded-lg transition-colors ${playing ? 'bg-yellow-500/10 text-yellow-400' : 'bg-blue-500/10 text-blue-400'}`}>
              {playing ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5" />}
            </button>
            <button onClick={() => session && setBarIndex(p => Math.min(p + tf, bars.length - 1))}
              disabled={!session || playing}
              className="p-2 rounded-lg bg-gray-800 text-gray-400 hover:text-gray-200 transition-colors">
              <SkipForward className="w-5 h-5" />
            </button>
            <button onClick={() => { setBarIndex(0); setPlaying(false) }} disabled={!session}
              className="p-2 rounded-lg bg-gray-800 text-gray-400 hover:text-gray-200 transition-colors">
              <RefreshCw className="w-4 h-4" />
            </button>
            <div className="ml-auto flex items-center gap-2">
              <span className="text-xs text-gray-500">Speed</span>
              <div className="flex gap-1">
                {SPEEDS.map(s => (
                  <button key={s} onClick={() => setSpeed(s)}
                    className={`px-2 py-0.5 rounded text-xs font-mono transition-colors ${speed === s ? 'bg-blue-600 text-white' : 'bg-gray-800 text-gray-400 hover:text-gray-200'}`}>
                    {s}x
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Side panel */}
        <div className="space-y-3">
          {/* Paper trade */}
          <div className="card p-4">
            <h3 className="text-sm font-semibold text-white mb-3">Paper Trade</h3>
            <div className="mb-3">
              <label className="label">Contracts / Lot Size</label>
              <div className="flex items-center gap-2">
                <button onClick={() => setLots(l => Math.max(1, l - 1))}
                  className="w-8 h-8 rounded bg-gray-800 text-gray-300 hover:bg-gray-700 font-bold text-lg">−</button>
                <input type="number" min={1} value={lots}
                  onChange={e => setLots(Math.max(1, parseInt(e.target.value) || 1))}
                  className="input text-center flex-1" />
                <button onClick={() => setLots(l => l + 1)}
                  className="w-8 h-8 rounded bg-gray-800 text-gray-300 hover:bg-gray-700 font-bold text-lg">+</button>
              </div>
            </div>
            <div className="space-y-2">
              <div className="grid grid-cols-2 gap-2">
                <button onClick={() => openPosition('long')} disabled={!session}
                  className="py-2.5 rounded-lg bg-green-600 hover:bg-green-500 disabled:opacity-40 text-white text-sm font-semibold transition-colors">
                  ▲ Buy {lots > 1 ? `${lots}×` : ''}
                </button>
                <button onClick={() => openPosition('short')} disabled={!session}
                  className="py-2.5 rounded-lg bg-red-600 hover:bg-red-500 disabled:opacity-40 text-white text-sm font-semibold transition-colors">
                  ▼ Sell {lots > 1 ? `${lots}×` : ''}
                </button>
              </div>
              <button onClick={handleCloseAll} disabled={!session || openTrades.length === 0}
                className="w-full py-2 rounded-lg bg-gray-700 hover:bg-gray-600 disabled:opacity-40 text-white text-sm font-medium transition-colors">
                Close All ({openTrades.length})
              </button>
            </div>
            <div className="mt-3 space-y-1.5 text-sm border-t border-gray-800 pt-3">
              <div className="flex justify-between">
                <span className="text-gray-500">Unrealized</span>
                <span className={`font-mono ${unrealizedPnl >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                  {unrealizedPnl >= 0 ? '+' : ''}{unrealizedPnl.toFixed(2)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Realized</span>
                <span className={`font-mono ${realizedPnl >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                  {realizedPnl >= 0 ? '+' : ''}{realizedPnl.toFixed(2)}
                </span>
              </div>
              <div className="flex justify-between border-t border-gray-800 pt-1.5">
                <span className="text-gray-300 font-semibold">Total P&amp;L</span>
                <span className={`font-mono font-bold text-base ${totalPnl >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                  {totalPnl >= 0 ? '+' : ''}{totalPnl.toFixed(2)}
                </span>
              </div>
            </div>
          </div>

          {/* Open positions */}
          {openTrades.length > 0 && (
            <div className="card p-4">
              <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Open Positions</h3>
              <div className="space-y-2 max-h-44 overflow-y-auto">
                {openTrades.map(t => {
                  const upnl = currentBar ? calcPnl(t, currentBar.close) : 0
                  return (
                    <div key={t.id} className="flex items-center justify-between text-xs bg-gray-800/50 rounded px-2 py-1.5">
                      <div className="flex items-center gap-1.5">
                        <span className={`font-bold ${t.side === 'long' ? 'text-green-400' : 'text-red-400'}`}>
                          {t.side === 'long' ? '▲' : '▼'}
                        </span>
                        <span className="text-gray-200 font-mono">{t.entryPrice.toFixed(2)}</span>
                        <span className="text-gray-500">×{t.lots}</span>
                      </div>
                      <span className={`font-mono font-semibold ${upnl >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                        {upnl >= 0 ? '+' : ''}{upnl.toFixed(2)}
                      </span>
                      <button onClick={() => handleCloseOne(t.id)} className="text-gray-500 hover:text-red-400 ml-1 transition-colors">✕</button>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* Daily ref */}
          {session && (
            <div className="card p-4">
              <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                Daily Reference{session.sessions?.length > 1 ? ` (${session.sessions.length} days)` : ''}
              </h3>
              {session.sessions?.length > 1 ? (
                <div className="space-y-2 max-h-52 overflow-y-auto">
                  {[...session.sessions].reverse().map((s: SessionDay) => (
                    <div key={s.date} className="text-xs border-b border-gray-800 pb-2 last:border-0 last:pb-0">
                      <div className="text-gray-400 font-mono mb-1">{s.date}</div>
                      <div className="grid grid-cols-2 gap-x-3 gap-y-0.5">
                        {(['open', 'high', 'low', 'close'] as const).map(k => (
                          <div key={k} className="flex justify-between">
                            <span className="text-gray-600 capitalize">{k[0].toUpperCase()}</span>
                            <span className={`font-mono ${k === 'high' ? 'text-green-400' : k === 'low' ? 'text-red-400' : 'text-gray-300'}`}>
                              {(s.daily_bar[k] as number).toFixed(2)}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="space-y-1 text-sm">
                  {[['Open', session.daily_bar.open], ['High', session.daily_bar.high],
                    ['Low', session.daily_bar.low], ['Close', session.daily_bar.close]].map(([l, v]) => (
                    <div key={l as string} className="flex justify-between">
                      <span className="text-gray-500">{l}</span>
                      <span className="font-mono text-gray-200">{(v as number).toFixed(2)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Trade log */}
          {closedTrades.length > 0 && (
            <div className="card p-4">
              <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                Trade Log ({closedTrades.length})
              </h3>
              <div className="space-y-1.5 max-h-48 overflow-y-auto">
                {closedTrades.map((t, i) => (
                  <div key={i} className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-1.5">
                      <span className={`font-bold ${t.side === 'long' ? 'text-green-400' : 'text-red-400'}`}>
                        {t.side === 'long' ? '▲' : '▼'}
                      </span>
                      <span className="text-gray-400 font-mono">
                        {t.entry.toFixed(2)}→{t.exit.toFixed(2)}<span className="text-gray-600"> ×{t.lots}</span>
                      </span>
                    </div>
                    <span className={`font-mono font-semibold ${t.pnl >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                      {t.pnl >= 0 ? '+' : ''}{t.pnl.toFixed(2)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
