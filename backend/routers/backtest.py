import pandas as pd
import yfinance as yf
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from engine.backtest import run_backtest

router = APIRouter()

STRATEGIES = [
    {
        "id": "ict_order_block",
        "name": "ICT Order Block",
        "description": "Identifies the last bearish candle before a 3-bar bullish impulse (institutional footprint). Enters long on retracement into the order block zone.",
        "best_use_case": "NQ, ES, GC — indices and commodities with strong institutional flow.",
        "params": [
            {"name": "lookback", "label": "Lookback Bars", "type": "int", "default": 20, "min": 5, "max": 60},
            {"name": "impulse_bars", "label": "Impulse Bars", "type": "int", "default": 3, "min": 2, "max": 6},
        ],
    },
    {
        "id": "ict_fvg",
        "name": "ICT Fair Value Gap",
        "description": "Detects 3-candle imbalance zones where price skipped over a range. Enters long when price retraces into the gap — a core ICT concept for precision entries.",
        "best_use_case": "NQ, ES — liquid indices where price often fills imbalances.",
        "params": [
            {"name": "min_gap_pct", "label": "Min Gap Size (%)", "type": "float", "default": 0.15, "min": 0.05, "max": 2.0},
            {"name": "max_active_fvgs", "label": "Max Active FVGs", "type": "int", "default": 5, "min": 1, "max": 20},
        ],
    },
    {
        "id": "ema_pullback",
        "name": "Triple EMA Pullback",
        "description": "Uses 9/21/50 EMA alignment to confirm trend, then buys pullbacks to the mid EMA. One of the highest-performing setups on trending indices.",
        "best_use_case": "NQ, ES, SPY — strong trending markets.",
        "params": [
            {"name": "fast_ema", "label": "Fast EMA", "type": "int", "default": 9, "min": 3, "max": 50},
            {"name": "mid_ema", "label": "Mid EMA", "type": "int", "default": 21, "min": 5, "max": 100},
            {"name": "slow_ema", "label": "Slow EMA", "type": "int", "default": 50, "min": 10, "max": 200},
        ],
    },
    {
        "id": "breakout",
        "name": "N-Day Breakout (Turtle Trading)",
        "description": "Buys when price closes above the highest high of the last N days. Exits on a shorter-period low. Historically one of the best-performing systematic strategies on commodities and indices.",
        "best_use_case": "GC (Gold), NQ, ES — trending instruments over multi-week periods.",
        "params": [
            {"name": "period", "label": "Entry Breakout Period", "type": "int", "default": 20, "min": 5, "max": 100},
            {"name": "exit_period", "label": "Exit Period", "type": "int", "default": 10, "min": 3, "max": 50},
        ],
    },
    {
        "id": "sma_crossover",
        "name": "SMA Crossover",
        "description": "Buy when the fast SMA crosses above the slow SMA, sell when it crosses below.",
        "best_use_case": "Trending markets with clear directional momentum.",
        "params": [
            {"name": "fast_period", "label": "Fast Period", "type": "int", "default": 10, "min": 2, "max": 200},
            {"name": "slow_period", "label": "Slow Period", "type": "int", "default": 30, "min": 5, "max": 500},
        ],
    },
    {
        "id": "ema_crossover",
        "name": "EMA Crossover",
        "description": "Like SMA crossover but uses Exponential Moving Averages which react faster to price changes.",
        "best_use_case": "Fast-moving markets where responsiveness matters.",
        "params": [
            {"name": "fast_period", "label": "Fast Period", "type": "int", "default": 9, "min": 2, "max": 200},
            {"name": "slow_period", "label": "Slow Period", "type": "int", "default": 21, "min": 5, "max": 500},
        ],
    },
    {
        "id": "rsi_oversold",
        "name": "RSI Oversold/Overbought",
        "description": "Buy when RSI drops below oversold threshold, sell when it rises above overbought threshold.",
        "best_use_case": "Range-bound or mean-reverting markets.",
        "params": [
            {"name": "period", "label": "RSI Period", "type": "int", "default": 14, "min": 2, "max": 100},
            {"name": "oversold_threshold", "label": "Oversold Level", "type": "float", "default": 30, "min": 5, "max": 49},
            {"name": "overbought_threshold", "label": "Overbought Level", "type": "float", "default": 70, "min": 51, "max": 95},
        ],
    },
    {
        "id": "macd",
        "name": "MACD",
        "description": "Buy when MACD line crosses above the signal line, sell on cross below.",
        "best_use_case": "Identifying momentum shifts in trending markets.",
        "params": [
            {"name": "fast", "label": "Fast EMA", "type": "int", "default": 12, "min": 2, "max": 100},
            {"name": "slow", "label": "Slow EMA", "type": "int", "default": 26, "min": 5, "max": 200},
            {"name": "signal", "label": "Signal Period", "type": "int", "default": 9, "min": 2, "max": 50},
        ],
    },
    {
        "id": "bollinger_bands",
        "name": "Bollinger Bands",
        "description": "Buy when price touches the lower band (oversold), sell when it touches the upper band (overbought).",
        "best_use_case": "Volatility-based mean reversion in sideways markets.",
        "params": [
            {"name": "period", "label": "Period", "type": "int", "default": 20, "min": 5, "max": 200},
            {"name": "std_dev", "label": "Std Deviations", "type": "float", "default": 2.0, "min": 0.5, "max": 4.0},
        ],
    },
]


class BacktestRequest(BaseModel):
    symbol: str
    from_date: str
    to_date: str
    strategy_type: str
    params: dict
    initial_capital: float = 10000.0
    commission_per_trade: float = 1.0


def _fetch_ohlcv(symbol: str, from_date: str, to_date: str) -> list:
    ticker = yf.Ticker(symbol.upper())
    df = ticker.history(start=from_date, end=to_date, interval="1d", auto_adjust=True)
    if df.empty:
        raise HTTPException(status_code=404, detail=f"No data found for {symbol}")
    results = []
    for ts, row in df.iterrows():
        results.append({
            "time": ts.strftime("%Y-%m-%d"),
            "open": round(float(row["Open"]), 4),
            "high": round(float(row["High"]), 4),
            "low": round(float(row["Low"]), 4),
            "close": round(float(row["Close"]), 4),
            "volume": int(row["Volume"]),
        })
    return results


@router.get("/strategies")
def get_strategies():
    return {"strategies": STRATEGIES}


@router.post("/run")
def run_backtest_endpoint(req: BacktestRequest):
    if req.initial_capital <= 0:
        raise HTTPException(status_code=400, detail="Initial capital must be positive")
    if req.commission_per_trade < 0:
        raise HTTPException(status_code=400, detail="Commission cannot be negative")

    ohlcv = _fetch_ohlcv(req.symbol, req.from_date, req.to_date)

    if len(ohlcv) < 3:
        raise HTTPException(status_code=400, detail=f"Only {len(ohlcv)} bars found for {req.symbol} in this date range. Try a wider date range (e.g. 6–12 months for best results).")

    df = pd.DataFrame(ohlcv)
    for col in ["close", "open", "high", "low", "volume"]:
        df[col] = df[col].astype(float)

    try:
        result = run_backtest(
            df=df,
            strategy_type=req.strategy_type,
            params=req.params,
            initial_capital=req.initial_capital,
            commission=req.commission_per_trade,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Backtest error: {str(e)}")

    warning = None
    if not result.get("trades"):
        warning = (
            f"No trades were found in {len(ohlcv)} bars. "
            f"This strategy may need more history — try a date range of 6–24 months. "
            f"Some strategies (ICT Order Block, FVG) require specific market conditions to trigger."
        )

    return {
        "symbol": req.symbol.upper(),
        "strategy_type": req.strategy_type,
        "from_date": req.from_date,
        "to_date": req.to_date,
        "warning": warning,
        **result,
    }
