import uuid
from fastapi import APIRouter, HTTPException, Depends
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from pydantic import BaseModel

router = APIRouter()
security = HTTPBearer()

# Hardcoded demo accounts  {email: {password, id, token}}
DEMO_USERS = {
    "demo@alphatest.com":    {"password": "demo1234",   "id": "uid-001"},
    "trader@alphatest.com":  {"password": "trader123",  "id": "uid-002"},
    "admin@alphatest.com":   {"password": "admin123",   "id": "uid-003"},
}

# token -> user lookup (built at startup + on signup)
TOKENS: dict = {
    "token-uid-001": {"id": "uid-001", "email": "demo@alphatest.com"},
    "token-uid-002": {"id": "uid-002", "email": "trader@alphatest.com"},
    "token-uid-003": {"id": "uid-003", "email": "admin@alphatest.com"},
}


class SignupRequest(BaseModel):
    email: str
    password: str


class LoginRequest(BaseModel):
    email: str
    password: str


@router.post("/login")
def login(req: LoginRequest):
    email = req.email.strip().lower()
    user = DEMO_USERS.get(email)
    if not user or user["password"] != req.password:
        raise HTTPException(status_code=401, detail="Invalid email or password")
    token = f"token-{user['id']}"
    return {
        "access_token": token,
        "token_type": "bearer",
        "user": {"id": user["id"], "email": email},
    }


@router.post("/signup")
def signup(req: SignupRequest):
    email = req.email.strip().lower()
    if email in DEMO_USERS:
        raise HTTPException(status_code=400, detail="Email already registered")
    new_id = str(uuid.uuid4())
    token = f"token-{new_id}"
    DEMO_USERS[email] = {"password": req.password, "id": new_id}
    TOKENS[token] = {"id": new_id, "email": email}
    return {
        "access_token": token,
        "token_type": "bearer",
        "user": {"id": new_id, "email": email},
    }


@router.get("/me")
def get_me(credentials: HTTPAuthorizationCredentials = Depends(security)):
    user = TOKENS.get(credentials.credentials)
    if not user:
        raise HTTPException(status_code=401, detail="Invalid token")
    return user
