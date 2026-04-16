// // const cors = require('cors');
// // const helmet = require('helmet');

// // const securityHeaders = helmet({
// //   contentSecurityPolicy: {
// //     directives: {
// //       defaultSrc: ["'self'"],
// //       scriptSrc: ["'self'"],
// //       styleSrc: ["'self'", "'unsafe-inline'"],
// //     }
// //   },
// //   hsts: { maxAge: 31536000, includeSubDomains: true, preload: true },
// //   frameguard: { action: 'deny' },
// //   noSniff: true
// // });

// // const allowedOrigins = process.env.ALLOWED_ORIGINS 
// //   ? process.env.ALLOWED_ORIGINS.split(',')
// //   : ['https://rone-frontend-dev.azurewebsites.net']
// //   // : ['http://localhost:3000'];

// // const corsOptions = cors({
// //   origin: (origin, callback) => {
// //     if (!origin || allowedOrigins.includes(origin) || allowedOrigins.includes('*')) {
// //       callback(null, true);
// //     } else {
// //       callback(new Error('Not allowed by CORS'));
// //     }
// //   },
// //   credentials: true,
// //   methods: ['GET', 'POST', 'PUT', 'DELETE'],
// //   allowedHeaders: ['Content-Type', 'Authorization']
// // });

// // module.exports = { securityHeaders, corsOptions };


// const cors = require('cors');
// const helmet = require('helmet');

// /**
//  * SECURITY HEADERS (Helmet)
//  */
// const securityHeaders = helmet({
//   contentSecurityPolicy: {
//     directives: {
//       defaultSrc: ["'self'"],
//       scriptSrc: ["'self'"],
//       styleSrc: ["'self'", "'unsafe-inline'"],
//       imgSrc: ["'self'", "data:", "https:"]
//     }
//   },
//   hsts: {
//     maxAge: 31536000,
//     includeSubDomains: true,
//     preload: true
//   },
//   frameguard: { action: 'deny' },
//   noSniff: true
// });

// /**
//  * ALLOWED ORIGINS
//  */
// const allowedOrigins = process.env.ALLOWED_ORIGINS
//   ? process.env.ALLOWED_ORIGINS.split(',')
//   : [
//       'http://localhost:3000',
//       'https://rone-frontend-dev.azurewebsites.net'
//     ];

// /**
//  * CORS CONFIG (NOT middleware)
//  */
// const corsOptions = {
//   origin: (origin, callback) => {
//     if (!origin || allowedOrigins.includes(origin)) {
//       callback(null, true);
//     } else {
//       callback(null, false);
//     }
//   },
//   credentials: true,
//   methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
//   allowedHeaders: ['Content-Type', 'Authorization']
// };

// module.exports = {
//   securityHeaders,
//   corsOptions
// };


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

console.log("✅ Allowed Origins loaded:", allowedOrigins);

const corsOptions = {
  origin: (origin, callback) => {
    // Allow requests with no origin (mobile apps, Postman, curl)
    if (!origin) return callback(null, true);

    const cleanOrigin = origin.trim().replace(/\/$/, '');

    if (allowedOrigins.includes(cleanOrigin)) {
      return callback(null, true);
    }

    console.log("❌ BLOCKED ORIGIN:", origin);
    return callback(new Error(`CORS: origin '${origin}' not allowed`));
  },
  credentials:    true,
  methods:        ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  optionsSuccessStatus: 200 // some browsers (IE11) choke on 204
};

module.exports = { securityHeaders, corsOptions };