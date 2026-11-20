import * as Joi from 'joi';

export const validateEnv = (config: Record<string, any>) => {
    const envSchema = Joi.object({
        NODE_ENV: Joi.string()
            .valid('development', 'production', 'test')
            .default('development'),

        PORT: Joi.number().default(3000),
        API_PREFIX: Joi.string().default('api'),

        DATABASE_URL: Joi.string().required(),

        REDIS_HOST: Joi.string().default('localhost'),
        REDIS_PORT: Joi.number().default(6379),
        REDIS_PASSWORD: Joi.string().allow('', null),

        JWT_SECRET: Joi.string().required(),
        JWT_EXPIRES_IN: Joi.string().default('7d'),
        JWT_REFRESH_SECRET: Joi.string().required(),
        JWT_REFRESH_EXPIRES_IN: Joi.string().default('30d'),

        CORS_ORIGINS: Joi.string().default('http://localhost:4200'),

        THROTTLE_TTL: Joi.number().default(60),
        THROTTLE_LIMIT: Joi.number().default(100),

        LOG_LEVEL: Joi.string()
            .valid('error', 'warn', 'info', 'debug')
            .default('info'),

        // کلید رمزنگاری اطلاعات حساس (کلید خصوصی مودیان، کلیدهای درگاه/پیامک): openssl rand -hex 32
        ENCRYPTION_KEY: Joi.string().hex().length(64).allow('', null),
        APP_PUBLIC_URL: Joi.string().allow('', null),
        FRONTEND_URL: Joi.string().allow('', null),

        SWAGGER_ENABLED: Joi.boolean().default(true),

        TAX_AUTHORITY_API_URL: Joi.string().allow('', null),
        TAX_AUTHORITY_API_KEY: Joi.string().allow('', null),

        SMS_PROVIDER: Joi.string().default('kavenegar'),
        KAVENEGAR_API_KEY: Joi.string().allow('', null),

        PAYMENT_PROVIDER: Joi.string().default('zarinpal'),
        ZARINPAL_MERCHANT_ID: Joi.string().allow('', null),
    });

    const { error, value } = envSchema.validate(config, {
        abortEarly: false,
        allowUnknown: true,
    });

    if (error) {
        throw new Error(`Config validation error: ${error.message}`);
    }

    return value;
};