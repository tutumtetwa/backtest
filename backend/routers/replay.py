import math
import random
import calendar
from datetime import datetime, timedelta
from fastapi import APIRouter, HTTPException, Query
import yfinance as yf

router = APIRouter()


def _simulate_intraday(daily_bar: dict, num_bars: int = 390) -> list:
    o = float(daily_bar["open"])
    h = float(daily_bar["high"])
    l = float(daily_bar["low"])
    c = float(daily_bar["close"])
    v = float(daily_bar["volume"])

    base_dt = datetime.strptime(daily_bar["time"], "%Y-%m-%d").replace(hour=9, minute=30)

    prices = [o]
    high_idx = random.randint(num_bars // 6, num_bars * 2 // 3)
    low_idx = random.randint(num_bars // 6, num_bars * 2 // 3)
    if high_idx == low_idx:
        low_idx = min(low_idx + 30, num_bars - 1)

    volatility = (h - l) / o / math.sqrt(num_bars)
    drift = math.log(c / o) / num_bars

    for i in range(1, num_bars):
        if i == high_idx:
            prices.append(h)
        elif i == low_idx:
            prices.append(l)
        else:
            random_return = random.gauss(drift, volatility)
            price = prices[-1] * math.exp(random_return)
            price = max(l * 0.998, min(h * 1.002, price))
            prices.append(price)

    prices[-1] = c

    bars = []
    vol_per_bar = v / num_bars
    for i in range(num_bars):
        bar_time = base_dt + timedelta(minutes=i)
        p = prices[i]
        noise = p * 0.001
        bar_o = prices[i - 1] if i > 0 else o
        bar_c = p
        bar_h = max(bar_o, bar_c) + abs(random.gauss(0, noise))
        bar_l = min(bar_o, bar_c) - abs(random.gauss(0, noise))
        bar_vol = max(0, random.gauss(vol_per_bar, vol_per_bar * 0.5))
        bars.append({
            "time": calendar.timegm(bar_time.timetuple()),
            "open": round(bar_o, 4),
            "high": round(bar_h, 4),
            "low": round(bar_l, 4),
            "close": round(bar_c, 4),
            "volume": round(bar_vol),
        })

    return bars


@router.get("/session")
def get_replay_session(
    symbol: str = Query(...),
    date: str = Query(...),
    days: int = Query(1, ge=1, le=10),
):
    ticker = yf.Ticker(symbol.upper())

    # Fetch enough history to guarantee `days` trading days ending on/before `date`
    end_dt = datetime.strptime(date, "%Y-%m-%d") + timedelta(days=1)
    start_dt = end_dt - timedelta(days=days * 2 + 10)  # buffer for weekends/holidays

    df = ticker.history(
        start=start_dt.strftime("%Y-%m-%d"),
        end=end_dt.strftime("%Y-%m-%d"),
        interval="1d",
        auto_adjust=True,
    )

    if df.empty:
        raise HTTPException(status_code=404, detail=f"No data found for {symbol}")

    # Take the last `days` rows (most recent trading days up to selected date)
    df = df.tail(days)

    all_bars = []
    sessions = []

    for ts, row in df.iterrows():
        date_str = ts.strftime("%Y-%m-%d")
        daily_bar = {
            "time": date_str,
            "open": round(float(row["Open"]), 4),
            "high": round(float(row["High"]), 4),
            "low": round(float(row["Low"]), 4),
            "close": round(float(row["Close"]), 4),
            "volume": int(row["Volume"]),
        }
        day_bars = _simulate_intraday(daily_bar)
        sessions.append({
            "date": date_str,
            "start_bar": len(all_bars),
            "daily_bar": daily_bar,
        })
        all_bars.extend(day_bars)

    last_session = sessions[-1]

    return {
        "symbol": symbol.upper(),
        "date": last_session["date"],
        "daily_bar": last_session["daily_bar"],
        "bars": all_bars,
        "sessions": sessions,
    }
