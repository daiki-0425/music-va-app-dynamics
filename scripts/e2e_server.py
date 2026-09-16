"""Start an isolated API with short audio fixtures. Never touches the user's DB."""
import os
import sys
import tempfile
import wave
from pathlib import Path
from uuid import uuid4

import uvicorn

with tempfile.TemporaryDirectory(prefix='va-e2e-') as directory:
    root = Path(directory)
    os.environ['VA_DB_PATH'] = str(root / 'test.sqlite3')
    os.environ['VA_MUSIC_DIR'] = str(root)
    sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'backend'))
    from app.db import connect, init_db
    init_db()
    for title in ['01 Test Song', '02 Next Song']:
        path = root / f'{title}.wav'
        with wave.open(str(path), 'w') as audio:
            audio.setnchannels(1)
            audio.setsampwidth(2)
            audio.setframerate(8000)
            audio.writeframes(b'\x00\x00' * 8000 * 4)
        with connect() as db:
            db.execute('INSERT INTO tracks VALUES (?, ?, ?, ?)', (str(uuid4()), path.name, title, 4.0))
    uvicorn.run('app.main:app', host='127.0.0.1', port=8011)
