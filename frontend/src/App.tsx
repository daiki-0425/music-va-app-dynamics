import { useCallback, useEffect, useRef, useState } from 'react'
import {
  ArrowRight,
  AudioLines,
  Check,
  CheckCircle2,
  ChevronRight,
  Headphones,
  LogOut,
  Music2,
  Pause,
  Play,
  RotateCcw,
  Search,
  UserRound,
} from 'lucide-react'

type User = { id: string; username: string }
type Track = {
  id: string
  title: string
  duration: number
  evaluations: number
}
type Sample = {
  time_ms: number
  observed_time_ms: number
  valence: number
  arousal: number
}
type Point = { valence: number; arousal: number }
async function api<T>(path: string, body?: unknown): Promise<T> {
  const response = await fetch(`/api${path}`, {
    credentials: 'same-origin',
    ...(body === undefined
      ? {}
      : {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        }),
  })
  if (!response.ok) {
    const error = await response.json().catch(() => ({}))
    throw new Error(
      typeof error.detail === 'string'
        ? error.detail
        : '入力内容を確認してください。通信に失敗した場合は再試行してください。',
    )
  }
  return response.status === 204 ? (undefined as T) : response.json()
}
const clock = (seconds: number) =>
  `${Math.floor(seconds / 60)
    .toString()
    .padStart(2, '0')}:${Math.floor(seconds % 60)
    .toString()
    .padStart(2, '0')}`
const quantize = (n: number) =>
  Math.round(Math.max(-10, Math.min(10, n)) * 100) / 100
// crypto.randomUUID is unavailable on LAN HTTP in some browsers.
function newId() {
  const b = crypto.getRandomValues(new Uint8Array(16))
  b[6] = (b[6] & 15) | 64
  b[8] = (b[8] & 63) | 128
  const h = Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('')
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`
}

function ValueInput({
  axis,
  value,
  disabled,
  onChange,
}: {
  axis: string
  value: number
  disabled: boolean
  onChange: (value: number) => void
}) {
  const [draft, setDraft] = useState(value.toFixed(2))
  const focused = useRef(false)
  useEffect(() => {
    if (!focused.current) setDraft(value.toFixed(2))
  }, [value])
  return (
    <input
      id={axis}
      aria-label={axis}
      type="number"
      min={-10}
      max={10}
      step={0.01}
      value={draft}
      disabled={disabled}
      onFocus={() => {
        focused.current = true
      }}
      onBlur={() => {
        focused.current = false
        setDraft(value.toFixed(2))
      }}
      onChange={(e) => {
        setDraft(e.target.value)
        const n = e.target.valueAsNumber
        if (Number.isFinite(n)) onChange(quantize(n))
      }}
    />
  )
}

function Auth({ onLogin }: { onLogin: (u: User) => void }) {
  const [register, setRegister] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  return (
    <div className="auth-page">
      <div className="auth-story">
        <div className="brand">
          <AudioLines /> VA Studio
        </div>
        <span className="eyebrow">MUSIC EMOTION RESEARCH</span>
        <h1>
          音楽の気持ちを、
          <br />
          座標にする。
        </h1>
        <p>
          聴こえてくる音楽が、どんな気持ちを伝えているか。
          <br />
          その瞬間の印象を、ValenceとArousalで記録します。
        </p>
        <div className="auth-art">
          <div className="art-axis horizontal" />
          <div className="art-axis vertical" />
          <span className="art-dot" />
          <span className="art-label">YOUR PERCEPTION, IN MOTION.</span>
        </div>
        <small>CONTINUOUS VA ANNOTATION · 2 Hz</small>
      </div>
      <div className="auth-form">
        <div className="auth-form-inner">
          <span className="eyebrow">WELCOME TO VA STUDIO</span>
          <h2>{register ? '評価者アカウントを作成' : 'おかえりなさい'}</h2>
          <p>あなたのアカウントで評価を始めましょう。</p>
          <form
            onSubmit={async (e) => {
              e.preventDefault()
              setBusy(true)
              setError('')
              const values = new FormData(e.currentTarget)
              try {
                onLogin(
                  await api<User>(
                    `/auth/${register ? 'register' : 'login'}`,
                    Object.fromEntries(values),
                  ),
                )
              } catch (e) {
                setError((e as Error).message)
              } finally {
                setBusy(false)
              }
            }}
          >
            <label>
              ユーザー名
              <input
                name="username"
                autoComplete="username"
                required
                pattern="[a-zA-Z0-9_.\-]{3,40}"
                placeholder="例：listener_001"
              />
            </label>
            <small>
              半角英数字・_・.・-、3〜40文字（大文字と小文字は区別しません）
            </small>
            <label>
              パスワード
              <input
                name="password"
                type="password"
                autoComplete={register ? 'new-password' : 'current-password'}
                required
                minLength={8}
                maxLength={128}
                placeholder="8文字以上"
              />
            </label>
            {error && (
              <p role="alert" className="error">
                {error}
              </p>
            )}
            <button className="primary" disabled={busy}>
              {busy ? '確認中…' : register ? 'アカウントを作成' : 'ログイン'}
              <ArrowRight size={18} />
            </button>
          </form>
          <button
            className="text-button"
            onClick={() => {
              setRegister(!register)
              setError('')
            }}
          >
            {register
              ? 'アカウントをお持ちの方はこちら'
              : '初めての方：アカウントを作成'}
          </button>
          <div className="auth-note">
            <UserRound size={19} />
            <p>
              別のPCでも、同じアカウントをお使いください。
              <br />
              評価の進捗はアカウントに紐づいて保存されます。
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}

export default function App() {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const [tracks, setTracks] = useState<Track[]>([])
  const [selected, setSelected] = useState<Track | null>(null)
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState('all')
  const [notice, setNotice] = useState('')
  const [error, setError] = useState('')
  const [point, setPoint] = useState<Point>({ valence: 0, arousal: 0 })
  const pointRef = useRef(point)
  const audio = useRef<HTMLAudioElement>(null)
  const samples = useRef<Sample[]>([])
  const runId = useRef(newId())
  const [playing, setPlaying] = useState(false)
  const [position, setPosition] = useState(0)
  const [duration, setDuration] = useState(0)
  const [count, setCount] = useState(0)
  const [ended, setEnded] = useState(false)
  const [invalid, setInvalid] = useState(false)
  const [saving, setSaving] = useState(false)
  const [ready, setReady] = useState(false)
  const dirty = useRef(false)
  const dragging = useRef(false)
  useEffect(() => {
    api<User>('/auth/me')
      .then(setUser)
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])
  const refresh = useCallback(async () => {
    const list = await api<Track[]>('/tracks')
    setTracks(list)
    return list
  }, [])
  useEffect(() => {
    if (user) refresh().catch((e) => setError(e.message))
  }, [user, refresh])
  useEffect(() => {
    const before = (e: BeforeUnloadEvent) => {
      if (dirty.current) {
        e.preventDefault()
        e.returnValue = ''
      }
    }
    const hidden = () => {
      if (document.hidden && audio.current && !audio.current.paused) {
        audio.current.pause()
        setNotice(
          'タブが非表示になったため一時停止しました。戻ったら再開してください。',
        )
      }
    }
    window.addEventListener('beforeunload', before)
    document.addEventListener('visibilitychange', hidden)
    return () => {
      window.removeEventListener('beforeunload', before)
      document.removeEventListener('visibilitychange', hidden)
    }
  }, [])
  function move(next: Point) {
    pointRef.current = next
    setPoint(next)
  }
  function reset() {
    if (audio.current) {
      audio.current.pause()
      audio.current.currentTime = 0
    }
    samples.current = []
    runId.current = newId()
    dirty.current = false
    setCount(0)
    setPosition(0)
    setEnded(false)
    setInvalid(false)
    setPlaying(false)
    setError('')
    move({ valence: 0, arousal: 0 })
  }
  function choose(track: Track) {
    if (saving) return
    if (
      dirty.current &&
      !window.confirm('未保存の評価を破棄して、曲を切り替えますか？')
    )
      return
    reset()
    setReady(false)
    setDuration(0)
    setSelected(track)
    setNotice('')
  }
  const capture = useCallback(() => {
    const a = audio.current
    if (!a || !Number.isFinite(a.duration)) return
    const t = samples.current.length * 0.5
    const actual = a.currentTime
    setPosition(actual)
    if (t >= a.duration || actual < t) return
    if (actual - t > 0.25) {
      a.pause()
      setInvalid(true)
      setError(
        '記録に遅れが生じました。「最初から」で評価をやり直してください。',
      )
      return
    }
    samples.current.push({
      time_ms: Math.round(t * 1000),
      observed_time_ms: Math.round(actual * 1000),
      ...pointRef.current,
    })
    dirty.current = true
    setCount(samples.current.length)
  }, [])
  useEffect(() => {
    if (!playing) return
    let frame: number
    const tick = () => {
      capture()
      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [playing, capture])
  async function togglePlay() {
    const a = audio.current
    if (!a) return
    if (!a.paused) {
      a.pause()
      return
    }
    try {
      setError('')
      await a.play()
    } catch {
      setError('音源を再生できません。ファイル形式や接続を確認してください。')
    }
  }
  async function saveNext() {
    if (!selected || !ended || invalid || saving) return
    setSaving(true)
    setError('')
    try {
      await api('/annotations', {
        id: runId.current,
        track_id: selected.id,
        duration,
        samples: samples.current,
      })
      dirty.current = false
      const title = selected.title
      const updated = tracks.map((t) =>
        t.id === selected.id ? { ...t, evaluations: t.evaluations + 1 } : t,
      )
      setTracks(updated)
      const index = updated.findIndex((t) => t.id === selected.id)
      const ordered = [...updated.slice(index + 1), ...updated.slice(0, index)]
      const next = ordered.find((t) => !t.evaluations)
      reset()
      setReady(false)
      setDuration(0)
      setSelected(next ?? null)
      setNotice(
        `「${title}」の評価を保存しました。${next ? '次の未評価曲を選択しました。' : '楽曲一覧から次の曲を選べます。'}`,
      )
    } catch (e) {
      setError(
        `${(e as Error).message} 記録は保持しています。再試行してください。`,
      )
    } finally {
      setSaving(false)
    }
  }
  function pointer(e: React.PointerEvent<HTMLDivElement>) {
    const r = e.currentTarget.getBoundingClientRect()
    move({
      valence: quantize(((e.clientX - r.left) / r.width) * 20 - 10),
      arousal: quantize(10 - ((e.clientY - r.top) / r.height) * 20),
    })
  }
  if (loading) return <div className="loading">VA Studio を読み込み中…</div>
  if (!user)
    return (
      <Auth
        onLogin={(u) => {
          setUser(u)
          setError('')
        }}
      />
    )
  const completed = tracks.filter((t) => t.evaluations > 0).length
  const visible = tracks.filter(
    (t) =>
      t.title.toLowerCase().includes(query.toLowerCase()) &&
      (filter === 'all' ||
        (filter === 'done' ? t.evaluations > 0 : !t.evaluations)),
  )
  return (
    <div className="app">
      <header>
        <a className="brand" href="/" onClick={(e) => e.preventDefault()}>
          <AudioLines /> VA Studio<span>音楽感情アノテーション</span>
        </a>
        <div className="account">
          <span className="avatar">
            <UserRound size={17} />
          </span>
          <span>{user.username}</span>
          <button
            className="icon-button"
            title="ログアウト"
            aria-label="ログアウト"
            disabled={saving}
            onClick={async () => {
              if (
                dirty.current &&
                !window.confirm('未保存の評価を破棄してログアウトしますか？')
              )
                return
              try {
                await api('/auth/logout', {})
                reset()
                setSelected(null)
                setTracks([])
                setNotice('')
                setUser(null)
              } catch (e) {
                setError((e as Error).message)
              }
            }}
          >
            <LogOut size={17} />
          </button>
        </div>
      </header>
      <div className="workspace">
        <aside>
          <div className="library-heading">
            <span className="eyebrow">YOUR LIBRARY</span>
            <h2>
              楽曲一覧 <span>{tracks.length.toLocaleString()}</span>
            </h2>
          </div>
          <div className="progress-card">
            <div>
              <span>評価の進捗</span>
              <strong>
                {completed}
                <small> / {tracks.length} 曲</small>
              </strong>
            </div>
            <div className="progress-track">
              <i
                style={{
                  width: `${tracks.length ? (completed / tracks.length) * 100 : 0}%`,
                }}
              />
            </div>
            <p>
              {tracks.length
                ? Math.round((completed / tracks.length) * 100)
                : 0}
              % 完了<span>ひとつずつ、あなたのペースで。</span>
            </p>
          </div>
          <div className="search">
            <Search size={17} />
            <input
              aria-label="曲を検索"
              placeholder="曲名で検索…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
          <div className="filters">
            {[
              ['all', 'すべて'],
              ['todo', '未評価'],
              ['done', '評価済み'],
            ].map(([value, label]) => (
              <button
                key={value}
                className={filter === value ? 'active' : ''}
                onClick={() => setFilter(value)}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="track-list">
            {visible.map((t, i) => (
              <button
                key={t.id}
                disabled={saving}
                className={`track ${selected?.id === t.id ? 'selected' : ''}`}
                onClick={() => choose(t)}
              >
                <span className="track-number">
                  {selected?.id === t.id ? (
                    <AudioLines size={18} />
                  ) : (
                    String(i + 1).padStart(2, '0')
                  )}
                </span>
                <span className="track-name">
                  {t.title}
                  <small>
                    {clock(t.duration)} ·{' '}
                    {t.evaluations ? '評価済み' : '未評価'}
                  </small>
                </span>
                {t.evaluations ? (
                  <CheckCircle2 size={17} className="done" />
                ) : (
                  <ChevronRight size={16} />
                )}
              </button>
            ))}
            {!visible.length && (
              <p className="list-empty">
                {tracks.length
                  ? '該当する曲はありません。'
                  : '音源がまだ登録されていません。READMEの手順で登録してください。'}
              </p>
            )}
          </div>
          <div className="sidebar-bottom">
            <Headphones size={17} /> ヘッドホンでの評価をおすすめします
          </div>
        </aside>
        <main>
          <div className="page-heading">
            <div>
              <span className="eyebrow">ANNOTATION WORKSPACE</span>
              <h1>音楽を聴いて、気持ちを記録</h1>
              <p>
                音楽から感じる印象に合わせて、平面上の点を動かしてください。
              </p>
            </div>
            <span className="session-badge">
              <span /> 2 Hz サンプリング
            </span>
          </div>
          {notice && (
            <div className="notice" role="status">
              <Check size={17} />
              {notice}
            </div>
          )}
          {error && (
            <div className="error" role="alert">
              {error}
            </div>
          )}
          <section className="player">
            <div className="cover">
              <Music2 size={30} />
            </div>
            <div className="player-info">
              <span className="eyebrow">
                {selected ? 'NOW ANNOTATING' : 'READY WHEN YOU ARE'}
              </span>
              <h2>{selected?.title ?? '評価する曲を選んでください'}</h2>
              <div className="playback">
                <span>{clock(position)}</span>
                <div className="playback-track">
                  <i
                    style={{
                      width: `${duration ? (position / duration) * 100 : 0}%`,
                    }}
                  />
                </div>
                <span>{clock(duration || selected?.duration || 0)}</span>
              </div>
            </div>
            <button
              className="play-button"
              onClick={togglePlay}
              disabled={!ready || ended || invalid || saving}
              aria-label={playing ? '一時停止' : '再生'}
            >
              {playing ? (
                <Pause fill="currentColor" size={21} />
              ) : (
                <Play fill="currentColor" size={21} />
              )}
            </button>
          </section>
          {selected && (
            <audio
              ref={audio}
              key={selected.id}
              src={`/api/tracks/${selected.id}/audio`}
              preload="auto"
              onLoadedMetadata={(e) => {
                const d = e.currentTarget.duration
                if (Number.isFinite(d) && d > 0) setDuration(d)
                else setError('音源の長さを取得できません。')
              }}
              onCanPlay={() => setReady(true)}
              onPlaying={() => {
                capture()
                setPlaying(true)
              }}
              onPause={() => setPlaying(false)}
              onWaiting={() => setPlaying(false)}
              onEnded={() => {
                capture()
                setPlaying(false)
                setEnded(true)
              }}
              onError={() => {
                setReady(false)
                setError(
                  '音源を読み込めません。接続と音源の形式を確認してください。',
                )
              }}
            />
          )}
          <div className="annotation-grid">
            <section className="plane-card">
              <div className="section-title">
                <h2>Valence–Arousal 平面</h2>
                <span className={`recording ${playing ? 'live' : ''}`}>
                  <i />
                  {invalid
                    ? '要やり直し'
                    : ended
                      ? '記録完了'
                      : playing
                        ? '記録中'
                        : count
                          ? '一時停止中'
                          : '待機中'}
                </span>
              </div>
              <div className="plane-top">
                覚醒・活発 <strong>+10</strong>
              </div>
              <div className="plane-row">
                <div className="axis-side left">
                  不快 <strong>−10</strong>
                </div>
                <div
                  className="plane"
                  tabIndex={0}
                  role="group"
                  aria-label="VA平面。ドラッグまたは矢印キーで操作。矢印は0.01、Shift併用で0.1刻み。"
                  onPointerDown={(e) => {
                    if (saving) return
                    dragging.current = true
                    e.currentTarget.setPointerCapture(e.pointerId)
                    e.currentTarget.focus()
                    pointer(e)
                  }}
                  onPointerMove={(e) => {
                    if (dragging.current && !saving) pointer(e)
                  }}
                  onPointerUp={() => {
                    dragging.current = false
                  }}
                  onPointerCancel={() => {
                    dragging.current = false
                  }}
                  onKeyDown={(e) => {
                    if (
                      saving ||
                      ![
                        'ArrowUp',
                        'ArrowDown',
                        'ArrowLeft',
                        'ArrowRight',
                      ].includes(e.key)
                    )
                      return
                    e.preventDefault()
                    const step = e.shiftKey ? 0.1 : 0.01
                    move({
                      valence: quantize(
                        point.valence +
                          (e.key === 'ArrowRight'
                            ? step
                            : e.key === 'ArrowLeft'
                              ? -step
                              : 0),
                      ),
                      arousal: quantize(
                        point.arousal +
                          (e.key === 'ArrowUp'
                            ? step
                            : e.key === 'ArrowDown'
                              ? -step
                              : 0),
                      ),
                    })
                  }}
                >
                  <span className="quadrant q1">緊張・いらだち</span>
                  <span className="quadrant q2">興奮・喜び</span>
                  <span className="quadrant q3">悲しみ・退屈</span>
                  <span className="quadrant q4">穏やか・リラックス</span>
                  <span className="axis-name axis-v">VALENCE</span>
                  <span className="axis-name axis-a">AROUSAL</span>
                  <span className="origin">0</span>
                  <div
                    className="crosshair-x"
                    style={{ top: `${(10 - point.arousal) * 5}%` }}
                  />
                  <div
                    className="crosshair-y"
                    style={{ left: `${(point.valence + 10) * 5}%` }}
                  />
                  <div
                    className="point"
                    style={{
                      left: `${(point.valence + 10) * 5}%`,
                      top: `${(10 - point.arousal) * 5}%`,
                    }}
                  />
                </div>
                <div className="axis-side right">
                  快 <strong>+10</strong>
                </div>
              </div>
              <div className="plane-bottom">
                鎮静・静か <strong>−10</strong>
              </div>
              <div className="plane-help">
                ドラッグで移動 <span>·</span> 矢印キーで 0.01 刻み{' '}
                <span>·</span> Shift + 矢印で 0.1
              </div>
            </section>
            <div className="detail-column">
              <section className="values-card">
                <span className="eyebrow">CURRENT VALUES</span>
                <h2>いまの評価</h2>
                {(['valence', 'arousal'] as const).map((axis) => (
                  <div className={`value-block ${axis}`} key={axis}>
                    <label htmlFor={axis}>
                      {axis === 'valence' ? 'Valence' : 'Arousal'}{' '}
                      <span>
                        {axis === 'valence' ? '快 − 不快' : '覚醒 − 鎮静'}
                      </span>
                    </label>
                    <ValueInput
                      axis={axis}
                      value={point[axis]}
                      disabled={saving}
                      onChange={(n) => move({ ...point, [axis]: n })}
                    />
                    <div className="value-meter">
                      <i style={{ left: `${(point[axis] + 10) * 5}%` }} />
                    </div>
                    <div className="value-scale">
                      <span>−10.00</span>
                      <span>+10.00</span>
                    </div>
                  </div>
                ))}
              </section>
              <section className="guide-card">
                <Headphones size={21} />
                <h3>評価のしかた</h3>
                <ol>
                  <li>一覧から楽曲を選び、再生します。</li>
                  <li>音楽の印象に合わせて点を動かします。</li>
                  <li>最後まで聴いたら「保存して次へ」。</li>
                </ol>
                <p>
                  一時停止中は記録されません。
                  <br />
                  点を動かさない間は、現在値を記録します。
                </p>
              </section>
            </div>
          </div>
          <footer className="workspace-footer">
            <div className="sample-count">
              <span className="sample-icon">
                <AudioLines size={18} />
              </span>
              <div>
                <strong>
                  {count.toLocaleString()} <span>サンプル</span>
                </strong>
                <small>0.5秒間隔 · 尺度 −10.00 〜 +10.00</small>
              </div>
            </div>
            <div className="footer-actions">
              <button
                className="secondary"
                disabled={!selected || !count || saving}
                onClick={() => {
                  if (
                    window.confirm('現在の記録を破棄して最初から評価しますか？')
                  )
                    reset()
                }}
              >
                <RotateCcw size={16} />
                最初から
              </button>
              <button
                className="primary"
                disabled={!ended || invalid || saving || !count}
                onClick={saveNext}
              >
                {saving ? '保存中…' : '保存して次へ'}
                <ArrowRight size={18} />
              </button>
            </div>
          </footer>
          <p className="save-hint">
            {ended
              ? '記録が完了しました。「保存して次へ」で確定してください。'
              : '曲の最後まで再生すると保存できます。保存前にページを閉じると記録は失われます。'}
          </p>
        </main>
      </div>
    </div>
  )
}
