import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import client from '../api/client';

const PHASE_BADGE = {
  build: 'bg-green-500/20 text-green-400 border-green-500/30',
  deload: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
  off: 'bg-gray-500/20 text-gray-400 border-gray-500/30',
};
const PHASE_LABEL = { build: 'Build Phase', deload: 'Deload Week', off: 'Rest Week' };

const DAY_KEYS = ['squat_day', 'bench_day', 'deadlift_day'];
const DAY_LABELS = { squat_day: 'Squat Day', bench_day: 'Bench Day', deadlift_day: 'Deadlift Day' };
const DAY_TYPES = { squat_day: 'squat', bench_day: 'bench', deadlift_day: 'deadlift' };

function normalizePlan(raw) {
  if (!raw) return raw;
  const json = raw.plan_json;
  if (!json) return raw;
  if (json.squat_day) return raw;

  function findDay(candidates) {
    for (const key of candidates) {
      if (json[key]) return json[key];
    }
    return null;
  }

  function normalizeDay(day) {
    if (!day) return { pre_workout: null, main_lift: null, accessories: [] };
    const ml = typeof day.main_lift === 'string'
      ? { name: day.main_lift, sets: null, reps: null }
      : day.main_lift || null;
    const acc = (day.accessories || []).map(a =>
      typeof a === 'string' ? { name: a, sets: null, reps: null } : a
    );
    return { ...day, main_lift: ml, accessories: acc, cooldown: day.cooldown || [] };
  }

  return {
    ...raw,
    plan_json: {
      squat_day: normalizeDay(findDay(['squat_day', 'squat', 'Squat Day', 'Squat'])),
      bench_day: normalizeDay(findDay(['bench_day', 'bench', 'Bench Day', 'Bench'])),
      deadlift_day: normalizeDay(findDay(['deadlift_day', 'deadlift', 'Deadlift Day', 'Deadlift'])),
      notes: json.notes,
    },
  };
}

const TIMER_KEY = 'fitnessai_rest_timer';

// Global rest timer — persists across screen lock via localStorage + server push
function useRestTimer() {
  const [activeKey, setActiveKey] = useState(null);
  const [remaining, setRemaining] = useState(0);
  const intervalRef = useRef(null);

  // Restore an in-progress timer on mount (e.g. user came back from locked screen)
  useEffect(() => {
    const saved = localStorage.getItem(TIMER_KEY);
    if (!saved) return;
    try {
      const { key, endsAt } = JSON.parse(saved);
      const left = Math.round((endsAt - Date.now()) / 1000);
      if (left > 0) {
        setActiveKey(key);
        setRemaining(left);
        intervalRef.current = setInterval(() => {
          const l = Math.round((endsAt - Date.now()) / 1000);
          if (l <= 0) { clearInterval(intervalRef.current); localStorage.removeItem(TIMER_KEY); setRemaining(0); }
          else setRemaining(l);
        }, 1000);
      } else {
        localStorage.removeItem(TIMER_KEY);
      }
    } catch { localStorage.removeItem(TIMER_KEY); }
    return () => clearInterval(intervalRef.current);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const start = useCallback((key, minutes) => {
    clearInterval(intervalRef.current);
    const secs = Math.round((minutes || 3) * 60);
    const endsAt = Date.now() + secs * 1000;
    localStorage.setItem(TIMER_KEY, JSON.stringify({ key, endsAt, totalSecs: secs }));
    setActiveKey(key);
    setRemaining(secs);
    // Calculate from absolute timestamp each tick — stays accurate even when the browser
    // throttles intervals in the background (e.g. screen locked, tab backgrounded).
    intervalRef.current = setInterval(() => {
      const left = Math.round((endsAt - Date.now()) / 1000);
      if (left <= 0) {
        clearInterval(intervalRef.current);
        localStorage.removeItem(TIMER_KEY);
        setRemaining(0);
      } else {
        setRemaining(left);
      }
    }, 1000);
    // Fire push notification via server in case screen goes off
    client.post('/notifications/rest-timer', { seconds: secs, exerciseName: key }).catch(() => {});
  }, []);

  const cancel = useCallback(() => {
    clearInterval(intervalRef.current);
    localStorage.removeItem(TIMER_KEY);
    setActiveKey(null);
    setRemaining(0);
    client.delete('/notifications/rest-timer').catch(() => {});
  }, []);

  useEffect(() => () => clearInterval(intervalRef.current), []);
  return { activeKey, remaining, start, cancel };
}

function RestTimerButton({ exerciseKey, restMinutes, timer }) {
  const isActive = timer.activeKey === exerciseKey;
  const mins = restMinutes || 3;
  const totalSecs = Math.round(mins * 60);

  if (!isActive) {
    return (
      <button
        onClick={() => timer.start(exerciseKey, mins)}
        className="flex items-center gap-1 text-xs text-gray-600 hover:text-blue-400 transition-colors"
        title={`Start ${mins} min rest timer`}
      >
        ⏱ {mins} min rest
      </button>
    );
  }

  const done = timer.remaining === 0;
  const pct = done ? 100 : Math.round(((totalSecs - timer.remaining) / totalSecs) * 100);
  const m = Math.floor(timer.remaining / 60);
  const s = String(timer.remaining % 60).padStart(2, '0');

  return (
    <button
      onClick={timer.cancel}
      className={`flex items-center gap-2 text-xs px-2 py-1 rounded-lg transition-colors ${
        done
          ? 'bg-green-500/20 text-green-400 border border-green-500/30'
          : 'bg-blue-500/20 text-blue-400 border border-blue-500/30'
      }`}
      title="Tap to cancel"
    >
      <span className="relative w-4 h-4 flex-shrink-0">
        <svg className="w-4 h-4 -rotate-90" viewBox="0 0 16 16">
          <circle cx="8" cy="8" r="6" fill="none" stroke="currentColor" strokeOpacity="0.2" strokeWidth="2" />
          <circle
            cx="8" cy="8" r="6" fill="none" stroke="currentColor" strokeWidth="2"
            strokeDasharray={`${2 * Math.PI * 6}`}
            strokeDashoffset={`${2 * Math.PI * 6 * (1 - pct / 100)}`}
            strokeLinecap="round"
          />
        </svg>
      </span>
      {done ? 'Go!' : `${m}:${s}`}
    </button>
  );
}

export default function WorkoutPlan() {
  const [plan, setPlan] = useState(undefined);
  const [activeDay, setActiveDay] = useState('squat_day');
  const [checked, setChecked] = useState({});
  const [logging, setLogging] = useState(false);
  const [showRaw, setShowRaw] = useState(false);
  const [rawApiResponse, setRawApiResponse] = useState(null);
  const navigate = useNavigate();
  const timer = useRestTimer();

  function load() {
    client.get('/workouts/plan')
      .then(r => { setRawApiResponse(r.data); setPlan(normalizePlan(r.data)); })
      .catch(err => { setRawApiResponse({ error: err.message }); setPlan(null); });
  }

  useEffect(() => { load(); }, []);

  useEffect(() => {
    window.addEventListener('fitnessai:workout-updated', load);
    return () => window.removeEventListener('fitnessai:workout-updated', load);
  }, []);

  function toggle(exerciseName) {
    setChecked(c => ({ ...c, [exerciseName]: !c[exerciseName] }));
  }

  async function finishSession() {
    if (!plan) return;
    setLogging(true);
    try {
      const dayData = plan.plan_json?.[activeDay];
      const exercises = [
        ...(dayData?.main_lift ? [dayData.main_lift] : []),
        ...(dayData?.accessories || []),
      ];
      for (const ex of exercises) {
        const name = typeof ex === 'string' ? ex : ex.name;
        if (checked[name]) {
          await client.post('/workouts/logs', {
            plan_id: plan.id,
            cycle_week: plan.cycle_week || 1,
            day_type: DAY_TYPES[activeDay],
            exercise_name: name,
            sets_completed: typeof ex === 'object' ? (ex.sets || 1) : 1,
          });
        }
      }
      setChecked({});
      alert('Session logged!');
    } finally {
      setLogging(false);
    }
  }

  if (plan === undefined) {
    return (
      <div className="md:ml-52 p-4 max-w-2xl mx-auto text-center mt-12">
        <div className="animate-spin w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full mx-auto" />
      </div>
    );
  }

  if (!plan) {
    return (
      <div className="md:ml-52 p-4 max-w-2xl mx-auto text-center mt-12">
        <p className="text-gray-400 text-lg mb-4">No active workout plan</p>
        <div className="flex flex-col items-center gap-3">
          <button onClick={() => navigate('/chat')} className="bg-blue-600 hover:bg-blue-500 text-white px-6 py-3 rounded-xl font-medium">
            Ask Coach AI to build one
          </button>
          <button onClick={load} className="text-sm text-gray-500 hover:text-gray-300">↻ Refresh</button>
          {rawApiResponse && (
            <pre className="mt-4 bg-gray-900 border border-gray-700 rounded-xl p-3 text-xs text-gray-400 overflow-auto max-h-48 text-left w-full max-w-sm">
              {JSON.stringify(rawApiResponse, null, 2)}
            </pre>
          )}
        </div>
      </div>
    );
  }

  const dayData = plan.plan_json?.[activeDay] || {};
  const mainLift = dayData.main_lift;
  const accessories = dayData.accessories || [];
  const isDeload = plan.phase === 'deload';
  const isOff = plan.phase === 'off';

  return (
    <div className="md:ml-52 p-4 max-w-2xl mx-auto">
      {/* Header */}
      <div className="flex items-start justify-between mb-4">
        <div>
          <h2 className="text-2xl font-bold text-white">{plan.name}</h2>
          <div className="flex items-center gap-2 mt-1">
            <span className={`text-xs px-2 py-0.5 rounded-full border ${PHASE_BADGE[plan.phase]}`}>
              {PHASE_LABEL[plan.phase]}
            </span>
            <span className="text-xs text-gray-500">Week {plan.cycle_week} of 14</span>
          </div>
        </div>
        <div className="flex gap-2">
          <button onClick={load} className="text-xs text-gray-600 hover:text-gray-400">↻</button>
          <button onClick={() => setShowRaw(r => !r)} className="text-xs text-gray-600 hover:text-gray-400">
            {showRaw ? 'Hide' : 'Debug'}
          </button>
        </div>
      </div>

      {showRaw && (
        <pre className="bg-gray-900 border border-gray-700 rounded-xl p-3 text-xs text-gray-400 overflow-auto mb-4 max-h-64">
          {JSON.stringify(rawApiResponse, null, 2)}
        </pre>
      )}

      {/* Plan notes */}
      {plan.plan_json?.notes && (
        <div className="bg-blue-500/10 border border-blue-500/20 rounded-xl p-3 mb-4 text-sm text-blue-300">
          {plan.plan_json.notes}
        </div>
      )}

      {isOff ? (
        <div className="bg-gray-900 rounded-2xl border border-gray-800 p-8 text-center">
          <p className="text-3xl mb-3">🛌</p>
          <p className="text-white font-semibold text-lg">Rest Week</p>
          <p className="text-gray-400 text-sm mt-2">Recovery is training. Come back strong next week.</p>
        </div>
      ) : (
        <>
          {isDeload && (
            <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-xl p-3 mb-4">
              <p className="text-yellow-400 text-sm font-medium">Deload Week</p>
              <p className="text-yellow-300/70 text-xs mt-0.5">
                Main lifts at 55–65% of recent working weight. No set above RPE 6. Feel itchy to train by Thursday — that means it's working.
              </p>
            </div>
          )}

          {/* Day tabs */}
          <div className="flex gap-2 mb-4">
            {DAY_KEYS.map(key => (
              <button
                key={key}
                onClick={() => { setActiveDay(key); setChecked({}); }}
                className={`flex-1 py-2 rounded-xl text-sm font-medium transition-colors ${
                  activeDay === key ? 'bg-blue-600 text-white' : 'bg-gray-800 text-gray-400 hover:text-white'
                }`}
              >
                {DAY_LABELS[key].replace(' Day', '')}
              </button>
            ))}
          </div>

          {/* Pre-workout activation */}
          {dayData.pre_workout && (
            <div className="bg-gray-900 rounded-2xl border border-gray-800 p-4 mb-3">
              <p className="text-xs text-gray-500 uppercase tracking-wider mb-2">⚡ Pre-Workout Activation</p>
              <p className="text-sm text-gray-300 leading-relaxed">{dayData.pre_workout}</p>
            </div>
          )}

          {/* Main lift */}
          {mainLift && (
            <div className="bg-gray-900 rounded-2xl border border-gray-800 p-4 mb-3">
              <p className="text-xs text-gray-500 uppercase tracking-wider mb-3">Main Lift</p>

              {/* Warm-up progression */}
              {mainLift.warmup?.length > 0 && (
                <div className="mb-4 pb-4 border-b border-gray-800">
                  <p className="text-xs text-gray-600 mb-2">Warm-up</p>
                  <div className="flex flex-wrap gap-2">
                    {mainLift.warmup.map((w, i) => (
                      <div key={i} className="bg-gray-800 rounded-lg px-2.5 py-1.5 text-center">
                        <p className="text-xs text-gray-400">{w.label}</p>
                        <p className="text-xs text-gray-500">× {w.reps}</p>
                      </div>
                    ))}
                    <div className="bg-blue-900/30 border border-blue-700/30 rounded-lg px-2.5 py-1.5 text-center">
                      <p className="text-xs text-blue-400">Working</p>
                      <p className="text-xs text-blue-500">sets ↓</p>
                    </div>
                  </div>
                </div>
              )}

              {/* Working set details */}
              <label className="flex items-start gap-3 cursor-pointer group">
                <div className={`mt-0.5 w-5 h-5 rounded-md border-2 flex-shrink-0 flex items-center justify-center transition-colors ${
                  checked[mainLift.name] ? 'bg-blue-600 border-blue-600' : 'border-gray-600 group-hover:border-gray-400'
                }`}>
                  {checked[mainLift.name] && <span className="text-white text-xs">✓</span>}
                </div>
                <input type="checkbox" className="hidden" checked={!!checked[mainLift.name]} onChange={() => toggle(mainLift.name)} />
                <div className="flex-1">
                  <p className={`text-base font-semibold ${checked[mainLift.name] ? 'line-through text-gray-500' : 'text-white'}`}>
                    {mainLift.name}
                  </p>
                  <div className="flex flex-wrap items-center gap-2 mt-1.5">
                    {mainLift.sets && mainLift.reps && (
                      <span className="bg-gray-800 text-gray-300 text-xs px-2 py-1 rounded-lg">
                        {mainLift.sets} × {mainLift.reps} reps
                      </span>
                    )}
                    {mainLift.rpe && (
                      <span className="bg-orange-500/20 text-orange-400 text-xs px-2 py-1 rounded-lg border border-orange-500/30">
                        RPE {mainLift.rpe}
                      </span>
                    )}
                    {mainLift.intensity_pct && (
                      <span className="bg-purple-500/20 text-purple-400 text-xs px-2 py-1 rounded-lg border border-purple-500/30">
                        ~{mainLift.intensity_pct}%
                      </span>
                    )}
                    {mainLift.rest_minutes && (
                      <RestTimerButton
                        exerciseKey={mainLift.name}
                        restMinutes={mainLift.rest_minutes}
                        timer={timer}
                      />
                    )}
                    {isDeload && (
                      <span className="bg-yellow-500/20 text-yellow-400 text-xs px-2 py-1 rounded-lg">
                        55–65% working weight
                      </span>
                    )}
                  </div>
                  {mainLift.notes && (
                    <p className="text-xs text-gray-500 mt-2 leading-relaxed italic">{mainLift.notes}</p>
                  )}
                </div>
              </label>
            </div>
          )}

          {/* Accessories */}
          {accessories.length > 0 && (
            <div className="bg-gray-900 rounded-2xl border border-gray-800 p-4 mb-4">
              <p className="text-xs text-gray-500 uppercase tracking-wider mb-3">Accessories</p>
              <div className="space-y-4">
                {accessories.map((ex, i) => (
                  <AccessoryRow key={i} exercise={ex} checked={checked} toggle={toggle} timer={timer} />
                ))}
              </div>
            </div>
          )}

          {/* Cooldown stretches */}
          {dayData.cooldown?.length > 0 && (
            <div className="bg-gray-900 rounded-2xl border border-gray-800 p-4 mb-4">
              <p className="text-xs text-gray-500 uppercase tracking-wider mb-3">🧘 Cooldown & Stretches</p>
              <div className="space-y-2">
                {dayData.cooldown.map((s, i) => (
                  <div key={i} className="flex items-start justify-between gap-3">
                    <div className="flex-1">
                      <p className="text-sm text-white">{s.name}</p>
                      {s.notes && <p className="text-xs text-gray-600 mt-0.5">{s.notes}</p>}
                    </div>
                    <span className="text-xs text-gray-500 flex-shrink-0 mt-0.5">
                      {s.duration_seconds >= 60
                        ? `${Math.floor(s.duration_seconds / 60)}min${s.duration_seconds % 60 ? ` ${s.duration_seconds % 60}s` : ''}`
                        : `${s.duration_seconds}s`}
                      {s.duration_seconds && s.name?.toLowerCase().includes('/side') ? ' / side' : ''}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Day notes */}
          {dayData.notes && (
            <div className="bg-gray-800/50 rounded-xl p-3 mb-4 text-sm text-gray-400">
              {dayData.notes}
            </div>
          )}

          <button
            onClick={finishSession}
            disabled={logging || Object.keys(checked).length === 0}
            className="w-full bg-green-600 hover:bg-green-500 disabled:opacity-40 text-white py-3 rounded-xl font-semibold transition-colors"
          >
            {logging ? 'Logging…' : 'Finish Session'}
          </button>
        </>
      )}
    </div>
  );
}

function AccessoryRow({ exercise, checked, toggle, timer }) {
  const name = typeof exercise === 'string' ? exercise : exercise.name;
  const sets = typeof exercise === 'object' ? exercise.sets : null;
  const reps = typeof exercise === 'object' ? exercise.reps : null;
  const notes = typeof exercise === 'object' ? exercise.notes : null;
  const rest = typeof exercise === 'object' ? exercise.rest_minutes : null;
  const done = !!checked[name];

  return (
    <label className="flex items-start gap-3 cursor-pointer group">
      <div className={`mt-0.5 w-5 h-5 rounded-md border-2 flex-shrink-0 flex items-center justify-center transition-colors ${
        done ? 'bg-blue-600 border-blue-600' : 'border-gray-600 group-hover:border-gray-400'
      }`}>
        {done && <span className="text-white text-xs">✓</span>}
      </div>
      <input type="checkbox" className="hidden" checked={done} onChange={() => toggle(name)} />
      <div className="flex-1">
        <p className={`text-sm font-medium ${done ? 'line-through text-gray-500' : 'text-white'}`}>{name}</p>
        <div className="flex flex-wrap items-center gap-2 mt-1" onClick={e => e.preventDefault()}>
          {(sets || reps) && (
            <span className="text-xs text-gray-500">
              {sets && `${sets} sets`}{sets && reps && ' × '}{reps && `${reps} reps`}
            </span>
          )}
          {rest && (
            <RestTimerButton exerciseKey={name} restMinutes={rest} timer={timer} />
          )}
        </div>
        {notes && <p className="text-xs text-gray-600 mt-1 leading-relaxed">{notes}</p>}
      </div>
    </label>
  );
}
