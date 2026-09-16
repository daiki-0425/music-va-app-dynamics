# VA Studio — 音楽感情アノテーション

音楽を聴きながらValence–Arousal（VA）平面の点を動かし、**2 Hz（0.5秒間隔）**で評価を記録するWebアプリです。FastAPI + React + SQLiteで構成し、sqlite-webからデータを確認できます。

## 機能

- アカウント作成・ログイン。サーバー発行の評価者UUIDで識別し、別PCでも同じアカウントの進捗を共有
- 1,100曲を想定した楽曲一覧、曲名検索、未評価／評価済みフィルター
- 横軸Valence、縦軸Arousal。どちらも **−10.00〜+10.00、0.01刻み**
- マウス／タッチのドラッグ、矢印キー（0.01）、Shift + 矢印（0.1）、数値入力による操作
- 音源の再生位置を基準に記録。一時停止中は記録せず、タブを隠すと自動一時停止
- 最後まで再生後、**「保存して次へ」**で一括保存し、次の未評価曲へ移動
- 再評価は別の履歴として保持。通信失敗後の再送は同じ評価IDを使用し、二重保存を防止
- パスワードのArgon2ハッシュ化、HttpOnly Cookieによる7日間のセッション

## 必要な環境

- Python 3.12以上
- Node.js 22.12以上（Node.js 24で動作確認）
- npm、GNU Make、Bash（Linux / macOS / WSL）

## クイックスタート

```bash
make setup
# 音源を backend/music/ にコピー（サブフォルダも可）
make import-tracks
make dev
```

ブラウザーで **http://localhost:5173** を開き、アカウントを作成してください。
FastAPIのAPI仕様は http://localhost:8000/docs で確認できます。
`Ctrl+C`で開発サーバーを停止します。
d
### 楽曲の登録

`backend/music/`に音源を配置し、`make import-tracks`を実行します。MP3 / WAV / FLAC / OGG / M4A / OPUSのメタデータに対応し、サブフォルダも再帰的に読み込みます。**実際に再生できる形式・コーデックはブラウザーに依存するため、利用するブラウザーで事前確認してください。** 曲名は拡張子を除いたファイル名です。

登録処理を再実行しても、同じ相対パスの楽曲IDや評価は変更しません。評価開始後は音源の中身・名前・配置を変更しないでください。読み取れないファイルは理由付きでスキップされ、最後に登録件数が表示されます。1,100曲の場合は登録件数が想定どおりか確認してください。音源はこのリポジトリには付属しません。

外部の音源フォルダやDBを使用する場合は `.env` に絶対パスを指定します。

```dotenv
VA_MUSIC_DIR=/absolute/path/to/music
VA_DB_PATH=/absolute/path/to/annotations.sqlite3
VA_SECURE_COOKIE=0
```

### 別PCからアクセスする

**音源とDBは1台のサーバーPCに集約**し、評価用PCはブラウザーから同じサーバーにアクセスします。それぞれのPCで別々のDBを作成すると進捗を共有できません。

通常利用ではReactをビルドしてFastAPIから配信します。

```bash
make serve
```

評価用PCで `http://<サーバーPCのIPアドレス>:8000` を開きます。同じLAN内で接続し、サーバーのファイアウォールで必要なPCからの8000番ポートへのアクセスを許可してください。開発中は `make dev` の5173番ポートでもアクセスできます。

同じ人はPCを変えても**同じユーザー名とパスワード**でログインしてください。ユーザー名は大文字・小文字を区別せず一意です。評価者・楽曲・評価のIDはUUIDです。複数PCからの同時保存はSQLiteのWALモードとトランザクションで処理します。同じアカウントで同じ曲を別PCから評価すると、それぞれ独立した評価履歴として残ります。

インターネットに公開する場合はHTTPSのリバースプロキシを設置して `VA_SECURE_COOKIE=1` とし、ログイン／登録へのレート制限を追加してください。初期版は管理されたLANでの利用を想定しています。自己登録制のため、一人が複数アカウントを作ることは防止していません。

## 評価の操作と記録仕様

1. 楽曲一覧で任意の曲を選びます。再評価も可能です。
2. 点の初期位置は `(0.00, 0.00)` です。必要なら再生前に変更します。
3. 再生し、音楽の印象に応じて点を動かします。動かさない間は現在の値を記録します。
4. 最後まで聴くと「保存して次へ」が有効になります。押すと評価全体が保存されます。

- 目標時刻は `0, 500, 1000, … ms`（曲の長さ未満）。サンプル数は `ceil(再生時間 × 2)` です。
- ブラウザーの描画タイミングで音源の再生位置を観測します。OSやブラウザーによる遅れがあるため、厳密な実時間の2 Hzを保証するハードウェア計測ではありません。目標時刻と実際の観測時刻を両方保存します。
- 観測が目標より250 msを超えて遅れた場合は停止し、やり直しを求めます。欠測を過去の値で埋めて保存しません。
- シーク・再生速度変更は提供しません。一時停止からの再開、最初からのやり直しが可能です。
- 保存するまで評価はブラウザーのメモリー上にあります。曲の切替・ログアウト・ページ離脱時は未保存の評価について確認します。ブラウザーの強制終了や端末障害では復元できません。
- 保存失敗時は記録を保持するので再試行してください。セッション期限が切れた場合、別タブで同じアカウントに再ログインしてから元のタブで再試行できます。
- 曲の長さは音源メタデータとブラウザーで検証します。冒頭／末尾の扱いはコーデックに依存します。

## DBの閲覧・エクスポート

一度アプリを起動するか楽曲を登録すると、`backend/data/annotations.sqlite3` が作成されます。

```bash
make db
```

**http://127.0.0.1:8080** でsqlite-webを開きます。誤操作を防ぐため読み取り専用・サーバーPC内のみの公開です。カスタムDBパスの場合は次のように指定してください。

```bash
.venv/bin/sqlite_web /absolute/path/to/annotations.sqlite3 --host 127.0.0.1 --port 8080 --no-browser --read-only
```

| テーブル | 内容 |
| --- | --- |
| `users` | 評価者UUID・一意のユーザー名・パスワードハッシュ |
| `sessions` | セッショントークンのハッシュ・有効期限 |
| `tracks` | 楽曲UUID・相対パス・曲名・秒数 |
| `annotations` | 評価UUID・評価者UUID・楽曲UUID・秒数・保存日時（UTC） |
| `samples` | 評価UUID・連番・目標時刻・観測時刻・VA値 |

**`samples.valence` と `samples.arousal` は100倍した整数です**（例：−9.99 → −999）。浮動小数点による保存誤差を避けています。APIと画面では通常の−10〜10の値を使用します。

sqlite-webのSQL画面では、例えば次のクエリで解析用データを取得できます。クエリ結果はsqlite-webのエクスポート機能からCSVとして出力できます。

```sql
SELECT a.id AS annotation_id, a.user_id, t.id AS track_id, t.title,
       a.created_at, s.sample_index, s.time_ms, s.observed_time_ms,
       s.valence / 100.0 AS valence, s.arousal / 100.0 AS arousal
FROM samples s
JOIN annotations a ON a.id = s.annotation_id
JOIN tracks t ON t.id = a.track_id
ORDER BY a.created_at, a.id, s.sample_index;
```

DBには評価者情報も含まれます。バックアップにはSQLiteのbackup機能を使用するか、アプリとsqlite-webを停止してからDB関連ファイルをコピーしてください。稼働中に `.sqlite3` だけをコピーするとWAL内の最新データを取りこぼすことがあります。

## 開発・テスト

```bash
make test       # APIテスト + TypeScript型検査 + フロントエンドビルド
make build      # フロントエンドのみビルド

# ブラウザーによる一連の操作のテスト（初回のみChromiumをインストール）
cd frontend
npx playwright install chromium
npm run test:e2e
```

APIテストでは別PCのログイン、ユーザー名の重複、値域・0.01刻み・時刻の検証、保存の原子性、再送・同時保存、ユーザー間の分離、音源認証・範囲リクエスト、インポートの再実行を確認します。テストは一時DBを使用し、本番データを変更しません。ブラウザーテストでは短いWAV音源を一時生成し、登録・再生・一時停止・2Hz記録・保存・別ブラウザーでの進捗共有・モバイル幅の表示を確認します。GitHub ActionsでもAPI・ビルド・ブラウザーテストを実行します。

`npm --prefix frontend run format` でフロントエンドを整形できます。

```text
backend/
  app/                FastAPI・DB定義・音源登録CLI
  tests/              APIテスト
  data/               SQLite DB（Git対象外）
  music/              音源（Git対象外）
  requirements.txt    Python依存の範囲
  requirements.lock   動作確認済みPython依存
frontend/
  src/                React / TypeScript / CSS
  package-lock.json   npm依存の固定
scripts/dev.sh        開発サーバー起動
.env.example          環境設定例
Makefile              セットアップ・実行コマンド
```

UIは日本語です。Google Fontsが使えない環境では端末のフォントにフォールバックします。

## Gitへの登録

音源、DBとWALファイル、`.env`、仮想環境、`node_modules`、ビルド成果物は `.gitignore` で除外しています。`requirements.lock` と `package-lock.json` はコミットし、環境を再現できるようにします。ライセンスは未設定です。公開する場合は必要なライセンスを選んでください。

```bash
git init
git add .
git diff --cached --stat  # 音源・DB・秘密情報が入っていないことを確認
git commit -m "Add music VA annotation app"
# 作成済みのリモートリポジトリを指定してpush
# git remote add origin <repository-url>
# git push -u origin HEAD
```

## 参考

- [FastAPIの認証・パスワードハッシュ](https://fastapi.tiangolo.com/tutorial/security/oauth2-jwt/)
- [Viteのセットアップ](https://vite.dev/guide/)
- [sqlite-webの起動オプション](https://github.com/coleifer/sqlite-web)
