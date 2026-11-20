export default () => ({
    nodeEnv: process.env.NODE_ENV || 'development',
    port: parseInt(process.env.PORT || '3000', 10),
    apiPrefix: process.env.API_PREFIX || 'api',

    database: {
        url: process.env.DATABASE_URL,
    },

    redis: {
        host: process.env.REDIS_HOST || 'localhost',
        port: parseInt(process.env.REDIS_PORT || '6379', 10),
        password: process.env.REDIS_PASSWORD,
    },

    jwt: {
        secret: process.env.JWT_SECRET,
        expiresIn: process.env.JWT_EXPIRES_IN || '7d',
        refreshSecret: process.env.JWT_REFRESH_SECRET,
        refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '30d',
    },

    cors: {
        origins: (process.env.CORS_ORIGINS ?? 'http://localhost:5173,http://localhost:4200').split(',').map((o) => o.trim()).filter(Boolean),
    },

    throttle: {
        ttl: parseInt(process.env.THROTTLE_TTL || '60', 10),
        limit: parseInt(process.env.THROTTLE_LIMIT || '100', 10),
    },

    logging: {
        level: process.env.LOG_LEVEL || 'info',
    },

    swagger: {
        enabled: process.env.SWAGGER_ENABLED === 'true',
    },

    taxAuthority: {
        apiUrl: process.env.TAX_AUTHORITY_API_URL,
        apiKey: process.env.TAX_AUTHORITY_API_KEY,
    },

    sms: {
        provider: process.env.SMS_PROVIDER || 'kavenegar',
        kavenegarApiKey: process.env.KAVENEGAR_API_KEY,
    },

    payment: {
        provider: process.env.PAYMENT_PROVIDER || 'zarinpal',
        zarinpalMerchantId: process.env.ZARINPAL_MERCHANT_ID,
    },
});