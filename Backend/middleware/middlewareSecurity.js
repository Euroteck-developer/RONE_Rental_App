// const cors = require('cors');
// const helmet = require('helmet');

// const securityHeaders = helmet({
//   contentSecurityPolicy: {
//     directives: {
//       defaultSrc: ["'self'"],
//       scriptSrc: ["'self'"],
//       styleSrc: ["'self'", "'unsafe-inline'"],
//     }
//   },
//   hsts: { maxAge: 31536000, includeSubDomains: true, preload: true },
//   frameguard: { action: 'deny' },
//   noSniff: true
// });

// const allowedOrigins = process.env.ALLOWED_ORIGINS 
//   ? process.env.ALLOWED_ORIGINS.split(',')
//   : ['https://rone-frontend-dev.azurewebsites.net']
//   // : ['http://localhost:3000'];

// const corsOptions = cors({
//   origin: (origin, callback) => {
//     if (!origin || allowedOrigins.includes(origin) || allowedOrigins.includes('*')) {
//       callback(null, true);
//     } else {
//       callback(new Error('Not allowed by CORS'));
//     }
//   },
//   credentials: true,
//   methods: ['GET', 'POST', 'PUT', 'DELETE'],
//   allowedHeaders: ['Content-Type', 'Authorization']
// });

// module.exports = { securityHeaders, corsOptions };


const cors = require('cors');
const helmet = require('helmet');

/**
 * SECURITY HEADERS (Helmet)
 */
const securityHeaders = helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", "data:", "https:"]
    }
  },
  hsts: {
    maxAge: 31536000,
    includeSubDomains: true,
    preload: true
  },
  frameguard: { action: 'deny' },
  noSniff: true
});

/**
 * ALLOWED ORIGINS
 */
const allowedOrigins = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(',')
  : [
      'http://localhost:3000',
      'https://rone-frontend-dev.azurewebsites.net'
    ];

/**
 * CORS CONFIG (NOT middleware)
 */
const corsOptions = {
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(null, false);
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
};

module.exports = {
  securityHeaders,
  corsOptions
};