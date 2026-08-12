// Vercel serverless entry point.
// Reuses the exact same request handler as the local server (server.js).
// Vercel routes every /api/* request here (see vercel.json) and calls it
// with the same (req, res) pair as Node's HTTP server.
'use strict';
const { handleRequest } = require('../server');

module.exports = handleRequest;
