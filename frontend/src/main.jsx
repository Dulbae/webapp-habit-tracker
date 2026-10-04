import React, { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import "./styles.css";

const API = import.meta.env.VITE_API_URL || "";

async function api(path, options = {}) {
  const response = await fetch(`${API}${path}`, {
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
    ...options,
  });
  if (!response.ok) {
    const body = await response.text();
    throw new Error(body || `HTTP ${response.status}`);
  }
  return response.json();
}

const today = new Date();
const isoToday = today.toISOString().slice(0, 10);

const groups = [
  ["morning", "morning"],
  ["focused", "focused work"],
  ["evening", "evening"],
  ["special", "special"],
];

function App() {
  const [tab, setTab] = useState("habits");
  const [habits, setHabits] = useState([]);
  const [stats, setStats] = useState(null);
  const [achievements, setAchievements] = useState(null);
  const [profile, setProfile] = useState(null);
  const [windowDays, setWindowDays] = useState(30);
  const [selectedDay, setSelectedDay] = useState(isoToday);
  const [contributionStats, setContributionStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState(null);
  const [error, setError] = useState("");

  const loadHabits = async (day = selectedDay) => setHabits(await api(`/api/habits?day=${day}`));
  const loadContributions = async () => setContributionStats(await api(`/api/stats?days=84`));

  const loadStats = async (days = windowDays) => setStats(await api(`/api/stats?days=${days}`));

  const loadAll = async () => {
    try {
      setLoading(true);
      setError("");
      await Promise.all([
        loadHabits(selectedDay),
        loadStats(windowDays),
        loadContributions(),
        api("/api/achievements").then(setAchievements),
        api("/api/profile").then(setProfile),
      ]);
    } catch (e) {
      setError(`ERROR: ${e.message}`);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadAll(); }, []);
  useEffect(() => {
    if (!loading) loadStats(windowDays).catch(e => setError(e.message));
  }, [windowDays]);

  useEffect(() => {
    if (!loading) loadHabits(selectedDay).catch(e => setError(e.message));
  }, [selectedDay]);

  const completed = habits.filter(h => h.completed).length;
  const percent = habits.length ? Math.round((completed / habits.length) * 100) : 0;

  async function toggleHabit(id) {
    try {
      await api(`/api/habits/${id}/toggle?day=${selectedDay}`, { method: "POST" });
      await Promise.all([loadHabits(selectedDay), loadStats(windowDays), loadContributions(), api("/api/achievements").then(setAchievements)]);
    } catch (e) {
      setError(e.message);
    }
  }

  async function saveHabit(data, id = null) {
    try {
      if (id) {
        await api(`/api/habits/${id}`, { method: "PATCH", body: JSON.stringify(data) });
      } else {
        await api("/api/habits", { method: "POST", body: JSON.stringify(data) });
      }
      setModal(null);
      await loadAll();
    } catch (e) {
      setError(e.message);
    }
  }

  function selectDay(day) {
    setSelectedDay(day);
  }

  async function deleteHabit(id) {
    if (!confirm("Delete this habit permanently?")) return;
    await api(`/api/habits/${id}`, { method: "DELETE" });
    setModal(null);
    await loadAll();
  }

  async function saveProfile(data) {
    const next = await api("/api/profile", { method: "PATCH", body: JSON.stringify(data) });
    setProfile(next);
  }

  const title = tab === "habits" ? "daily" : tab === "stats" ? "stats" : tab === "profile" ? "profile" : "achievements";

  return (
    <div className={`app theme-${profile?.theme || "ansi-dark"}`}>
      <header className="topbar">
        <div className="brand"><span className="prompt">$</span> init.Habits</div>
        <nav>
          {["habits", "stats", "profile"].map(item =>
            <button key={item} className={tab === item ? "active" : ""} onClick={() => setTab(item)}>{item}</button>
          )}
        </nav>
        <div className="online"><span /> local</div>
      </header>

      {error && <div className="errorbar">{error}<button onClick={() => setError("")}>×</button></div>}

      <main className="shell">
        {tab === "habits" && (
          <HabitsPage
            habits={habits}
            completed={completed}
            percent={percent}
            onToggle={toggleHabit}
            onAdd={() => setModal({ type: "habit" })}
            onEdit={(h) => setModal({ type: "habit", habit: h })}
            contributionStats={contributionStats}
            selectedDay={selectedDay}
            onSelectDay={selectDay}
          />
        )}

        {tab === "stats" && (
          <StatsPage stats={stats} days={windowDays} setDays={setWindowDays} />
        )}

        {tab === "profile" && (
          <ProfilePage profile={profile} saveProfile={saveProfile} onAchievements={() => setTab("achievements")} />
        )}

        {tab === "achievements" && (
          <AchievementsPage data={achievements} />
        )}
      </main>

      <footer className="mobile-nav">
        {["habits", "stats", "profile"].map(item =>
          <button key={item} className={tab === item ? "active" : ""} onClick={() => setTab(item)}>
            <span>{item === "habits" ? "☷" : item === "stats" ? "⌁" : "♙"}</span>{item}
          </button>
        )}
      </footer>

      {modal?.type === "habit" && (
        <HabitModal
          habit={modal.habit}
          onClose={() => setModal(null)}
          onSave={saveHabit}
          onDelete={deleteHabit}
        />
      )}
    </div>
  );
}

function PageHeader({ command, children }) {
  return (
    <div className="page-header">
      <div className="command"><span className="green">user@init.Habits</span> <span className="pink">$</span> {command}</div>
      {children}
    </div>
  );
}

function HabitsPage({ habits, completed, percent, onToggle, onAdd, onEdit, contributionStats, selectedDay, onSelectDay }) {
  return (
    <div className="dashboard">
      <aside className="sidebar panel">
        <section>
          <div className="section-title">calendar</div>
          <MiniCalendar />
        </section>
        <section>
          <div className="section-title">contributions</div>
          <Heatmap stats={contributionStats} selectedDay={selectedDay} onSelectDay={onSelectDay} />
        </section>
        <section className="side-meta">
          <div><span>today</span><b>{completed}/{habits.length}</b></div>
          <div><span>completion</span><b>{percent}%</b></div>
          <div><span>date</span><b>{new Intl.DateTimeFormat("en", { month: "short", day: "2-digit" }).format(new Date())}</b></div>
        </section>
      </aside>

      <section className="workspace">
        <PageHeader command="daily">
          <div className="date-line">
            {new Date(`${selectedDay}T00:00:00`).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" })}
            {selectedDay !== isoToday && <button className="today-link" onClick={() => onSelectDay(isoToday)}>today</button>}
          </div>
        </PageHeader>

        <div className="daily-progress panel">
          <div>
            <div className="muted">// the checkbox doesn't care if you feel like it.</div>
            <div className="progress-label"><strong>today</strong><span>{completed}/{habits.length} complete</span></div>
          </div>
          <Progress value={percent} />
        </div>

        {groups.map(([key, label]) => {
          const items = habits.filter(h => h.group_name === key);
          if (!items.length) return null;
          return (
            <section className="habit-group" key={key}>
              <div className="group-title"><span>{label}</span><span>[{items.filter(x => x.completed).length}/{items.length}]</span></div>
              {items.map(h => (
                <HabitRow key={h.id} habit={h} onToggle={onToggle} onEdit={onEdit} />
              ))}
            </section>
          );
        })}

        <button className="add-habit" onClick={onAdd}>+ habit</button>
      </section>

      <aside className="right-panel">
        <div className="panel stat-panel">
          <div className="section-title">$ stats --overview</div>
          <div className="big-stat">{percent}%</div>
          <div className="muted">daily completion</div>
          <div className="stat-grid">
            <div><span>completed</span><b>{completed}</b></div>
            <div><span>remaining</span><b>{habits.length - completed}</b></div>
          </div>
        </div>
        <div className="panel">
          <div className="section-title">streaks</div>
          {habits.slice(0, 5).map(h => (
            <div className="tiny-row" key={h.id}><span>{h.name}</span><b>🔥 {h.current_streak}</b></div>
          ))}
        </div>
      </aside>
    </div>
  );
}

function HabitRow({ habit, onToggle, onEdit }) {
  return (
    <div className={`habit-row ${habit.completed ? "completed" : ""}`} onDoubleClick={() => onEdit(habit)}>
      <button className="check" onClick={() => onToggle(habit.id)}>{habit.completed ? "✓" : " "}</button>
      <span className="habit-icon">{habit.icon}</span>
      <div className="habit-copy">
        <strong>{habit.name}</strong>
        <span>{habit.target || habit.description || "daily"}</span>
      </div>
      <div className="habit-streak">{habit.current_streak > 0 ? `🔥${habit.current_streak}` : ""}</div>
      <button className="edit" onClick={() => onEdit(habit)}>…</button>
    </div>
  );
}

function Progress({ value }) {
  const blocks = 12;
  const filled = Math.round((value / 100) * blocks);
  return <div className="bar">{"█".repeat(filled)}{"░".repeat(blocks - filled)} <span>{value}%</span></div>;
}

function StatsPage({ stats, days, setDays }) {
  if (!stats) return <div className="loading">$ loading stats...</div>;
  const max = Math.max(1, ...stats.by_day.map(x => x.count));
  return (
    <div className="stats-page">
      <PageHeader command="stats">
        <div className="tabs">
          {[7, 30, 90, 365].map(n => <button className={days === n ? "active" : ""} key={n} onClick={() => setDays(n)}>[{n}d]</button>)}
          <button>[all]</button>
        </div>
      </PageHeader>

      <div className="summary-grid">
        <Metric label="total completions" value={stats.total_completions} />
        <Metric label="completion rate" value={`${stats.completion_rate}%`} />
        <Metric label="completed days" value={`${stats.completed_days}/${days}`} />
        <Metric label="window" value={`${days} days`} />
      </div>

      <section className="panel section-block">
        <div className="section-title">completion over time</div>
        <div className="bars">
          {stats.by_day.map((x) => (
            <div className="bar-col" title={`${x.date}: ${x.count}`} key={x.date}>
              <div className="bar-fill" style={{ height: `${Math.max(4, (x.count / max) * 100)}%` }} />
            </div>
          ))}
        </div>
      </section>

      <section className="panel section-block">
        <div className="section-title">habit highlights</div>
        {stats.habit_stats.sort((a,b) => b.count-a.count).map(h => (
          <div className="highlight-row" key={h.id}>
            <span>{h.name}</span>
            <div className="highlight-progress"><Progress value={Math.min(100, Math.round(h.count / days * 100))} /></div>
            <b>{h.count}</b>
          </div>
        ))}
      </section>
    </div>
  );
}

function Metric({ label, value }) {
  return <div className="metric panel"><span>{label}</span><strong>{value}</strong></div>;
}

function AchievementsPage({ data }) {
  if (!data) return <div className="loading">$ loading achievements...</div>;
  const tierTarget = 1500;
  return (
    <div className="achievements">
      <PageHeader command="achievements" />
      <div className="tier-card panel">
        <div className="section-title">tiers</div>
        <div className="muted">// complete habits and meet daily goals to progress through tiers</div>
        <Achievement title="total completions" value={data.total_completions} target={tierTarget} reward="next tier +100 xp" />
        <Achievement title="goal days" value={data.goal_days.value} target={data.goal_days.target} reward="bronze → silver +25 xp" />
        <Achievement title="dedication" value={data.dedication.value} target={data.dedication.target} reward={`habit: ${data.dedication.habit}`} />
        <Achievement title="routine runner" value={data.routine_runner.value} target={data.routine_runner.target} reward="silver +25 xp" />
      </div>
    </div>
  );
}

function Achievement({ title, value, target, reward }) {
  const percent = Math.min(100, Math.round(value / target * 100));
  return (
    <div className="achievement">
      <div className="achievement-title">{title}</div>
      <div className="muted">// progress</div>
      <Progress value={percent} />
      <div className="achievement-meta"><span>{value.toLocaleString()}/{target.toLocaleString()}</span><span>{reward}</span></div>
    </div>
  );
}

function ProfilePage({ profile, saveProfile, onAchievements }) {
  if (!profile) return <div className="loading">$ loading profile...</div>;
  return (
    <div className="profile-page">
      <PageHeader command="profile" />
      <section className="panel profile-card">
        <div className="section-title">identity</div>
        <label>username<input value={profile.username} onChange={e => saveProfile({ username: e.target.value })} /></label>
      </section>

      <section className="panel">
        <div className="section-title">appearance</div>
        <label>theme
          <select value={profile.theme} onChange={e => saveProfile({ theme: e.target.value })}>
            <option value="ansi-dark">ansi dark</option>
            <option value="purple-dark">purple dark</option>
            <option value="blue-dark">blue dark</option>
          </select>
        </label>
        <label>font
          <select value={profile.font} onChange={e => saveProfile({ font: e.target.value })}>
            <option>JetBrains Mono</option>
            <option>IBM Plex Mono</option>
            <option>monospace</option>
          </select>
        </label>
        <label>text size
          <select value={profile.text_size} onChange={e => saveProfile({ text_size: e.target.value })}>
            <option value="default">default</option>
            <option value="larger">larger</option>
            <option value="largest">largest</option>
          </select>
        </label>
      </section>

      <section className="panel">
        <div className="section-title">completed habits</div>
        <Toggle label="move completed to bottom" value={profile.completed_to_bottom} onChange={v => saveProfile({ completed_to_bottom: v })} />
        <Toggle label="cross out completed" value={profile.cross_out} onChange={v => saveProfile({ cross_out: v })} />
      </section>

      <button className="terminal-button" onClick={onAchievements}>$ achievements →</button>
    </div>
  );
}

function Toggle({ label, value, onChange }) {
  return <button className="toggle-row" onClick={() => onChange(!value)}><span>{label}</span><b>{value ? "[on]" : "[off]"}</b></button>;
}

function HabitModal({ habit, onClose, onSave, onDelete }) {
  const [form, setForm] = useState(habit || {
    name: "",
    description: "",
    icon: "○",
    group_name: "morning",
    target: "",
    color: "green",
  });
  const set = (key, value) => setForm(f => ({ ...f, [key]: value }));
  return (
    <div className="overlay" onMouseDown={e => e.target === e.currentTarget && onClose()}>
      <div className="modal panel">
        <div className="modal-header"><span>$ {habit ? "edit habit" : "new habit"}</span><button onClick={onClose}>×</button></div>
        <label>habit name<input autoFocus value={form.name} onChange={e => set("name", e.target.value)} placeholder="e.g. read 20 pages" /></label>
        <label>description<input value={form.description} onChange={e => set("description", e.target.value)} placeholder="optional" /></label>
        <div className="form-grid">
          <label>icon<input value={form.icon} onChange={e => set("icon", e.target.value)} /></label>
          <label>group<select value={form.group_name} onChange={e => set("group_name", e.target.value)}>
            <option value="morning">morning</option>
            <option value="focused">focused</option>
            <option value="evening">evening</option>
            <option value="special">special</option>
          </select></label>
        </div>
        <label>target<input value={form.target} onChange={e => set("target", e.target.value)} placeholder="20 pages / 30 min / 7k steps" /></label>
        <div className="modal-actions">
          {habit && <button className="danger" onClick={() => onDelete(habit.id)}>delete</button>}
          <button onClick={onClose}>cancel</button>
          <button className="primary" disabled={!form.name.trim()} onClick={() => onSave({
            name: form.name,
            description: form.description,
            icon: form.icon || "○",
            group_name: form.group_name,
            target: form.target,
            color: form.color || "green",
          }, habit?.id)}>{habit ? "save" : "create habit"}</button>
        </div>
      </div>
    </div>
  );
}

function MiniCalendar() {
  const d = new Date();
  const year = d.getFullYear(), month = d.getMonth();
  const first = new Date(year, month, 1).getDay();
  const count = new Date(year, month + 1, 0).getDate();
  return (
    <div className="calendar">
      <div className="calendar-head">{d.toLocaleDateString("en", { month: "long", year: "numeric" })}</div>
      <div className="weekdays">{"MTWTFSS".split("").map((x,i)=><span key={i}>{x}</span>)}</div>
      <div className="calendar-grid">
        {Array.from({length:first}).map((_,i)=><span key={`e${i}`} />)}
        {Array.from({length:count}, (_,i)=>i+1).map(n => <span className={n === d.getDate() ? "today" : ""} key={n}>{n}</span>)}
      </div>
    </div>
  );
}

function Heatmap({ stats, selectedDay, onSelectDay }) {
  if (!stats) return <div className="heatmap-loading">loading...</div>;

  const byDate = new Map(stats.by_day.map(x => [x.date, x.count]));
  const max = Math.max(1, ...stats.by_day.map(x => x.count));
  const first = new Date(`${stats.start}T00:00:00`);
  const start = new Date(first);
  start.setDate(start.getDate() - start.getDay());
  const cells = [];

  for (let i = 0; i < 84; i++) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    const key = d.toISOString().slice(0, 10);
    const count = byDate.get(key) || 0;
    const level = count === 0 ? 0 : Math.min(4, Math.ceil((count / max) * 4));
    const isSelected = key === selectedDay;
    const isFuture = key > isoToday;
    cells.push(
      <button
        type="button"
        className={`heat h${level} ${isSelected ? "selected" : ""} ${isFuture ? "future" : ""}`}
        key={key}
        title={`${key} · ${count} completion${count === 1 ? "" : "s"}`}
        onClick={() => !isFuture && onSelectDay(key)}
        aria-label={`${key}, ${count} completions`}
      />
    );
  }

  return (
    <div>
      <div className="heatmap">{cells}</div>
      <div className="heatmap-legend"><span>less</span><i className="heat h0"/><i className="heat h1"/><i className="heat h2"/><i className="heat h3"/><i className="heat h4"/><span>more</span></div>
    </div>
  );
}

createRoot(document.getElementById("root")).render(<App />);
