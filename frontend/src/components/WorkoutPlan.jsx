import { useState, useEffect } from 'react';
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

// Normalize plan_json no matter what keys Claude used
function normalizePlan(raw) {
  if (!raw) return raw;
  const json = raw.plan_json;
  if (!json) return raw;

  // Already correct structure
  if (json.squat_day) return raw;

  // Try to find day data under alternate key names
  function findDay(candidates) {
    for (const key of candidates) {
      if (json[key]) return json[key];
    }
    return null;
  }

  function normalizeDay(day) {
    if (!day) return { main_lift: null, accessories: [] };
    // main_lift might be a string instead of object
    const ml = typeof day.main_lift === 'string'
      ? { name: day.main_lift, sets: null, reps: null }
      : day.main_lift || null;
    // accessories might be strings
    const acc = (day.accessories || []).map(a =>
      typeof a === 'string' ? { name: a, sets: null, reps: null } : a
    );
    return { ...day, main_lift: ml, accessories: acc };
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

export default function WorkoutPlan() {
  const [plan, setPlan] = useState(undefined); // undefined = loading, null = no plan
  const [activeDay, setActiveDay] = useState('squat_day');
  const [checked, setChecked] = useState({});
  const [logging, setLogging] = useState(false);
  const [showRaw, setShowRaw] = useState(false);
  const [rawApiResponse, setRawApiResponse] = useState(null);
  const navigate = useNavigate();

  function load() {
    client.get('/workouts/plan')
      .then(r => {
        setRawApiResponse(r.data);
        setPlan(normalizePlan(r.data));
      })
      .catch(err => {
        setRawApiResponse({ error: err.message });
        setPlan(null);
      });
  }

  useEffect(() => { load(); }, []);

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
          <button
            onClick={() => navigate('/chat')}
            className="bg-blue-600 hover:bg-blue-500 text-white px-6 py-3 rounded-xl font-medium"
          >
            Ask Coach AI to build one
          </button>
          <button onClick={load} className="text-sm text-gray-500 hover:text-gray-300">
            Refresh
          </button>
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
          <button
            onClick={() => setShowRaw(r => !r)}
            className="text-xs text-gray-600 hover:text-gray-400"
          >
            {showRaw ? 'Hide' : 'Debug'}
          </button>
        </div>
      </div>

      {showRaw && (
        <pre className="bg-gray-900 border border-gray-700 rounded-xl p-3 text-xs text-gray-400 overflow-auto mb-4 max-h-64">
          {JSON.stringify(rawApiResponse, null, 2)}
        </pre>
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
                Main lifts at 70% of your PR. Reduce accessory volume. Focus on form.
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

          {/* Main lift */}
          {mainLift && (
            <div className="bg-gray-900 rounded-2xl border border-gray-800 p-4 mb-3">
              <p className="text-xs text-gray-500 uppercase tracking-wider mb-2">Main Lift</p>
              <ExerciseRow
                exercise={mainLift}
                checked={checked}
                toggle={toggle}
                isDeload={isDeload}
              />
            </div>
          )}

          {/* Accessories */}
          {accessories.length > 0 && (
            <div className="bg-gray-900 rounded-2xl border border-gray-800 p-4 mb-4">
              <p className="text-xs text-gray-500 uppercase tracking-wider mb-2">Accessories</p>
              <div className="space-y-3">
                {accessories.map((ex, i) => (
                  <ExerciseRow key={i} exercise={ex} checked={checked} toggle={toggle} />
                ))}
              </div>
            </div>
          )}

          {/* Notes */}
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

function ExerciseRow({ exercise, checked, toggle, isDeload }) {
  const name = typeof exercise === 'string' ? exercise : exercise.name;
  const sets = typeof exercise === 'object' ? exercise.sets : null;
  const reps = typeof exercise === 'object' ? exercise.reps : null;
  const notes = typeof exercise === 'object' ? exercise.notes : null;
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
        {(sets || reps) && (
          <p className="text-xs text-gray-500 mt-0.5">
            {sets ? `${sets} sets` : ''}{sets && reps ? ' × ' : ''}{reps ? `${reps} reps` : ''}
            {isDeload ? ' (at 70% PR)' : ''}
          </p>
        )}
        {notes && <p className="text-xs text-gray-600 mt-0.5 italic">{notes}</p>}
      </div>
    </label>
  );
}
