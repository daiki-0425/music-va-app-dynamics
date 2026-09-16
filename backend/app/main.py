import hashlib
import math
import os
import secrets
import sqlite3
import time
from contextlib import asynccontextmanager
from decimal import Decimal
from pathlib import Path
from typing import Annotated
from uuid import UUID, uuid4

from fastapi import Cookie, Depends, FastAPI, HTTPException, Request, Response
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pwdlib import PasswordHash
from pydantic import BaseModel, Field, field_validator

from .db import MUSIC_DIR, connect, init_db

passwords = PasswordHash.recommended()
DUMMY_HASH = passwords.hash("dummy-password-for-timing")
COOKIE = "va_session"
SESSION_SECONDS = 60 * 60 * 24 * 7


@asynccontextmanager
async def lifespan(app):
    init_db()
    yield


app = FastAPI(title="Music VA Annotation", lifespan=lifespan)


@app.middleware("http")
async def protect_origin(request: Request, call_next):
    # Browser writes must originate from this host (also works through Vite's proxy).
    if request.method in {"POST", "PUT", "PATCH", "DELETE"}:
        origin = request.headers.get("origin")
        if origin and origin != f"{request.url.scheme}://{request.headers.get('host')}":
            return Response("Origin is not allowed", status_code=403)
    response = await call_next(request)
    if request.url.path.startswith("/api/"):
        response.headers["Cache-Control"] = "no-store"
    response.headers["X-Content-Type-Options"] = "nosniff"
    return response


class Credentials(BaseModel):
    username: str = Field(min_length=3, max_length=40, pattern=r"^[a-zA-Z0-9_.-]+$")
    password: str = Field(min_length=8, max_length=128)

    @field_validator("username")
    @classmethod
    def normalize(cls, value):
        return value.lower()


def session_digest(token):
    return hashlib.sha256(token.encode()).hexdigest()


def set_session(response, user_id):
    token = secrets.token_urlsafe(32)
    with connect() as db:
        db.execute("DELETE FROM sessions WHERE expires_at < ?", (time.time(),))
        db.execute("INSERT INTO sessions VALUES (?, ?, ?)",
                   (session_digest(token), user_id, time.time() + SESSION_SECONDS))
    response.set_cookie(COOKIE, token, httponly=True, samesite="strict",
                        secure=os.environ.get("VA_SECURE_COOKIE") == "1", max_age=SESSION_SECONDS)


def current_user(va_session: Annotated[str | None, Cookie()] = None):
    if va_session:
        with connect() as db:
            user = db.execute("""SELECT u.id, u.username FROM users u JOIN sessions s
                ON s.user_id=u.id WHERE s.token_hash=? AND s.expires_at>?""",
                (session_digest(va_session), time.time())).fetchone()
        if user:
            return dict(user)
    raise HTTPException(401, "ログインしてください。")


User = Annotated[dict, Depends(current_user)]


@app.post("/api/auth/register", status_code=201)
def register(body: Credentials, response: Response):
    user = {"id": str(uuid4()), "username": body.username}
    encoded = passwords.hash(body.password)
    try:
        with connect() as db:
            db.execute("INSERT INTO users (id, username, password_hash) VALUES (?, ?, ?)",
                       (user["id"], user["username"], encoded))
    except sqlite3.IntegrityError:
        raise HTTPException(409, "そのユーザー名は登録済みです。別PCでは既存のアカウントでログインしてください。")
    set_session(response, user["id"])
    return user


@app.post("/api/auth/login")
def login(body: Credentials, response: Response):
    with connect() as db:
        row = db.execute("SELECT * FROM users WHERE username=?", (body.username,)).fetchone()
    valid = passwords.verify(body.password, row["password_hash"] if row else DUMMY_HASH)
    if not row or not valid:
        raise HTTPException(401, "ユーザー名またはパスワードが正しくありません。")
    set_session(response, row["id"])
    return {"id": row["id"], "username": row["username"]}


@app.get("/api/auth/me")
def me(user: User):
    return user


@app.post("/api/auth/logout", status_code=204)
def logout(response: Response, va_session: Annotated[str | None, Cookie()] = None):
    if va_session:
        with connect() as db:
            db.execute("DELETE FROM sessions WHERE token_hash=?", (session_digest(va_session),))
    response.delete_cookie(COOKIE)


@app.get("/api/tracks")
def tracks(user: User):
    with connect() as db:
        rows = db.execute("""SELECT t.id, t.title, t.duration,
            (SELECT count(*) FROM annotations a WHERE a.track_id=t.id AND a.user_id=?) AS evaluations
            FROM tracks t ORDER BY t.title COLLATE NOCASE, t.id""", (user["id"],)).fetchall()
    return [dict(row) for row in rows]


@app.get("/api/tracks/{track_id}/audio")
def audio(track_id: str, user: User):
    with connect() as db:
        row = db.execute("SELECT path FROM tracks WHERE id=?", (track_id,)).fetchone()
    if not row:
        raise HTTPException(404, "楽曲が見つかりません。")
    path = (MUSIC_DIR / row["path"]).resolve()
    if not path.is_relative_to(MUSIC_DIR) or not path.is_file():
        raise HTTPException(404, "音源ファイルが見つかりません。管理者に連絡してください。")
    return FileResponse(path)


class Sample(BaseModel):
    time_ms: int = Field(ge=0, strict=True)
    observed_time_ms: int = Field(ge=0, strict=True)
    valence: Decimal = Field(ge=-10, le=10, decimal_places=2, allow_inf_nan=False)
    arousal: Decimal = Field(ge=-10, le=10, decimal_places=2, allow_inf_nan=False)


class Evaluation(BaseModel):
    id: UUID
    track_id: UUID
    duration: float = Field(gt=0, le=86400, allow_inf_nan=False)
    samples: list[Sample] = Field(min_length=1, max_length=172800)


@app.post("/api/annotations", status_code=201)
def save(body: Evaluation, user: User):
    with connect() as db:
        db.execute("BEGIN IMMEDIATE")
        old = db.execute("SELECT user_id, track_id FROM annotations WHERE id=?", (str(body.id),)).fetchone()
        if old:
            if old["user_id"] != user["id"] or old["track_id"] != str(body.track_id):
                raise HTTPException(409, "記録IDが競合しました。")
            return {"id": str(body.id), "saved": True}
        track = db.execute("SELECT duration FROM tracks WHERE id=?", (str(body.track_id),)).fetchone()
        if not track:
            raise HTTPException(404, "楽曲が見つかりません。")
        if abs(track["duration"] - body.duration) > max(1, track["duration"] * .01):
            raise HTTPException(422, "音源の長さが登録情報と一致しません。")
        expected = math.ceil(body.duration * 2)
        if len(body.samples) != expected:
            raise HTTPException(422, "曲全体を0.5秒間隔で評価してください。")
        for i, sample in enumerate(body.samples):
            if sample.time_ms != i * 500 or not 0 <= sample.observed_time_ms - sample.time_ms <= 250:
                raise HTTPException(422, "記録の時刻またはサンプリング間隔が不正です。")
        db.execute("INSERT INTO annotations (id, user_id, track_id, duration) VALUES (?, ?, ?, ?)",
                   (str(body.id), user["id"], str(body.track_id), body.duration))
        db.executemany("INSERT INTO samples VALUES (?, ?, ?, ?, ?, ?)", [
            (str(body.id), i, s.time_ms, s.observed_time_ms, int(s.valence * 100), int(s.arousal * 100))
            for i, s in enumerate(body.samples)])
    return {"id": str(body.id), "saved": True}


# A built React app is served from the same host as the API.
DIST = Path(__file__).resolve().parents[2] / "frontend" / "dist"
if DIST.is_dir():
    app.mount("/assets", StaticFiles(directory=DIST / "assets"), name="assets")

    @app.get("/")
    def index():
        return FileResponse(DIST / "index.html")
