const swaggerJsdoc = require('swagger-jsdoc');

const options = {
    definition: {
        openapi: '3.0.0',
        info: {
            title: 'API Documentation',
            version: '1.0.0',
            description: 'All API routes documented here',
        },
        servers: [
            {
                url: process.env.API_URL || 'https://rone-frontend-dev.azurewebsites.net',
                description: 'Development server',
            },
        ],
        components: {
            securitySchemes: {
                bearerAuth: {
                    type: 'http',
                    scheme: 'bearer',
                    bearerFormat: 'JWT',
                },
            },
        },
        security: [{ bearerAuth: [] }],
    },
    apis: [
        './routes/authRoutes.js',
        './routes/usersRoutes.js',
        './routes/customerRoutes.js',
        './routes/paymentsRoutes.js',
        './routes/dashboardRoutes.js',
        './routes/escalationRoutes.js',
        './routes/financialRoutes.js',
        './routes/tdsRoutes.js',
    ],
};

const swaggerSpec = swaggerJsdoc(options);
module.exports = swaggerSpec;