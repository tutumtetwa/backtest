import os
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv

load_dotenv()

from routers import auth, data, backtest, replay

app = FastAPI(title="AlphaTest API", version="1.0.0")

origins = [
    "http://localhost:5173",
    "http://localhost:3000",
    "https://backtest-eight.vercel.app",
    os.getenv("FRONTEND_URL", ""),
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router, prefix="/auth", tags=["auth"])
app.include_router(data.router, prefix="/data", tags=["data"])
app.include_router(backtest.router, prefix="/backtest", tags=["backtest"])
app.include_router(replay.router, prefix="/replay", tags=["replay"])


@app.get("/health")
def health_check():
    return {"status": "ok", "version": "1.0.0"}
