require('dotenv').config();

const required = (key) => {
  const value = process.env[key];
  if (value === undefined || value === '') {
    if (process.env.NODE_ENV === 'production') {
      throw new Error(`Missing required environment variable: ${key}`);
    }
    return undefined;
  }
  return value;
};

const config = {
  env: process.env.NODE_ENV || 'development',
  isProduction: process.env.NODE_ENV === 'production',
  port: Number(process.env.PORT || 4300),
  host: process.env.HOST || '127.0.0.1',
  serveWeb: process.env.SERVE_WEB === 'true',
  trustProxy: process.env.TRUST_PROXY || false,
  rateLimitStore: process.env.RATE_LIMIT_STORE || 'redis',
  apiBaseUrl: process.env.API_BASE_URL || 'http://localhost:4000',
  corsOrigins: (process.env.CORS_ORIGINS || '').split(',').filter(Boolean),

  db: {
    host: process.env.DB_HOST || 'localhost',
    port: Number(process.env.DB_PORT || 5432),
    name: process.env.DB_NAME || 'sureshot_dev',
    user: process.env.DB_USER || 'sureshot_app',
    password: process.env.DB_PASSWORD || '',
    poolMin: Number(process.env.DB_POOL_MIN || 2),
    poolMax: Number(process.env.DB_POOL_MAX || 20),
  },

  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: Number(process.env.REDIS_PORT || 6379),
    password: process.env.REDIS_PASSWORD || undefined,
  },

  elasticsearch: {
    node: process.env.ELASTICSEARCH_NODE || 'http://localhost:9200',
  },

  jwt: {
    accessSecret: required('JWT_ACCESS_SECRET') || 'dev_access_secret',
    refreshSecret: required('JWT_REFRESH_SECRET') || 'dev_refresh_secret',
    accessTtl: process.env.JWT_ACCESS_TTL || '15m',
    refreshTtlDays: Number(process.env.JWT_REFRESH_TTL_DAYS || 30),
  },

  oauth: {
    googleClientId: process.env.GOOGLE_CLIENT_ID || '',
    appleClientId: process.env.APPLE_CLIENT_ID || '',
  },

  otp: {
    ttlSeconds: Number(process.env.OTP_TTL_SECONDS || 300),
    maxAttempts: Number(process.env.OTP_MAX_ATTEMPTS || 5),
    smsProvider: process.env.SMS_PROVIDER || 'console',
  },

  s3: {
    endpoint: process.env.S3_ENDPOINT || '',
    region: process.env.S3_REGION || 'ap-south-1',
    bucket: process.env.S3_BUCKET || 'sureshot-media',
    accessKey: process.env.S3_ACCESS_KEY || '',
    secretKey: process.env.S3_SECRET_KEY || '',
  },
};

if (!['redis', 'postgres'].includes(config.rateLimitStore)) throw new Error('Invalid RATE_LIMIT_STORE');
if (config.isProduction) {
  for (const key of ['JWT_ACCESS_SECRET', 'JWT_REFRESH_SECRET']) {
    const value = required(key);
    if (value.length < 32 || /^(change_me|dev_)/i.test(value)) throw new Error(`${key} must be a strong secret of at least 32 characters`);
  }
  if (config.jwt.accessSecret === config.jwt.refreshSecret) throw new Error('JWT secrets must differ');
  if (!/^[a-f0-9]{64}$/i.test(required('ENCRYPTION_KEY'))) throw new Error('ENCRYPTION_KEY must be 64 hexadecimal characters');
  required('DB_PASSWORD');
}
module.exports = config;
