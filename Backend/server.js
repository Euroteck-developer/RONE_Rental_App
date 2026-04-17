// const express = require('express');
// const morgan = require('morgan');
// const cors = require("cors");
// require('dotenv').config();

// const { securityHeaders, corsOptions } = require('./middleware/middlewareSecurity');
// const { preventInjection } = require('./middleware/validator');
// const authRoutes = require('./routes/authRoutes');
// const userRoutes = require('./routes/usersRoutes');
// const customerRoutes = require('./routes/customerRoutes');
// const paymentRoutes = require('./routes/paymentsRoutes');
// const dashboardRoutes = require('./routes/dashboardRoutes');
// const escalationRoutes = require('./routes/escalationRoutes');
// const financialRoutes = require('./routes/financialRoutes');
// const tdsRoutes = require('./routes/tdsRoutes');

// const app = express();

// app.use(cors({
//   origin: process.env.ALLOWED_ORIGINS ||'https://rone-frontend-dev.azurewebsites.net',
//   credentials: true
// }));

// app.set('trust proxy', 1);
// app.use(securityHeaders);
// app.use(corsOptions);
// app.use(express.json({ limit: '10mb' }));
// app.use(express.urlencoded({ extended: true }));
// app.use(preventInjection);
// app.use(morgan('dev'));
// app.use('/api/auth', authRoutes);
// app.use('/api/users', userRoutes);
// app.use('/api/customers', customerRoutes);
// app.use('/api/payments', paymentRoutes);
// app.use('/api/dashboard', dashboardRoutes);
// app.use('/api/escalations', escalationRoutes);
// app.use('/api/financial', financialRoutes);
// app.use('/api/tds', tdsRoutes);


// app.use((_req, res) => {
//   res.status(404).json({ success: false, error: 'Resource not found' });
// });

// app.use((err, _req, res, _next) => {
//   console.error('Error:', err.message);
//   if (err.message === 'Not allowed by CORS') {
//     return res.status(403).json({ success: false, error: 'CORS policy violation' });
//   }
//   res.status(500).json({ success: false, error: 'Internal server error' });
// });

// app.get('/', (_req, res) => {
//   res.json({
//     status: 'success',
//     message: 'API is running smoothly',
//     timestamp: new Date().toISOString()
//   });
// });

// const PORT = process.env.PORT || 8080;
// app.listen(PORT, () => console.log(`Server running on port ${PORT}`));

// module.exports = app;

const express = require('express');
const morgan = require('morgan');
const cors = require('cors');
const swaggerUi = require('swagger-ui-express');
const swaggerSpec = require('./swagger');
require('dotenv').config();

const { securityHeaders, corsOptions } = require('./middleware/middlewareSecurity');
// const { preventInjection } = require('./middleware/validator');

// Routes
const authRoutes = require('./routes/authRoutes');
const userRoutes = require('./routes/usersRoutes');
const customerRoutes = require('./routes/customerRoutes');
const paymentRoutes = require('./routes/paymentsRoutes');
const dashboardRoutes = require('./routes/dashboardRoutes');
const escalationRoutes = require('./routes/escalationRoutes');
const financialRoutes = require('./routes/financialRoutes');
const tdsRoutes = require('./routes/tdsRoutes');

const app = express();

app.use('/api/docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec, {
  explorer: true,
  customCss: '.swagger-ui .topbar { display: none }',
  customSiteTitle: 'API Docs',
}));

app.get('/api/docs.json', (_req, res) => {
  res.setHeader('Content-Type', 'application/json');
  res.send(swaggerSpec);
});

app.use(cors(corsOptions));

app.set('trust proxy', 1);

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

app.use(securityHeaders);

app.use(morgan('dev'));

// app.use(preventInjection);

app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/customers', customerRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/escalations', escalationRoutes);
app.use('/api/financial', financialRoutes);
app.use('/api/tds', tdsRoutes);

app.get('/', (_req, res) => {
  res.json({
    status: 'success',
    message: 'API is running smoothly',
    timestamp: new Date().toISOString()
  });
});

/**
 * 🔥 404 HANDLER
 */
app.use((_req, res) => {
  res.status(404).json({
    success: false,
    error: 'Resource not found'
  });
});

/**
 * 🔥 GLOBAL ERROR HANDLER
 */
app.use((err, _req, res, _next) => {
  console.error('Error:', err.message);

  if (err.message === 'Not allowed by CORS') {
    return res.status(403).json({
      success: false,
      error: 'CORS policy violation'
    });
  }

  res.status(500).json({
    success: false,
    error: 'Internal server error'
  });
});

/**
 * 🔥 START SERVER (AZURE SAFE)
 */
const PORT = process.env.PORT || 8080;

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

module.exports = app;