from fastapi import APIRouter, HTTPException, Query
import yfinance as yf

router = APIRouter()

_cache: dict = {}

POPULAR_SYMBOLS = [
    "NQ=F", "ES=F", "GC=F",
    "AAPL", "MSFT", "GOOGL", "TSLA", "SPY",
    "QQQ", "AMZN", "META", "NVDA", "AMD"
]


def _fetch_yf(symbol: str, from_date: str, to_date: str) -> list:
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


@router.get("/symbols")
def get_symbols():
    return {"symbols": POPULAR_SYMBOLS}


@router.get("/ohlcv")
def get_ohlcv(
    symbol: str = Query(...),
    from_date: str = Query(..., alias="from"),
    to_date: str = Query(..., alias="to"),
):
    cache_key = f"{symbol.upper()}_{from_date}_{to_date}"
    if cache_key in _cache:
        return {"symbol": symbol.upper(), "data": _cache[cache_key]}
    results = _fetch_yf(symbol, from_date, to_date)
    _cache[cache_key] = results
    return {"symbol": symbol.upper(), "data": results}
