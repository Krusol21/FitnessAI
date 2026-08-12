import { useState, useEffect, useRef } from 'react';
import client from '../api/client';

const EMPTY_FOOD = { name: '', calories: '', protein_g: '', carbs_g: '', fat_g: '', sugar_g: '', serving_size: '1', serving_unit: 'serving', servings: '1' };

export default function NutritionLog() {
  const [logs, setLogs] = useState([]);
  const [summary, setSummary] = useState(null);
  const [targets, setTargets] = useState({ calories: 2500, protein_g: 180, carbs_g: 250, fat_g: 80, sugar_g: 50 });
  const [foods, setFoods] = useState([]);
  const [form, setForm] = useState(EMPTY_FOOD);
  const [suggestions, setSuggestions] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [scanPreview, setScanPreview] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const cameraRef = useRef(null);
  // Compute local-time day boundaries as UTC ISO strings so the backend
  // filters by the user's actual calendar day, not the UTC date.
  function getTodayBounds() {
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const end = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
    return { start: start.toISOString(), end: end.toISOString() };
  }

  function load() {
    const { start, end } = getTodayBounds();
    client.get(`/nutrition/logs?start=${start}&end=${end}`).then(r => setLogs(r.data)).catch(() => {});
    client.get(`/nutrition/summary?start=${start}&end=${end}`).then(r => setSummary(r.data)).catch(() => {});
  }

  useEffect(() => {
    load();
    client.get('/nutrition/targets').then(r => setTargets(r.data)).catch(() => {});
  }, []);

  useEffect(() => {
    window.addEventListener('fitnessai:nutrition-updated', load);
    return () => window.removeEventListener('fitnessai:nutrition-updated', load);
  }, []);

  async function searchFoods(q) {
    if (!q || q.length < 2) { setSuggestions([]); return; }
    try {
      const { data } = await client.get(`/nutrition/foods?q=${encodeURIComponent(q)}`);
      setSuggestions(data);
    } catch {}
  }

  function selectSuggestion(food) {
    setForm({
      name: food.name,
      calories: food.calories,
      protein_g: food.protein_g,
      carbs_g: food.carbs_g,
      fat_g: food.fat_g,
      serving_size: food.serving_size,
      serving_unit: food.serving_unit,
      servings: '1',
    });
    setSuggestions([]);
  }

  function compressImage(file, maxPx = 1600, quality = 0.85) {
    return new Promise((resolve) => {
      const img = new Image();
      const url = URL.createObjectURL(file);
      img.onload = () => {
        URL.revokeObjectURL(url);
        const scale = Math.min(1, maxPx / Math.max(img.width, img.height));
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
        canvas.toBlob(resolve, 'image/jpeg', quality);
      };
      img.src = url;
    });
  }

  async function handleScan(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setScanPreview(URL.createObjectURL(file));
    setScanning(true);
    setError('');
    try {
      const compressed = await compressImage(file);
      const fd = new FormData();
      fd.append('image', compressed, 'scan.jpg');
      const { data } = await client.post('/scan', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
      setForm(f => ({
        ...f,
        name: data.name || '',
        calories: data.calories ?? '',
        protein_g: data.protein_g ?? '',
        carbs_g: data.carbs_g ?? '',
        fat_g: data.fat_g ?? '',
        sugar_g: data.sugar_g ?? '',
        serving_size: data.serving_size ?? '1',
        serving_unit: data.serving_unit || 'serving',
        servings: '1',
      }));
      setShowForm(true);
    } catch (err) {
      setError(err.response?.data?.error || 'Could not read nutrition from image');
    } finally {
      setScanning(false);
    }
  }

  async function submitLog(e) {
    e.preventDefault();
    if (!form.name || !form.calories) return;
    setSubmitting(true);
    setError('');
    try {
      // Upsert food to library
      const { data: food } = await client.post('/nutrition/foods', {
        name: form.name,
        calories: parseFloat(form.calories),
        protein_g: parseFloat(form.protein_g) || 0,
        carbs_g: parseFloat(form.carbs_g) || 0,
        fat_g: parseFloat(form.fat_g) || 0,
        sugar_g: parseFloat(form.sugar_g) || 0,
        serving_size: parseFloat(form.serving_size) || 1,
        serving_unit: form.serving_unit || 'serving',
      });
      // Log it
      await client.post('/nutrition/logs', { food_id: food.id, servings: parseFloat(form.servings) || 1 });
      setForm(EMPTY_FOOD);
      setScanPreview(null);
      setShowForm(false);
      load();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to log food');
    } finally {
      setSubmitting(false);
    }
  }

  async function deleteLog(id) {
    await client.delete(`/nutrition/logs/${id}`).catch(() => {});
    load();
  }

  const MACROS = [
    { label: 'Protein', val: summary?.total_protein_g, target: targets.protein_g, color: 'bg-blue-500', unit: 'g' },
    { label: 'Carbs',   val: summary?.total_carbs_g,   target: targets.carbs_g,   color: 'bg-yellow-500', unit: 'g' },
    { label: 'Fat',     val: summary?.total_fat_g,      target: targets.fat_g,    color: 'bg-orange-500', unit: 'g' },
    { label: 'Sugar',   val: summary?.total_sugar_g,    target: targets.sugar_g,  color: 'bg-red-500', unit: 'g' },
  ];

  return (
    <div className="md:ml-52 p-4 max-w-2xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold text-white">Nutrition</h2>
        <div className="flex gap-2">
          <label className="cursor-pointer bg-gray-800 hover:bg-gray-700 text-white px-3 py-2 rounded-xl text-sm flex items-center gap-2 transition-colors">
            📷 Scan
            <input
              ref={cameraRef}
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={handleScan}
            />
          </label>
          <button
            onClick={() => { setShowForm(f => !f); setScanPreview(null); }}
            className="bg-blue-600 hover:bg-blue-500 text-white px-3 py-2 rounded-xl text-sm transition-colors"
          >
            + Log Food
          </button>
        </div>
      </div>

      {/* Daily summary */}
      {summary && (
        <div className="bg-gray-900 rounded-2xl border border-gray-800 p-4 mb-4">
          <p className="text-sm text-gray-400 mb-3">Today's Macros</p>

          {/* Calorie bar */}
          <div className="mb-4">
            <div className="flex justify-between items-baseline mb-1.5">
              <span className="text-xs text-gray-400">Calories</span>
              <span className="text-xs text-white font-medium">
                {Math.round(summary.total_calories || 0)} / {targets.calories} kcal
              </span>
            </div>
            <div className="h-2.5 bg-gray-700 rounded-full overflow-hidden">
              <div
                className="h-full rounded-full bg-gradient-to-r from-blue-500 to-purple-500 transition-all"
                style={{ width: `${Math.min(100, ((summary.total_calories || 0) / targets.calories) * 100)}%` }}
              />
            </div>
          </div>

          {/* Macro bars */}
          <div className="space-y-3">
            {MACROS.map(m => (
              <div key={m.label}>
                <div className="flex justify-between items-baseline mb-1">
                  <span className="text-xs text-gray-400">{m.label}</span>
                  <span className="text-xs text-white font-medium">
                    {Math.round(m.val || 0)} / {m.target}{m.unit}
                  </span>
                </div>
                <div className="h-1.5 bg-gray-700 rounded-full overflow-hidden">
                  <div
                    className={`h-full ${m.color} rounded-full transition-all`}
                    style={{ width: `${Math.min(100, ((m.val || 0) / m.target) * 100)}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Scan preview + form */}
      {scanning && (
        <div className="bg-gray-900 rounded-2xl border border-gray-800 p-6 mb-4 text-center">
          <div className="animate-spin w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full mx-auto mb-2" />
          <p className="text-gray-400 text-sm">Reading nutrition label…</p>
        </div>
      )}

      {showForm && !scanning && (
        <div className="bg-gray-900 rounded-2xl border border-gray-800 p-4 mb-4">
          {scanPreview && (
            <img src={scanPreview} alt="scan" className="w-full max-h-40 object-cover rounded-xl mb-4" />
          )}
          <form onSubmit={submitLog} className="space-y-3">
            <div className="relative">
              <input
                placeholder="Food name"
                value={form.name}
                onChange={e => { setForm(f => ({ ...f, name: e.target.value })); searchFoods(e.target.value); }}
                required
                className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2.5 text-white text-sm placeholder-gray-500 focus:outline-none focus:border-blue-500"
              />
              {suggestions.length > 0 && (
                <ul className="absolute z-10 left-0 right-0 bg-gray-800 border border-gray-700 rounded-lg mt-1 overflow-hidden shadow-xl">
                  {suggestions.map(f => (
                    <li
                      key={f.id}
                      onClick={() => selectSuggestion(f)}
                      className="px-3 py-2.5 text-sm text-gray-300 hover:bg-gray-700 cursor-pointer"
                    >
                      {f.name} — {f.calories} kcal/{f.serving_size}{f.serving_unit}
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3">
              {[
                { label: 'Calories', key: 'calories' },
                { label: 'Protein (g)', key: 'protein_g' },
                { label: 'Carbs (g)', key: 'carbs_g' },
                { label: 'Fat (g)', key: 'fat_g' },
                { label: 'Sugar (g)', key: 'sugar_g' },
              ].map(f => (
                <div key={f.key} className="flex flex-col gap-1">
                  <label className="text-xs text-gray-400">{f.label}</label>
                  <input
                    type="number"
                    step="0.1"
                    placeholder="0"
                    value={form[f.key]}
                    onChange={e => setForm(x => ({ ...x, [f.key]: e.target.value }))}
                    className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2.5 text-white text-sm placeholder-gray-500 focus:outline-none focus:border-blue-500"
                  />
                </div>
              ))}
            </div>

            <div className="flex gap-3">
              <input
                type="number"
                step="0.1"
                placeholder="Serving size"
                value={form.serving_size}
                onChange={e => setForm(f => ({ ...f, serving_size: e.target.value }))}
                className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2.5 text-white text-sm placeholder-gray-500 focus:outline-none focus:border-blue-500"
              />
              <input
                placeholder="Unit (g, oz, cup…)"
                value={form.serving_unit}
                onChange={e => setForm(f => ({ ...f, serving_unit: e.target.value }))}
                className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2.5 text-white text-sm placeholder-gray-500 focus:outline-none focus:border-blue-500"
              />
              <input
                type="number"
                step="0.5"
                placeholder="# servings"
                value={form.servings}
                onChange={e => setForm(f => ({ ...f, servings: e.target.value }))}
                className="w-24 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2.5 text-white text-sm placeholder-gray-500 focus:outline-none focus:border-blue-500"
              />
            </div>

            {error && <p className="text-red-400 text-sm">{error}</p>}

            <div className="flex gap-2 pt-1">
              <button
                type="button"
                onClick={() => { setShowForm(false); setScanPreview(null); setForm(EMPTY_FOOD); }}
                className="flex-1 bg-gray-800 text-gray-400 py-2.5 rounded-xl text-sm"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="flex-1 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white py-2.5 rounded-xl text-sm font-medium"
              >
                {submitting ? 'Saving…' : 'Log Food'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Today's log */}
      <div className="bg-gray-900 rounded-2xl border border-gray-800 overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-800">
          <p className="text-sm font-semibold text-gray-400 uppercase tracking-wider">Today's Log</p>
        </div>
        {logs.length === 0 ? (
          <p className="text-gray-500 text-sm text-center py-8">Nothing logged yet today</p>
        ) : (
          <ul className="divide-y divide-gray-800">
            {logs.map(log => {
              const cal = Math.round(log.servings * log.calories);
              const pro = Math.round(log.servings * log.protein_g);
              return (
                <li key={log.id} className="flex items-center justify-between px-4 py-3">
                  <div>
                    <p className="text-sm text-white">{log.name}</p>
                    <p className="text-xs text-gray-500">{log.servings} × {log.serving_size}{log.serving_unit} · {pro}g protein</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-semibold text-white">{cal} kcal</span>
                    <button
                      onClick={() => deleteLog(log.id)}
                      className="text-gray-600 hover:text-red-400 text-xs transition-colors"
                    >
                      ✕
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
