export interface CorsOptions {
  origin: string[];
  credentials: boolean;
  methods: string[];
}

export function getProductionCorsConfig(allowedOrigins: string[] = []): CorsOptions {
  const isProduction = process.env.NODE_ENV === 'production';
  const defaultOrigins = isProduction ? allowedOrigins : ['http://localhost:3000'];

  return {
    origin: defaultOrigins,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
  };
}
