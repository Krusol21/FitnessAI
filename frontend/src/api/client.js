import axios from 'axios';

const client = axios.create({
  baseURL: import.meta.env.VITE_API_URL || '/api',
});

client.interceptors.request.use(config => {
  const token = localStorage.getItem('fitnessai_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

client.interceptors.response.use(
  r => r,
  err => {
    if (err.response?.status === 401) {
      localStorage.removeItem('fitnessai_token');
      localStorage.removeItem('fitnessai_email');
      window.location.href = '/login';
    }
    return Promise.reject(err);
  }
);

export default client;
