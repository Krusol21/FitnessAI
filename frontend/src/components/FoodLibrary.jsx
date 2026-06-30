import { useState, useEffect } from 'react';
import client from '../api/client';

export default function FoodLibrary() {
  const [foods, setFoods] = useState([]);
  const [query, setQuery] = useState('');
  const [deleting, setDeleting] = useState(null);

  function load(q = '') {
    const url = q ? `/nutrition/foods?q=${encodeURIComponent(q)}` : '/nutrition/foods';
    client.get(url).then(r => setFoods(r.data)).catch(() => {});
  }

  useEffect(() => { load(); }, []);
  useEffect(() => {
    const t = setTimeout(() => load(query), 300);
    return () => clearTimeout(t);
  }, [query]);

  async function deleteFood(id) {
    setDeleting(id);
    try {
      await client.delete(`/nutrition/foods/${id}`);
      setFoods(f => f.filter(x => x.id !== id));
    } finally {
      setDeleting(null);
    }
  }

  return (
    <div className="md:ml-52 p-4 max-w-2xl mx-auto">
      <h2 className="text-2xl font-bold text-white mb-4">Food Library</h2>
      <p className="text-gray-400 text-sm mb-4">Foods you've logged before — reused automatically when you log the same item.</p>

      <input
        placeholder="Search foods…"
        value={query}
        onChange={e => setQuery(e.target.value)}
        className="w-full bg-gray-800 border border-gray-700 rounded-xl px-4 py-3 text-white placeholder-gray-500 text-sm focus:outline-none focus:border-blue-500 mb-4"
      />

      {foods.length === 0 ? (
        <p className="text-gray-500 text-sm text-center py-8">
          {query ? 'No foods match your search' : 'No saved foods yet — log something to start building your library'}
        </p>
      ) : (
        <div className="bg-gray-900 rounded-2xl border border-gray-800 overflow-hidden">
          <ul className="divide-y divide-gray-800">
            {foods.map(f => (
              <li key={f.id} className="flex items-center px-4 py-3 gap-3">
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-white font-medium truncate">{f.name}</p>
                  <p className="text-xs text-gray-500 mt-0.5">
                    {f.serving_size}{f.serving_unit} · {f.calories} kcal · P {f.protein_g}g · C {f.carbs_g}g · F {f.fat_g}g
                  </p>
                </div>
                <button
                  onClick={() => deleteFood(f.id)}
                  disabled={deleting === f.id}
                  className="text-gray-600 hover:text-red-400 text-xs transition-colors disabled:opacity-30 flex-shrink-0"
                >
                  {deleting === f.id ? '…' : '✕'}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
