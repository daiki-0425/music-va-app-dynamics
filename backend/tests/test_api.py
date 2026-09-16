import wave
from concurrent.futures import ThreadPoolExecutor
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient

from app import db
from app import main


@pytest.fixture()
def setup(tmp_path, monkeypatch):
    monkeypatch.setattr(db, 'DB_PATH', tmp_path / 'test.sqlite3')
    music = tmp_path / 'music'
    music.mkdir()
    monkeypatch.setattr(main, 'MUSIC_DIR', music)
    with wave.open(str(music / 'tone.wav'), 'w') as audio:
        audio.setnchannels(1)
        audio.setsampwidth(2)
        audio.setframerate(8000)
        audio.writeframes(b'\x00\x00' * 8000)
    with TestClient(main.app) as client:
        track = str(uuid4())
        with db.connect() as conn:
            conn.execute('INSERT INTO tracks VALUES (?, ?, ?, ?)', (track, 'tone.wav', 'Test tone', 1.0))
        yield client, track


def register(client, username='listener'):
    return client.post('/api/auth/register', json={'username': username, 'password': 'long-password'})


def payload(track):
    return {'id': str(uuid4()), 'track_id': track, 'duration': 1.0, 'samples': [
        {'time_ms': i * 500, 'observed_time_ms': i * 500 + 12, 'valence': -9.99, 'arousal': 10}
        for i in range(2)]}


def test_identity_across_pcs_and_logout(setup):
    client, _ = setup
    first = register(client, 'Listener')
    assert first.status_code == 201
    assert register(client, 'listener').status_code == 409
    with TestClient(main.app) as other_pc:
        result = other_pc.post('/api/auth/login', json={'username': 'LISTENER', 'password': 'long-password'})
        assert result.json()['id'] == first.json()['id']
        assert other_pc.get('/api/auth/me').json() == first.json()
        assert other_pc.post('/api/auth/logout').status_code == 204
        assert other_pc.get('/api/tracks').status_code == 401
    assert client.get('/api/tracks').status_code == 200
    with db.connect() as conn:
        assert conn.execute('SELECT password_hash FROM users').fetchone()[0].startswith('$argon2')


def test_save_exact_values_retry_history_and_isolation(setup):
    client, track = setup
    register(client)
    data = payload(track)
    assert client.post('/api/annotations', json=data).status_code == 201
    assert client.post('/api/annotations', json=data).status_code == 201
    assert client.get('/api/tracks').json()[0]['evaluations'] == 1
    with db.connect() as conn:
        assert conn.execute('SELECT count(*) FROM samples').fetchone()[0] == 2
        row = conn.execute('SELECT valence, arousal FROM samples LIMIT 1').fetchone()
        assert tuple(row) == (-999, 1000)
    data['id'] = str(uuid4())
    assert client.post('/api/annotations', json=data).status_code == 201
    assert client.get('/api/tracks').json()[0]['evaluations'] == 2
    register(client, 'other')
    assert client.get('/api/tracks').json()[0]['evaluations'] == 0
    assert client.post('/api/annotations', json=data).status_code == 409


@pytest.mark.parametrize('change', [
    lambda p: p['samples'][0].update(valence=10.01),
    lambda p: p['samples'][0].update(arousal=.001),
    lambda p: p['samples'][1].update(time_ms=499),
    lambda p: p['samples'][1].update(observed_time_ms=800),
    lambda p: p['samples'][1].update(observed_time_ms=400),
    lambda p: p['samples'].pop(),
    lambda p: p.update(duration=10),
])
def test_reject_invalid_samples_atomically(setup, change):
    client, track = setup
    register(client)
    data = payload(track)
    change(data)
    assert client.post('/api/annotations', json=data).status_code == 422
    assert client.get('/api/tracks').json()[0]['evaluations'] == 0


def test_auth_audio_range_origin_and_paths(setup):
    client, track = setup
    assert client.get(f'/api/tracks/{track}/audio').status_code == 401
    assert client.post('/api/annotations', json=payload(track)).status_code == 401
    assert client.post('/api/auth/register', headers={'Origin': 'https://evil.example'},
                       json={'username': 'test', 'password': 'password'}).status_code == 403
    register(client)
    response = client.get(f'/api/tracks/{track}/audio', headers={'Range': 'bytes=0-43'})
    assert response.status_code == 206
    assert len(response.content) == 44
    assert client.post('/api/auth/login', json={'username': 'listener', 'password': 'wrong-pass'}).status_code == 401
    with db.connect() as conn:
        conn.execute('UPDATE tracks SET path=? WHERE id=?', ('../test.sqlite3', track))
    assert client.get(f'/api/tracks/{track}/audio').status_code == 404


def test_concurrent_saves(setup):
    client, track = setup
    register(client)
    cookie = dict(client.cookies)
    data = payload(track)
    def save(_):
        with TestClient(main.app) as pc:
            pc.cookies.update(cookie)
            return pc.post('/api/annotations', json=data).status_code
    with ThreadPoolExecutor(max_workers=3) as pool:
        assert list(pool.map(save, range(3))) == [201] * 3
    assert client.get('/api/tracks').json()[0]['evaluations'] == 1


def test_import_is_repeatable(setup, monkeypatch):
    _, _track = setup
    from app import import_tracks
    monkeypatch.setattr(import_tracks, 'MUSIC_DIR', main.MUSIC_DIR)
    monkeypatch.setattr('sys.argv', ['import_tracks'])
    import_tracks.main()
    import_tracks.main()
    with db.connect() as conn:
        assert conn.execute('SELECT count(*) FROM tracks').fetchone()[0] == 1
