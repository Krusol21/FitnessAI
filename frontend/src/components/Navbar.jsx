import { useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import client from '../api/client';

const links = [
  { to: '/', label: 'Dashboard', icon: '📊' },
  { to: '/chat', label: 'Coach', icon: '💬' },
  { to: '/nutrition', label: 'Nutrition', icon: '🥗' },
  { to: '/workout', label: 'Workout', icon: '🏋️' },
  { to: '/foods', label: 'Foods', icon: '📋' },
];

function ChangePasswordModal({ onClose }) {
  const [form, setForm] = useState({ currentPassword: '', newPassword: '', confirmPassword: '' });
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setError('');
    if (form.newPassword !== form.confirmPassword) {
      setError('New passwords do not match');
      return;
    }
    setLoading(true);
    try {
      await client.post('/auth/change-password', {
        currentPassword: form.currentPassword,
        newPassword: form.newPassword,
      });
      setSuccess(true);
      setTimeout(onClose, 1500);
    } catch (err) {
      setError(err.response?.data?.error || 'Something went wrong');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-gray-900 border border-gray-700 rounded-2xl p-6 w-full max-w-sm" onClick={e => e.stopPropagation()}>
        <h3 className="text-white font-semibold text-lg mb-4">Change Password</h3>
        {success ? (
          <p className="text-green-400 text-center py-4">Password updated!</p>
        ) : (
          <form onSubmit={submit} className="flex flex-col gap-3">
            <input
              type="password"
              placeholder="Current password"
              value={form.currentPassword}
              onChange={e => setForm(f => ({ ...f, currentPassword: e.target.value }))}
              required
              className="bg-gray-800 border border-gray-700 rounded-lg px-4 py-2.5 text-white text-sm placeholder-gray-500 focus:outline-none focus:border-blue-500"
            />
            <input
              type="password"
              placeholder="New password (min 8 chars)"
              value={form.newPassword}
              onChange={e => setForm(f => ({ ...f, newPassword: e.target.value }))}
              required
              className="bg-gray-800 border border-gray-700 rounded-lg px-4 py-2.5 text-white text-sm placeholder-gray-500 focus:outline-none focus:border-blue-500"
            />
            <input
              type="password"
              placeholder="Confirm new password"
              value={form.confirmPassword}
              onChange={e => setForm(f => ({ ...f, confirmPassword: e.target.value }))}
              required
              className="bg-gray-800 border border-gray-700 rounded-lg px-4 py-2.5 text-white text-sm placeholder-gray-500 focus:outline-none focus:border-blue-500"
            />
            {error && <p className="text-red-400 text-sm">{error}</p>}
            <div className="flex gap-2 pt-1">
              <button type="button" onClick={onClose} className="flex-1 bg-gray-800 text-gray-400 py-2.5 rounded-lg text-sm">
                Cancel
              </button>
              <button
                type="submit"
                disabled={loading}
                className="flex-1 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white py-2.5 rounded-lg text-sm font-medium"
              >
                {loading ? 'Saving…' : 'Update'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

export default function Navbar() {
  const navigate = useNavigate();
  const [showChangePassword, setShowChangePassword] = useState(false);
  const [showMenu, setShowMenu] = useState(false);

  function logout() {
    localStorage.removeItem('fitnessai_token');
    localStorage.removeItem('fitnessai_email');
    navigate('/login');
  }

  return (
    <>
      {showChangePassword && <ChangePasswordModal onClose={() => setShowChangePassword(false)} />}

      {/* Desktop sidebar */}
      <nav className="hidden md:flex flex-col fixed left-0 top-0 h-full w-52 bg-gray-900 border-r border-gray-800 p-4 z-50">
        <div className="mb-8">
          <h1 className="text-xl font-bold text-white">FitnessAI</h1>
          <p className="text-xs text-gray-500 mt-0.5">{localStorage.getItem('fitnessai_email')}</p>
        </div>
        <div className="flex flex-col gap-1 flex-1">
          {links.map(l => (
            <NavLink
              key={l.to}
              to={l.to}
              end={l.to === '/'}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors ${
                  isActive ? 'bg-blue-600 text-white' : 'text-gray-400 hover:bg-gray-800 hover:text-white'
                }`
              }
            >
              <span>{l.icon}</span>
              {l.label}
            </NavLink>
          ))}
        </div>
        <div className="flex flex-col gap-1">
          <button
            onClick={() => setShowChangePassword(true)}
            className="text-xs text-gray-500 hover:text-gray-300 transition-colors text-left px-3 py-2"
          >
            Change password
          </button>
          <button
            onClick={logout}
            className="text-xs text-gray-500 hover:text-red-400 transition-colors text-left px-3 py-2"
          >
            Sign out
          </button>
        </div>
      </nav>

      {/* Mobile bottom bar */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-gray-900 border-t border-gray-800 flex justify-around z-50 safe-bottom">
        {links.map(l => (
          <NavLink
            key={l.to}
            to={l.to}
            end={l.to === '/'}
            className={({ isActive }) =>
              `flex flex-col items-center py-2 px-3 text-xs transition-colors ${
                isActive ? 'text-blue-400' : 'text-gray-500'
              }`
            }
          >
            <span className="text-lg">{l.icon}</span>
            {l.label}
          </NavLink>
        ))}
        {/* Settings dot on mobile */}
        <button
          onClick={() => setShowMenu(m => !m)}
          className="flex flex-col items-center py-2 px-3 text-xs text-gray-500"
        >
          <span className="text-lg">⚙️</span>
          More
        </button>
      </nav>

      {/* Mobile menu */}
      {showMenu && (
        <div className="md:hidden fixed inset-0 bg-black/60 z-40" onClick={() => setShowMenu(false)}>
          <div className="absolute bottom-20 right-4 bg-gray-900 border border-gray-700 rounded-2xl overflow-hidden shadow-xl" style={{ bottom: 'calc(5rem + env(safe-area-inset-bottom))' }} onClick={e => e.stopPropagation()}>
            <button
              onClick={() => { setShowMenu(false); setShowChangePassword(true); }}
              className="block w-full text-left px-5 py-3.5 text-sm text-gray-300 hover:bg-gray-800"
            >
              Change password
            </button>
            <button
              onClick={logout}
              className="block w-full text-left px-5 py-3.5 text-sm text-red-400 hover:bg-gray-800 border-t border-gray-800"
            >
              Sign out
            </button>
          </div>
        </div>
      )}
    </>
  );
}
