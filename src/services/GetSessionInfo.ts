import { api } from "./api";

export const getSessionInfo = async () => {
  const response = await api.post('/web/session/get_session_info', {});
  if(response.data.error) {
    return Promise.reject(new Error(response.data.error.message));
  }
  const data = await response.data;
  return data.result;
};

export const getSessionInfoWithRetry = async (retries = 3, delay = 1000): Promise<any> => {
  const res = await fetch("/api/odoo/session_info", {
  method: "GET",
  credentials: "include",
  headers: {
    "Content-Type": "application/json",
    "Accept": "application/json",
    "X-Requested-With": "XMLHttpRequest",
    "X-SSO-API-KEY": "my-sso-secret-123",
  },
});

const data = await res.json();
return data;
};