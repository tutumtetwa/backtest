"""Demo authentication.

AlphaTest is a portfolio demo, so accounts live in memory and are not persisted.
Tokens are signed, expiring JWTs, so they cannot be guessed or forged and they
verify on any server instance without shared state.
"""
import hashlib
import hmac
import os
import secrets
import uuid
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError, jwt
from pydantic import BaseModel, Field

router = APIRouter()
security = HTTPBearer()

JWT_SECRET = os.getenv("JWT_SECRET") or secrets.token_urlsafe(32)
JWT_ALG = "HS256"
TOKEN_TTL = timedelta(hours=12)

DEMO_EMAIL = "demo@alphatest.com"
DEMO_PASSWORD = "demo1234"  # published on the login page on purpose


def _hash(password: str, salt: bytes) -> bytes:
    return hashlib.pbkdf2_hmac("sha256", password.encode(), salt, 200_000)


def _new_user(password: str) -> dict:
    salt = secrets.token_bytes(16)
    return {"id": str(uuid.uuid4()), "salt": salt, "hash": _hash(password, salt)}


USERS: dict = {DEMO_EMAIL: {**_new_user(DEMO_PASSWORD), "id": "uid-demo"}}


def _issue(user_id: str, email: str) -> str:
    now = datetime.now(timezone.utc)
    return jwt.encode(
        {"sub": user_id, "email": email, "iat": now, "exp": now + TOKEN_TTL},
        JWT_SECRET,
        algorithm=JWT_ALG,
    )


class Credentials(BaseModel):
    email: str = Field(min_length=3, max_length=254)
    password: str = Field(min_length=6, max_length=128)


def _session(user: dict, email: str) -> dict:
    return {
        "access_token": _issue(user["id"], email),
        "token_type": "bearer",
        "user": {"id": user["id"], "email": email},
    }


@router.post("/login")
def login(req: Credentials):
    email = req.email.strip().lower()
    user = USERS.get(email)
    if not user or not hmac.compare_digest(user["hash"], _hash(req.password, user["salt"])):
        raise HTTPException(status_code=401, detail="Invalid email or password")
    return _session(user, email)


@router.post("/signup")
def signup(req: Credentials):
    email = req.email.strip().lower()
    if "@" not in email:
        raise HTTPException(status_code=422, detail="Enter a valid email address")
    if email in USERS:
        raise HTTPException(status_code=400, detail="Email already registered")
    if len(USERS) > 5000:
        raise HTTPException(status_code=503, detail="Demo is full, use the demo account")
    user = _new_user(req.password)
    USERS[email] = user
    return _session(user, email)


def current_user(credentials: HTTPAuthorizationCredentials = Depends(security)) -> dict:
    try:
        payload = jwt.decode(credentials.credentials, JWT_SECRET, algorithms=[JWT_ALG])
    except JWTError:
        raise HTTPException(status_code=401, detail="Invalid or expired token")
    return {"id": payload["sub"], "email": payload["email"]}


@router.get("/me")
def get_me(user: dict = Depends(current_user)):
    return user
