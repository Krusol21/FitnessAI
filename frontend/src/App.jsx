import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import AuthPage from './components/AuthPage';
import Dashboard from './components/Dashboard';
import ChatInterface from './components/ChatInterface';
import NutritionLog from './components/NutritionLog';
import WorkoutPlan from './components/WorkoutPlan';
import FoodLibrary from './components/FoodLibrary';
import Navbar from './components/Navbar';

function ProtectedRoute({ children }) {
  const token = localStorage.getItem('fitnessai_token');
  if (!token) return <Navigate to="/login" replace />;
  return (
    <div className="flex flex-col min-h-dvh">
      <Navbar />
      <main className="flex-1 pb-20 md:pb-0">{children}</main>
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<AuthPage />} />
        <Route path="/" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
        <Route path="/chat" element={<ProtectedRoute><ChatInterface /></ProtectedRoute>} />
        <Route path="/nutrition" element={<ProtectedRoute><NutritionLog /></ProtectedRoute>} />
        <Route path="/workout" element={<ProtectedRoute><WorkoutPlan /></ProtectedRoute>} />
        <Route path="/foods" element={<ProtectedRoute><FoodLibrary /></ProtectedRoute>} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
