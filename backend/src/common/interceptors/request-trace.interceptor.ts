import {
  CallHandler,
  ExecutionContext,
  Injectable,
  Logger,
  NestInterceptor,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { v4 as uuidv4 } from 'uuid';

/**
 * Header name used to propagate the trace ID to clients.
 * Callers can correlate browser logs with server logs using this value.
 */
export const TRACE_ID_HEADER = 'X-Trace-Id';

/**
 * Property name attached to the Express request object so that downstream
 * controllers and services can read the trace ID without coupling to HTTP
 * headers.
 */
export const TRACE_ID_PROPERTY = 'traceId';

/**
 * Sampling rate read from the environment.
 *
 * `LOG_SAMPLE_RATE` must be a float in the range [0, 1]:
 *   0   = never log (silent)
 *   0.1 = log ~10 % of requests (low-traffic sampling)
 *   1   = log every request (default — recommended for development)
 *
 * Values outside [0, 1] are clamped. Non-numeric values fall back to 1.
 */
function resolveSampleRate(): number {
  const raw = process.env['LOG_SAMPLE_RATE'];
  if (raw === undefined || raw === '') return 1;
  const parsed = parseFloat(raw);
  if (Number.isNaN(parsed)) return 1;
  return Math.max(0, Math.min(1, parsed));
}

/**
 * RequestTraceInterceptor
 *
 * A NestJS interceptor that provides structured, JSON-serialisable request
 * tracing across all HTTP routes (issue #753).
 *
 * ## What it does
 *
 * 1. **Generates a unique trace ID** (UUID v4) for every incoming request.
 * 2. **Attaches the trace ID** to:
 *    - `req.traceId`            — consumed by downstream services/guards
 *    - `res.setHeader(X-Trace-Id)` — visible to clients and API gateways
 * 3. **Logs request start** (`incoming_request`) with method, path, trace ID.
 * 4. **Logs request end** (`outgoing_response`) with status, duration (ms),
 *    trace ID — emitted via `rxjs/tap` so it fires even on error paths.
 * 5. **Supports log sampling** via the `LOG_SAMPLE_RATE` env variable so
 *    high-throughput deployments can shed log volume without losing trace IDs.
 *
 * ## Log format
 *
 * Every log message is a JSON-serialisable object so downstream log shippers
 * (Datadog, Loki, CloudWatch Logs Insights) can index the fields:
 *
 * ```json
 * {
 *   "event":     "incoming_request",
 *   "traceId":   "3b9a4f2c-…",
 *   "method":    "GET",
 *   "path":      "/api/v1/streaks/leaderboard",
 *   "ip":        "1.2.3.4"
 * }
 * ```
 *
 * ```json
 * {
 *   "event":      "outgoing_response",
 *   "traceId":    "3b9a4f2c-…",
 *   "method":     "GET",
 *   "path":       "/api/v1/streaks/leaderboard",
 *   "statusCode": 200,
 *   "durationMs": 42
 * }
 * ```
 *
 * ## Registration
 *
 * Applied globally in `main.ts`:
 * ```ts
 * app.useGlobalInterceptors(new RequestTraceInterceptor());
 * ```
 */
@Injectable()
export class RequestTraceInterceptor implements NestInterceptor {
  private readonly logger = new Logger(RequestTraceInterceptor.name);
  private readonly sampleRate: number;

  constructor() {
    this.sampleRate = resolveSampleRate();
  }

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    // Only handle HTTP contexts (skip WebSocket, RPC, etc.)
    if (context.getType() !== 'http') {
      return next.handle();
    }

    const http = context.switchToHttp();
    const req = http.getRequest<Request & { traceId?: string }>();
    const res = http.getResponse<Response>();

    // ------------------------------------------------------------------
    // 1. Assign trace ID
    //    Honour an upstream trace ID (e.g. from a load balancer or API
    //    gateway) if one is already present in the request header, so
    //    that the full distributed trace chain is preserved.
    // ------------------------------------------------------------------
    const incomingTraceId = req.headers[TRACE_ID_HEADER.toLowerCase()];
    const traceId =
      typeof incomingTraceId === 'string' && incomingTraceId.length > 0
        ? incomingTraceId
        : uuidv4();

    req[TRACE_ID_PROPERTY] = traceId;
    req.headers[TRACE_ID_HEADER.toLowerCase()] = traceId;

    // Always set the response header regardless of sampling so clients can
    // always correlate their requests.
    res.setHeader(TRACE_ID_HEADER, traceId);

    // ------------------------------------------------------------------
    // 2. Sampling decision
    //    We make ONE random decision per request and honour it for both
    //    the start and end log entries so we never get an orphaned "end"
    //    log without a corresponding "start" (or vice-versa).
    // ------------------------------------------------------------------
    const shouldLog = this.sampleRate >= 1 || Math.random() < this.sampleRate;

    const method = req.method ?? 'UNKNOWN';
    const reqPath = req.path ?? req.url ?? '/';
    const ip =
      (req.headers['x-forwarded-for'] as string | undefined)?.split(',')[0]?.trim() ??
      req.socket?.remoteAddress ??
      'unknown';

    const startedAt = process.hrtime.bigint();

    // ------------------------------------------------------------------
    // 3. Log request start
    // ------------------------------------------------------------------
    if (shouldLog) {
      this.logger.log(
        JSON.stringify({
          event: 'incoming_request',
          traceId,
          method,
          path: reqPath,
          ip,
        }),
      );
    }

    // ------------------------------------------------------------------
    // 4. Log request end (via rxjs tap — fires on both success & error)
    // ------------------------------------------------------------------
    return next.handle().pipe(
      tap({
        next: () => {
          if (!shouldLog) return;
          const durationMs = Number(process.hrtime.bigint() - startedAt) / 1_000_000;
          const statusCode = res.statusCode;
          this.logger.log(
            JSON.stringify({
              event: 'outgoing_response',
              traceId,
              method,
              path: reqPath,
              statusCode,
              durationMs: Math.round(durationMs * 100) / 100,
            }),
          );
        },
        error: (err: Error & { status?: number; statusCode?: number }) => {
          if (!shouldLog) return;
          const durationMs = Number(process.hrtime.bigint() - startedAt) / 1_000_000;
          // NestJS exception filters set the status on the error object.
          const statusCode =
            err?.status ?? err?.statusCode ?? res.statusCode ?? 500;
          this.logger.error(
            JSON.stringify({
              event: 'outgoing_response',
              traceId,
              method,
              path: reqPath,
              statusCode,
              durationMs: Math.round(durationMs * 100) / 100,
              error: err?.message ?? 'Unknown error',
            }),
          );
        },
      }),
    );
  }
}
