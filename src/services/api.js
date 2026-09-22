import axios from "axios";
import { getWorkspaceHeaders } from './workspaceContext';

export const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL, 
  withCredentials: true,
  headers: { 
    "Content-Type": "application/json",
  },
});

api.interceptors.request.use((config) => {
  config.headers.delete('X-Snabbb-Workspace-User-Id');
  for (const [name, value] of Object.entries(getWorkspaceHeaders())) {
    config.headers.set(name, value);
  }
  return config;
});

// Optional: basic error unwrap
api.interceptors.response.use(
  (res) => res,
  (err) => {
    const msg =
      err?.response?.data?.message ||
      err?.response?.data?.error ||
      err.message;
    const error = new Error(msg);
    error.status = err?.response?.status;
    return Promise.reject(error);
  }
);
