'use strict';

/**
 * Safe error responses.
 *
 * - Errors we raise on purpose (validation / business rules) carry a 4xx
 *   `statusCode` and their message is shown to the user as-is.
 * - Anything else (DB errors, bugs, network) is logged in full on the server
 *   and the client only receives a generic message plus a short reference id
 *   that support can search for in the logs. No SQL / stack text ever leaks.
 */
const crypto = require('crypto');

/** Create an error whose message is safe to show to the user. */
const userError = (message, statusCode = 400, extra = {}) =>
  Object.assign(new Error(message), { statusCode, expose: true, ...extra });

const PG_CODE_MAP = {
  '23505': { status: 409, message: 'Duplicate record. This entry already exists.' },
  '23503': { status: 409, message: 'This record is linked to other data and cannot be changed.' },
  '22P02': { status: 400, message: 'Invalid input value.' },
  '22007': { status: 400, message: 'Invalid date value.' },
  '22008': { status: 400, message: 'Invalid date value.' },
};

/**
 * Send a safe JSON error response.
 * @param {import('express').Response} res
 * @param {Error & {statusCode?: number, code?: string}} err
 * @param {string} context   label for the server log (e.g. 'createCustomer')
 */
const sendError = (res, err, context = 'request') => {
  const status = Number(err && err.statusCode);
  if (status >= 400 && status < 500) {
    return res.status(status).json({ success: false, error: err.message, ...(err.code && typeof err.code === 'string' && !/^\d/.test(err.code) ? { code: err.code } : {}) });
  }

  const mapped = err && PG_CODE_MAP[err.code];
  if (mapped) {
    console.error(`[${context}]`, err);
    return res.status(mapped.status).json({ success: false, error: mapped.message });
  }

  const requestId = crypto.randomBytes(4).toString('hex');
  console.error(`[${context}] requestId=${requestId}`, err);
  return res.status(500).json({
    success: false,
    error: 'Something went wrong. Please try again.',
    requestId,
  });
};

module.exports = { userError, sendError };
