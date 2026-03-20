import pandas as pd
import numpy as np


def _sma(series: pd.Series, period: int) -> pd.Series:
    return series.rolling(window=period).mean()


def _ema(series: pd.Series, period: int) -> pd.Series:
    return series.ewm(span=period, adjust=False).mean()


def _rsi(series: pd.Series, period: int) -> pd.Series:
    delta = series.diff()
    gain = delta.clip(lower=0)
    loss = -delta.clip(upper=0)
    avg_gain = gain.ewm(com=period - 1, adjust=False).mean()
    avg_loss = loss.ewm(com=period - 1, adjust=False).mean()
    rs = avg_gain / avg_loss.replace(0, np.nan)
    return 100 - (100 / (1 + rs))


def _macd(series: pd.Series, fast: int, slow: int, signal: int):
    ema_fast = _ema(series, fast)
    ema_slow = _ema(series, slow)
    macd_line = ema_fast - ema_slow
    signal_line = _ema(macd_line, signal)
    hist = macd_line - signal_line
    return macd_line, signal_line, hist


def _bollinger(series: pd.Series, period: int, std_dev: float):
    mid = _sma(series, period)
    std = series.rolling(window=period).std()
    upper = mid + std_dev * std
    lower = mid - std_dev * std
    return upper, mid, lower


def _atr(df: pd.DataFrame, period: int = 14) -> pd.Series:
    high = df["high"]
    low = df["low"]
    close = df["close"]
    tr = pd.concat([
        high - low,
        (high - close.shift()).abs(),
        (low - close.shift()).abs(),
    ], axis=1).max(axis=1)
    return tr.rolling(period).mean()


# ── Original strategies ────────────────────────────────────────────────────────

def _generate_signals_sma_crossover(df: pd.DataFrame, params: dict) -> pd.Series:
    fast = int(params.get("fast_period", 10))
    slow = int(params.get("slow_period", 30))
    fast_sma = _sma(df["close"], fast)
    slow_sma = _sma(df["close"], slow)
    signal = pd.Series(0, index=df.index)
    signal[fast_sma > slow_sma] = 1
    signal[fast_sma < slow_sma] = -1
    return signal


def _generate_signals_ema_crossover(df: pd.DataFrame, params: dict) -> pd.Series:
    fast = int(params.get("fast_period", 9))
    slow = int(params.get("slow_period", 21))
    fast_ema = _ema(df["close"], fast)
    slow_ema = _ema(df["close"], slow)
    signal = pd.Series(0, index=df.index)
    signal[fast_ema > slow_ema] = 1
    signal[fast_ema < slow_ema] = -1
    return signal


def _generate_signals_rsi_oversold(df: pd.DataFrame, params: dict) -> pd.Series:
    period = int(params.get("period", 14))
    oversold = float(params.get("oversold_threshold", 30))
    overbought = float(params.get("overbought_threshold", 70))
    rsi = _rsi(df["close"], period)
    signal = pd.Series(0, index=df.index)
    position = 0
    for i in range(len(signal)):
        if rsi.iloc[i] < oversold and position == 0:
            position = 1
        elif rsi.iloc[i] > overbought and position == 1:
            position = 0
        signal.iloc[i] = position
    return signal


def _generate_signals_macd(df: pd.DataFrame, params: dict) -> pd.Series:
    fast = int(params.get("fast", 12))
    slow = int(params.get("slow", 26))
    signal_period = int(params.get("signal", 9))
    macd_line, signal_line, _ = _macd(df["close"], fast, slow, signal_period)
    signal = pd.Series(0, index=df.index)
    signal[macd_line > signal_line] = 1
    signal[macd_line < signal_line] = -1
    return signal


def _generate_signals_bollinger_bands(df: pd.DataFrame, params: dict) -> pd.Series:
    period = int(params.get("period", 20))
    std_dev = float(params.get("std_dev", 2.0))
    upper, mid, lower = _bollinger(df["close"], period, std_dev)
    signal = pd.Series(0, index=df.index)
    position = 0
    for i in range(len(signal)):
        close = df["close"].iloc[i]
        if pd.isna(lower.iloc[i]) or pd.isna(upper.iloc[i]):
            signal.iloc[i] = 0
            continue
        if close <= lower.iloc[i] and position == 0:
            position = 1
        elif close >= upper.iloc[i] and position == 1:
            position = 0
        signal.iloc[i] = position
    return signal


# ── ICT & high-return strategies ───────────────────────────────────────────────

def _generate_signals_ict_order_block(df: pd.DataFrame, params: dict) -> pd.Series:
    """
    ICT Bullish Order Block:
    - Find the last bearish candle (close < open) before a 3-bar bullish impulse.
    - Enter long when price retraces into the order block zone [low, open].
    - Exit when price closes below the order block low (invalidated).
    """
    lookback = int(params.get("lookback", 20))
    impulse = int(params.get("impulse_bars", 3))

    close = df["close"].values
    open_ = df["open"].values
    high = df["high"].values
    low = df["low"].values

    signal = pd.Series(0, index=df.index)
    position = 0
    ob_low = 0.0

    for i in range(impulse + lookback, len(df)):
        if position == 0:
            # Scan back for an order block
            for j in range(i - lookback, i - impulse - 1):
                if j < 1:
                    continue
                # Candle j must be bearish
                if close[j] >= open_[j]:
                    continue
                # Next `impulse` candles must all be bullish and higher
                if not all(close[j+k] > open_[j+k] and close[j+k] > close[j+k-1]
                           for k in range(1, impulse + 1) if j+k < i):
                    continue
                # OB zone: [low[j], open[j]]
                ob_zone_low = low[j]
                ob_zone_high = open_[j]
                # Price retracing into OB?
                if ob_zone_low <= close[i] <= ob_zone_high:
                    signal.iloc[i] = 1
                    position = 1
                    ob_low = ob_zone_low
                    break
        else:
            if close[i] < ob_low:
                position = 0
            else:
                signal.iloc[i] = 1

    return signal


def _generate_signals_ict_fvg(df: pd.DataFrame, params: dict) -> pd.Series:
    """
    ICT Fair Value Gap (FVG):
    - Bullish FVG: gap between candle[i-2].high and candle[i].low (price skipped this zone).
    - Enter long when price retraces into the gap.
    - Exit when price closes below the FVG low.
    """
    min_gap_pct = float(params.get("min_gap_pct", 0.15))
    max_fvgs = int(params.get("max_active_fvgs", 5))

    close = df["close"].values
    high = df["high"].values
    low = df["low"].values

    signal = pd.Series(0, index=df.index)
    position = 0
    active_fvgs: list = []
    fvg_low = 0.0

    for i in range(2, len(df)):
        # Detect new bullish FVG on this bar
        gap_low = high[i - 2]
        gap_high = low[i]
        if gap_high > gap_low:
            gap_pct = (gap_high - gap_low) / close[i - 2] * 100
            if gap_pct >= min_gap_pct:
                active_fvgs.append((gap_low, gap_high))
        active_fvgs = active_fvgs[-max_fvgs:]

        if position == 0:
            for fvg_l, fvg_h in active_fvgs:
                if fvg_l <= close[i] <= fvg_h:
                    signal.iloc[i] = 1
                    position = 1
                    fvg_low = fvg_l
                    break
        else:
            if close[i] < fvg_low:
                position = 0
            else:
                signal.iloc[i] = 1

    return signal


def _generate_signals_ema_pullback(df: pd.DataFrame, params: dict) -> pd.Series:
    """
    Triple EMA Trend Pullback (high-performance on indices):
    - Uptrend confirmed when fast EMA > mid EMA > slow EMA.
    - Enter long when price pulls back to the mid EMA (touching or crossing below fast).
    - Exit when price closes below the slow EMA.
    """
    fast = int(params.get("fast_ema", 9))
    mid = int(params.get("mid_ema", 21))
    slow = int(params.get("slow_ema", 50))

    ema_f = _ema(df["close"], fast)
    ema_m = _ema(df["close"], mid)
    ema_s = _ema(df["close"], slow)

    signal = pd.Series(0, index=df.index)
    position = 0

    for i in range(slow + 1, len(df)):
        close_i = df["close"].iloc[i]
        ef = ema_f.iloc[i]
        em = ema_m.iloc[i]
        es = ema_s.iloc[i]

        if pd.isna(ef) or pd.isna(em) or pd.isna(es):
            continue

        uptrend = ef > em > es

        if position == 0 and uptrend:
            # Price pulled back into the zone between mid and slow EMA
            if es < close_i <= em:
                signal.iloc[i] = 1
                position = 1
        elif position == 1:
            if close_i < es:
                position = 0
            else:
                signal.iloc[i] = 1

    return signal


def _generate_signals_breakout(df: pd.DataFrame, params: dict) -> pd.Series:
    """
    N-Day Breakout (Donchian Channel / Turtle Trading style):
    - Buy when price closes above the highest high of the last N days.
    - Exit when price closes below the lowest low of the last N days.
    - Works extremely well on trending indices and commodities.
    """
    period = int(params.get("period", 20))
    exit_period = int(params.get("exit_period", 10))

    signal = pd.Series(0, index=df.index)
    position = 0

    for i in range(period + 1, len(df)):
        close_i = df["close"].iloc[i]
        prior_high = df["high"].iloc[i - period:i].max()
        prior_low = df["low"].iloc[i - exit_period:i].min()

        if position == 0 and close_i > prior_high:
            signal.iloc[i] = 1
            position = 1
        elif position == 1:
            if close_i < prior_low:
                position = 0
            else:
                signal.iloc[i] = 1

    return signal


# ── Trade simulation & metrics (unchanged) ────────────────────────────────────

def _simulate_trades(df: pd.DataFrame, signal: pd.Series, initial_capital: float, commission: float):
    trades = []
    equity_curve = []
    capital = initial_capital
    position = 0
    entry_price = 0.0
    entry_date = None
    shares = 0.0
    prev_pos = 0

    for i in range(len(df)):
        row = df.iloc[i]
        sig = int(signal.iloc[i])
        date_str = str(row["time"])
        close = float(row["close"])

        if prev_pos != 1 and sig == 1:
            # Enter long from flat or negative signal
            cost = commission
            shares = (capital - cost) / close
            entry_price = close
            entry_date = date_str
            position = 1
            capital -= (shares * close + cost)

        elif prev_pos == 1 and sig != 1 and shares > 0 and entry_price > 0:
            # Exit long only if we actually have a position
            proceeds = shares * close - commission
            pnl = proceeds - (shares * entry_price)
            pnl_pct = (close - entry_price) / entry_price * 100
            capital += proceeds
            trades.append({
                "entry_date": entry_date,
                "exit_date": date_str,
                "entry_price": round(entry_price, 4),
                "exit_price": round(close, 4),
                "side": "long",
                "pnl": round(pnl, 2),
                "pnl_pct": round(pnl_pct, 4),
                "return_pct": round(pnl_pct, 4),
            })
            shares = 0.0
            position = 0

        prev_pos = sig

        portfolio_value = capital + shares * close if position == 1 else capital
        equity_curve.append({"time": date_str, "value": round(portfolio_value, 2)})

    if position == 1 and len(df) > 0 and shares > 0 and entry_price > 0:
        close = float(df.iloc[-1]["close"])
        date_str = str(df.iloc[-1]["time"])
        proceeds = shares * close - commission
        pnl = proceeds - (shares * entry_price)
        pnl_pct = (close - entry_price) / entry_price * 100
        capital += proceeds
        trades.append({
            "entry_date": entry_date,
            "exit_date": date_str,
            "entry_price": round(entry_price, 4),
            "exit_price": round(close, 4),
            "side": "long",
            "pnl": round(pnl, 2),
            "pnl_pct": round(pnl_pct, 4),
            "return_pct": round(pnl_pct, 4),
        })

    return trades, equity_curve


def _compute_metrics(trades: list, equity_curve: list, initial_capital: float, df: pd.DataFrame):
    if not equity_curve:
        return {}, []

    values = [e["value"] for e in equity_curve]
    final_value = values[-1]
    total_return_pct = (final_value - initial_capital) / initial_capital * 100

    days = len(equity_curve)
    years = days / 252
    cagr = ((final_value / initial_capital) ** (1 / years) - 1) * 100 if years > 0 and final_value > 0 else 0.0

    equity_series = pd.Series(values)
    daily_returns = equity_series.pct_change().dropna()

    risk_free_daily = 0.05 / 252
    excess_returns = daily_returns - risk_free_daily
    sharpe = (excess_returns.mean() / daily_returns.std()) * np.sqrt(252) if daily_returns.std() > 0 else 0.0

    downside = daily_returns[daily_returns < risk_free_daily]
    sortino = (excess_returns.mean() / downside.std()) * np.sqrt(252) if len(downside) > 0 and downside.std() > 0 else 0.0

    running_max = equity_series.cummax()
    drawdown = (equity_series - running_max) / running_max * 100
    max_drawdown_pct = float(drawdown.min())

    drawdown_curve = [
        {"time": equity_curve[i]["time"], "value": round(float(drawdown.iloc[i]), 4)}
        for i in range(len(drawdown))
    ]

    in_drawdown = False
    dd_start = 0
    max_dd_duration = 0
    for i in range(len(drawdown)):
        if drawdown.iloc[i] < 0:
            if not in_drawdown:
                in_drawdown = True
                dd_start = i
        else:
            if in_drawdown:
                max_dd_duration = max(max_dd_duration, i - dd_start)
                in_drawdown = False
    if in_drawdown:
        max_dd_duration = max(max_dd_duration, len(drawdown) - dd_start)

    total_trades = len(trades)
    winning = [t for t in trades if t["pnl"] > 0]
    losing = [t for t in trades if t["pnl"] <= 0]
    num_wins = len(winning)
    num_losses = len(losing)
    win_rate = (num_wins / total_trades * 100) if total_trades > 0 else 0.0

    gross_profit = sum(t["pnl"] for t in winning) if winning else 0
    gross_loss = abs(sum(t["pnl"] for t in losing)) if losing else 0
    profit_factor = (gross_profit / gross_loss) if gross_loss > 0 else 999.0

    avg_win_pct = sum(t["return_pct"] for t in winning) / num_wins if num_wins > 0 else 0.0
    avg_loss_pct = sum(t["return_pct"] for t in losing) / num_losses if num_losses > 0 else 0.0

    exposure_pct = (total_trades * 5 / days * 100) if days > 0 else 0.0

    return {
        "total_return_pct": round(total_return_pct, 4),
        "cagr": round(cagr, 4),
        "sharpe_ratio": round(float(sharpe), 4),
        "sortino_ratio": round(float(sortino), 4),
        "max_drawdown_pct": round(max_drawdown_pct, 4),
        "max_drawdown_duration_days": int(max_dd_duration),
        "win_rate": round(win_rate, 4),
        "profit_factor": round(float(profit_factor), 4),
        "avg_win_pct": round(avg_win_pct, 4),
        "avg_loss_pct": round(avg_loss_pct, 4),
        "total_trades": total_trades,
        "winning_trades": num_wins,
        "losing_trades": num_losses,
        "exposure_pct": round(exposure_pct, 2),
        "final_capital": round(final_value, 2),
        "initial_capital": round(initial_capital, 2),
    }, drawdown_curve


def run_backtest(df: pd.DataFrame, strategy_type: str, params: dict, initial_capital: float, commission: float) -> dict:
    strategy_map = {
        "sma_crossover": _generate_signals_sma_crossover,
        "ema_crossover": _generate_signals_ema_crossover,
        "rsi_oversold": _generate_signals_rsi_oversold,
        "macd": _generate_signals_macd,
        "bollinger_bands": _generate_signals_bollinger_bands,
        "ict_order_block": _generate_signals_ict_order_block,
        "ict_fvg": _generate_signals_ict_fvg,
        "ema_pullback": _generate_signals_ema_pullback,
        "breakout": _generate_signals_breakout,
    }

    if strategy_type not in strategy_map:
        raise ValueError(f"Unknown strategy: {strategy_type}")

    signal = strategy_map[strategy_type](df, params)
    trades, equity_curve = _simulate_trades(df, signal, initial_capital, commission)
    metrics, drawdown_curve = _compute_metrics(trades, equity_curve, initial_capital, df)

    return {
        "trades": trades,
        "metrics": metrics,
        "equity_curve": equity_curve,
        "drawdown_curve": drawdown_curve,
    }
