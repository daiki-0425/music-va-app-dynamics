import os
import sqlite3
from contextlib import contextmanager
from pathlib import Path

BASE = Path(__file__).resolve().parents[1]
DB_PATH = Path(os.environ.get("VA_DB_PATH", str(BASE / "data" / "annotations.sqlite3"))).resolve()
MUSIC_DIR = Path(os.environ.get("VA_MUSIC_DIR", str(BASE / "music"))).resolve()


@contextmanager
def connect():
    db = sqlite3.connect(DB_PATH, timeout=30)
    db.row_factory = sqlite3.Row
    db.execute("PRAGMA foreign_keys = ON")
    try:
        with db:
            yield db
    finally:
        db.close()


def init_db():
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    with connect() as db:
        db.execute("PRAGMA journal_mode = WAL")
        db.executescript("""
        CREATE TABLE IF NOT EXISTS users (
            id TEXT PRIMARY KEY,
            username TEXT NOT NULL UNIQUE,
            password_hash TEXT NOT NULL,
            created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
        );
        CREATE TABLE IF NOT EXISTS sessions (
            token_hash TEXT PRIMARY KEY,
            user_id TEXT NOT NULL REFERENCES users(id),
            expires_at REAL NOT NULL
        );
        CREATE TABLE IF NOT EXISTS tracks (
            id TEXT PRIMARY KEY,
            path TEXT NOT NULL UNIQUE,
            title TEXT NOT NULL,
            duration REAL NOT NULL CHECK(duration > 0)
        );
        CREATE TABLE IF NOT EXISTS annotations (
            id TEXT PRIMARY KEY,
            user_id TEXT NOT NULL REFERENCES users(id),
            track_id TEXT NOT NULL REFERENCES tracks(id),
            duration REAL NOT NULL,
            created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
        );
        CREATE INDEX IF NOT EXISTS annotation_user_track ON annotations(user_id, track_id);
        CREATE TABLE IF NOT EXISTS samples (
            annotation_id TEXT NOT NULL REFERENCES annotations(id) ON DELETE CASCADE,
            sample_index INTEGER NOT NULL,
            time_ms INTEGER NOT NULL,
            observed_time_ms INTEGER NOT NULL,
            valence INTEGER NOT NULL CHECK(valence BETWEEN -1000 AND 1000),
            arousal INTEGER NOT NULL CHECK(arousal BETWEEN -1000 AND 1000),
            PRIMARY KEY (annotation_id, sample_index)
        );
        """)
