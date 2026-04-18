const cors   = require('cors');
const helmet = require('helmet');

const securityHeaders = helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc:  ["'self'"],
      styleSrc:   ["'self'", "'unsafe-inline'"],
      imgSrc:     ["'self'", "data:", "https:"]
    }
  }
});

const allowedOrigins = (process.env.ALLOWED_ORIGINS || 'https://rone-frontend-dev.azurewebsites.net')
  .split(',')
  .map(o => o.trim().replace(/\/$/, ''))
  .filter(Boolean); // remove empty strings

console.log("Allowed Origins loaded:", allowedOrigins);

const corsOptions = {
  origin: (origin, callback) => {
    // Allow requests with no origin (mobile apps, Postman, curl)
    if (!origin) return callback(null, true);

    const cleanOrigin = origin.trim().replace(/\/$/, '');

    if (allowedOrigins.includes(cleanOrigin)) {
      return callback(null, true);
    }

    console.log("BLOCKED ORIGIN:", origin);
    return callback(new Error(`CORS: origin '${origin}' not allowed`));
  },
  credentials:    true,
  methods:        ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  optionsSuccessStatus: 200 // some browsers (IE11) choke on 204
};

module.exports = { securityHeaders, corsOptions };