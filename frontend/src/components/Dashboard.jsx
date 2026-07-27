import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine,
} from 'recharts';
import client from '../api/client';

const PHASE_COLORS = { build: 'text-green-400', deload: 'text-yellow-400', off: 'text-gray-400' };
const PHASE_LABELS = { build: 'Build Phase', deload: 'Deload Week', off: 'Rest Week' };

function rollingAvg(data, window = 3) {
  return data.map((d, i) => {
    const slice = data.slice(Math.max(0, i - window + 1), i + 1);
    const avg = slice.reduce((s, x) => s + x.weight_lbs, 0) / slice.length;
    return { ...d, avg: parseFloat(avg.toFixed(1)) };
  });
}

export default function Dashboard() {
  const [weights, setWeights] = useState([]);
  const [prs, setPrs] = useState([]);
  const [plan, setPlan] = useState(null);
  const [nutrition, setNutrition] = useState(null);
  const [newWeight, setNewWeight] = useState('');
  const [adding, setAdding] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    client.get('/progress/weight').then(r => setWeights(r.data)).catch(() => {});
    client.get('/progress/prs').then(r => setPrs(r.data)).catch(() => {});
    client.get('/workouts/plan').then(r => setPlan(r.data)).catch(() => {});
    const now = new Date();
    const dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
    const dayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1).toISOString();
    client.get(`/nutrition/summary?start=${dayStart}&end=${dayEnd}`).then(r => setNutrition(r.data)).catch(() => {});
  }, []);

  async function logWeight(e) {
    e.preventDefault();
    if (!newWeight) return;
    setAdding(true);
    try {
      await client.post('/progress/weight', { weight_lbs: parseFloat(newWeight) });
      const r = await client.get('/progress/weight');
      setWeights(r.data);
      setNewWeight('');
    } finally {
      setAdding(false);
    }
  }

  const chartData = rollingAvg(weights.slice(-30));
  const latestWeight = weights.at(-1);
  const mainLifts = ['Back Squat', 'Bench Press', 'Deadlift'];
  const mainPRs = mainLifts.map(name => prs.find(p => p.exercise_name === name));

  return (
    <div className="md:ml-52 p-4 max-w-4xl mx-auto">
      <h2 className="text-2xl font-bold text-white mb-6">Dashboard</h2>

      {/* Stats row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <StatCard label="Current Weight" value={latestWeight ? `${latestWeight.weight_lbs} lbs` : '—'} />
        <StatCard label="Today's Calories" value={nutrition?.total_calories ? `${Math.round(nutrition.total_calories)} kcal` : '—'} />
        <StatCard label="Today's Protein" value={nutrition?.total_protein_g ? `${Math.round(nutrition.total_protein_g)}g` : '—'} />
        <StatCard
          label="Cycle Phase"
          value={plan ? PHASE_LABELS[plan.phase] : '—'}
          valueClass={plan ? PHASE_COLORS[plan.phase] : ''}
          sub={plan ? `Week ${plan.cycle_week} of 14` : ''}
        />
      </div>

      {/* Main lifts PRs */}
      <div className="bg-gray-900 rounded-2xl border border-gray-800 p-4 mb-4">
        <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-3">Main Lift PRs</h3>
        <div className="grid grid-cols-3 gap-3">
          {mainLifts.map((name, i) => {
            const pr = mainPRs[i];
            return (
              <div key={name} className="text-center">
                <p className="text-xs text-gray-500 mb-1">{name}</p>
                <p className="text-2xl font-bold text-white">{pr ? `${pr.best_weight_lbs}` : '—'}</p>
                {pr && <p className="text-xs text-gray-400">{pr.reps} rep{pr.reps !== 1 ? 's' : ''} · lbs</p>}
              </div>
            );
          })}
        </div>
      </div>

      {/* Weight chart */}
      <div className="bg-gray-900 rounded-2xl border border-gray-800 p-4 mb-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider">Weight Trend</h3>
          <form onSubmit={logWeight} className="flex gap-2">
            <input
              type="number"
              step="0.1"
              placeholder="lbs"
              value={newWeight}
              onChange={e => setNewWeight(e.target.value)}
              className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-1.5 text-white text-sm w-24 focus:outline-none focus:border-blue-500"
            />
            <button
              type="submit"
              disabled={adding}
              className="bg-blue-600 hover:bg-blue-500 text-white text-sm px-3 py-1.5 rounded-lg disabled:opacity-50"
            >
              Log
            </button>
          </form>
        </div>
        {chartData.length > 0 ? (
          <ResponsiveContainer width="100%" height={180}>
            <LineChart data={chartData}>
              <XAxis
                dataKey="logged_at"
                tickFormatter={v => new Date(v).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                tick={{ fill: '#6b7280', fontSize: 11 }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                domain={['auto', 'auto']}
                tick={{ fill: '#6b7280', fontSize: 11 }}
                axisLine={false}
                tickLine={false}
                width={45}
              />
              <Tooltip
                contentStyle={{ background: '#1f2937', border: 'none', borderRadius: 8, color: '#fff' }}
                formatter={(val, name) => [val + ' lbs', name === 'avg' ? '3-day avg' : 'Raw']}
                labelFormatter={v => new Date(v).toLocaleDateString()}
              />
              <Line type="monotone" dataKey="weight_lbs" dot={{ r: 2 }} stroke="#4b5563" strokeWidth={1} />
              <Line type="monotone" dataKey="avg" dot={false} stroke="#3b82f6" strokeWidth={2} />
            </LineChart>
          </ResponsiveContainer>
        ) : (
          <p className="text-gray-500 text-sm text-center py-8">Log your first weight above to start tracking</p>
        )}
      </div>

      {/* Active plan summary */}
      {plan ? (
        <div className="bg-gray-900 rounded-2xl border border-gray-800 p-4 mb-4">
          <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-1">Active Plan</h3>
          <p className="text-white font-medium">{plan.name}</p>
          {plan.phase === 'deload' && (
            <p className="text-yellow-400 text-sm mt-1">Deload week — main lifts at 70% of PR</p>
          )}
          {plan.phase === 'off' && (
            <p className="text-gray-400 text-sm mt-1">Rest week — no training. Recovery is training.</p>
          )}
          <button
            onClick={() => navigate('/workout')}
            className="mt-3 text-sm text-blue-400 hover:text-blue-300"
          >
            View full plan →
          </button>
        </div>
      ) : (
        <div className="bg-gray-900 rounded-2xl border border-gray-800 p-4 mb-4 text-center">
          <p className="text-gray-500 text-sm mb-2">No active workout plan</p>
          <button
            onClick={() => navigate('/chat')}
            className="text-sm text-blue-400 hover:text-blue-300"
          >
            Ask Coach AI to build you one →
          </button>
        </div>
      )}

      {/* Accessory PRs */}
      {prs.filter(p => !mainLifts.includes(p.exercise_name)).length > 0 && (
        <div className="bg-gray-900 rounded-2xl border border-gray-800 p-4">
          <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-3">Accessory PRs</h3>
          <div className="grid grid-cols-2 gap-2">
            {prs.filter(p => !mainLifts.includes(p.exercise_name)).map(pr => (
              <div key={pr.exercise_name} className="flex justify-between items-center py-1.5 border-b border-gray-800">
                <span className="text-sm text-gray-300">{pr.exercise_name}</span>
                <span className="text-sm font-semibold text-white">{pr.best_weight_lbs} lbs × {pr.reps}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function StatCard({ label, value, valueClass = 'text-white', sub }) {
  return (
    <div className="bg-gray-900 rounded-2xl border border-gray-800 p-4">
      <p className="text-xs text-gray-500 uppercase tracking-wider mb-1">{label}</p>
      <p className={`text-lg font-bold ${valueClass}`}>{value}</p>
      {sub && <p className="text-xs text-gray-500 mt-0.5">{sub}</p>}
    </div>
  );
}
