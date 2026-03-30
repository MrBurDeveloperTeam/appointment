import axios from "axios";

export const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL, 
  withCredentials: true,
  headers: { 
    "Content-Type": "application/json",
  },
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
