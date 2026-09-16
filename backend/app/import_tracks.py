"""Register audio files without changing existing track IDs or evaluations."""
import argparse
import math
from uuid import uuid4

from mutagen import File

from .db import MUSIC_DIR, connect, init_db


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.parse_args()
    init_db()
    MUSIC_DIR.mkdir(parents=True, exist_ok=True)
    files = sorted(p for p in MUSIC_DIR.rglob("*") if p.suffix.lower() in {".mp3", ".wav", ".flac", ".ogg", ".m4a", ".opus"})
    added = existing = failed = 0
    with connect() as db:
        for path in files:
            if not path.resolve().is_relative_to(MUSIC_DIR):
                print(f"SKIP (outside music directory): {path}")
                failed += 1
                continue
            relative = path.relative_to(MUSIC_DIR).as_posix()
            if db.execute("SELECT 1 FROM tracks WHERE path=?", (relative,)).fetchone():
                existing += 1
                continue
            try:
                audio = File(path)
                duration = float(audio.info.length)
                if not math.isfinite(duration) or not 0 < duration <= 86400:
                    raise ValueError("unsupported duration")
                db.execute("INSERT INTO tracks VALUES (?, ?, ?, ?)",
                           (str(uuid4()), relative, path.stem, duration))
                added += 1
            except Exception as exc:
                print(f"SKIP {relative}: {exc}")
                failed += 1
    print(f"登録: {added} / 登録済み: {existing} / 失敗: {failed}")


if __name__ == "__main__":
    main()
