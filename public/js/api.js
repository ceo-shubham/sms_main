// api.js — fetch wrapper + app state
'use strict';
window.SMS = window.SMS || {};

(function () {
  const state = {
    token: localStorage.getItem('sms_token') || null,
    user: null,
    settings: null,
  };

  async function request(method, path, body) {
    const headers = { 'Content-Type': 'application/json' };
    if (state.token) headers.Authorization = 'Bearer ' + state.token;
    let res;
    try {
      res = await fetch(path, { method, headers, body: body ? JSON.stringify(body) : undefined });
    } catch (e) {
      throw new Error('Cannot reach the server. Is it running?');
    }
    let data = null;
    try { data = await res.json(); } catch (e) { /* no body */ }
    if (res.status === 401) {
      // session expired or invalid token
      if (SMS.app) SMS.app.handleAuthFailure(data && data.error);
      throw new Error((data && data.error) || 'Session expired');
    }
    if (!res.ok) throw new Error((data && data.error) || `Request failed (${res.status})`);
    return data;
  }

  const api = {
    state,
    setToken(t) { state.token = t; localStorage.setItem('sms_token', t || ''); },
    clearToken() { state.token = null; localStorage.removeItem('sms_token'); },
    get: (p) => request('GET', p),
    post: (p, b) => request('POST', p, b),
    put: (p, b) => request('PUT', p, b),
    del: (p) => request('DELETE', p),
    request,
  };

  window.SMS.api = api;
})();
