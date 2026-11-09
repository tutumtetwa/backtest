# AlphaTest: Strategy Backtesting Platform

**Live:** https://alphatest-olive.vercel.app (click **Try the demo account**)

Backtest trading strategies on real historical market data, then replay them bar by bar to see every entry and exit.

## Features
- **Strategy library:** SMA/EMA crossovers, RSI mean reversion, MACD momentum, Bollinger Bands and ICT order blocks, each with tunable parameters
- **Results dashboard:** equity curve, drawdown, win rate, profit factor, Sharpe ratio and a full trade log
- **Replay mode:** step through price action candle by candle, with trades plotted on the chart
- **Real data:** OHLCV from Yahoo Finance, cached per request window

## Architecture
```
frontend/  React 18 + TypeScript + Vite + Tailwind + Zustand   → Vercel (static)
backend/   FastAPI + pandas/numpy backtest engine              → Vercel Python function
```
The frontend talks to the API at `VITE_API_URL`. Auth uses signed, expiring JWTs (HS256) with PBKDF2-hashed passwords. Demo accounts live in memory and aren't saved.

## Run locally
```bash
# API
cd backend && pip install -r requirements.txt && uvicorn main:app --reload   # :8000
# Web
cd frontend && npm install && VITE_API_URL=http://localhost:8000 npm run dev   # :5173
```
Set `JWT_SECRET` in production. Without it, a random secret is generated at startup.
