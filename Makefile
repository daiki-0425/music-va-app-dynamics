.PHONY: setup dev build serve import-tracks db test

setup:
	python3 -m venv .venv
	.venv/bin/pip install -r backend/requirements.lock
	npm --prefix frontend ci
	@test -f .env || cp .env.example .env

dev:
	./scripts/dev.sh

build:
	npm --prefix frontend run build

serve: build
	.venv/bin/uvicorn app.main:app --app-dir backend --host 0.0.0.0 --port 8000 --env-file .env

import-tracks:
	cd backend && ../.venv/bin/python -m dotenv -f ../.env run -- ../.venv/bin/python -m app.import_tracks

db:
	.venv/bin/sqlite_web backend/data/annotations.sqlite3 --host 127.0.0.1 --port 8080 --no-browser --read-only

test:
	cd backend && ../.venv/bin/python -m pytest -q
	npm --prefix frontend run build
