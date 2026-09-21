import axios from "axios";

const api = axios.create({
  baseURL: "https://app.snabbb.com/api",       
  withCredentials: true, 
  headers: {
    "Content-Type": "application/json",
    "Accept": "application/json",
    "X-Requested-With": "XMLHttpRequest",
    "X-SSO-API-KEY": "my-sso-secret-123",
  },
});

export const creditApi = axios.create({
  baseURL: import.meta.env.ODOO_API_URL, 
  withCredentials: true,
  headers: {
    "Content-Type": "application/json",
  },
});

export default api;