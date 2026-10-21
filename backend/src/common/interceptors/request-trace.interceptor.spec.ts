import { ExecutionContext, Logger } from '@nestjs/common';
import { lastValueFrom, of, throwError } from 'rxjs';
import {
  TRACE_ID_HEADER,
  TRACE_ID_PROPERTY,
  RequestTraceInterceptor,
} from './request-trace.interceptor';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** UUID v4 regex used for assertions */
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

interface MockRequest {
  method: string;
  path: string;
  url: string;
  headers: Record<string, string>;
  socket: { remoteAddress: string };
  [key: string]: unknown;
}

interface MockResponse {
  statusCode: number;
  headers: Record<string, string>;
  setHeader: jest.Mock<void, [string, string]>;
}

function makeMockContext(
  reqOverrides: Partial<MockRequest> = {},
  resOverrides: Partial<MockResponse> = {},
): ExecutionContext {
  const req: MockRequest = {
    method: 'GET',
    path: '/api/v1/streaks/leaderboard',
    url: '/api/v1/streaks/leaderboard',
    headers: {},
    socket: { remoteAddress: '127.0.0.1' },
    ...reqOverrides,
  };

  const res: MockResponse = {
    statusCode: 200,
    headers: {},
    setHeader: jest.fn((name: string, value: string) => {
      res.headers[name] = value;
    }),
    ...resOverrides,
  };

  const httpContext = {
    getRequest: () => req,
    getResponse: () => res,
  };

  return {
    getType: () => 'http',
    switchToHttp: () => httpContext,
  } as unknown as ExecutionContext;
}

function makeCallHandler(returnValue: unknown = { ok: true }) {
  return { handle: () => of(returnValue) };
}

function makeErrorCallHandler(err: Error) {
  return { handle: () => throwError(() => err) };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('RequestTraceInterceptor', () => {
  let interceptor: RequestTraceInterceptor;
  let logSpy: jest.SpyInstance;
  let errorSpy: jest.SpyInstance;

  beforeEach(() => {
    // Reset LOG_SAMPLE_RATE so tests run with default (1 = log everything)
    delete process.env['LOG_SAMPLE_RATE'];
    interceptor = new RequestTraceInterceptor();

    // Silence actual logger output in tests while still capturing calls
    logSpy = jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    errorSpy = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  // ---- Trace ID assignment -------------------------------------------

  describe('trace ID generation', () => {
    it('generates a UUID v4 trace ID when none is present in the request', async () => {
      const ctx = makeMockContext();
      const req = ctx.switchToHttp().getRequest<MockRequest>();
      await lastValueFrom(interceptor.intercept(ctx, makeCallHandler()));
      expect(req[TRACE_ID_PROPERTY]).toMatch(UUID_RE);
    });

    it('reuses an upstream trace ID if present in the request header', async () => {
      const upstreamId = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
      const ctx = makeMockContext({
        headers: { [TRACE_ID_HEADER.toLowerCase()]: upstreamId },
      });
      const req = ctx.switchToHttp().getRequest<MockRequest>();
      await lastValueFrom(interceptor.intercept(ctx, makeCallHandler()));
      expect(req[TRACE_ID_PROPERTY]).toBe(upstreamId);
    });

    it('sets the trace ID response header on every request', async () => {
      const ctx = makeMockContext();
      const res = ctx.switchToHttp().getResponse<MockResponse>();
      await lastValueFrom(interceptor.intercept(ctx, makeCallHandler()));
      expect(res.setHeader).toHaveBeenCalledWith(TRACE_ID_HEADER, expect.stringMatching(UUID_RE));
    });

    it('assigns different trace IDs to successive requests', async () => {
      const ctx1 = makeMockContext();
      const ctx2 = makeMockContext();
      await lastValueFrom(interceptor.intercept(ctx1, makeCallHandler()));
      await lastValueFrom(interceptor.intercept(ctx2, makeCallHandler()));
      const id1 = ctx1.switchToHttp().getRequest<MockRequest>()[TRACE_ID_PROPERTY];
      const id2 = ctx2.switchToHttp().getRequest<MockRequest>()[TRACE_ID_PROPERTY];
      expect(id1).not.toBe(id2);
    });
  });

  // ---- Logging ----------------------------------------------------------

  describe('logging', () => {
    it('logs an incoming_request event on the request start', async () => {
      const ctx = makeMockContext({ method: 'GET', path: '/api/v1/test' });
      await lastValueFrom(interceptor.intercept(ctx, makeCallHandler()));

      expect(logSpy).toHaveBeenCalledWith(
        expect.stringContaining('"event":"incoming_request"'),
      );
    });

    it('logs an outgoing_response event after the handler completes', async () => {
      const ctx = makeMockContext();
      await lastValueFrom(interceptor.intercept(ctx, makeCallHandler()));

      expect(logSpy).toHaveBeenCalledWith(
        expect.stringContaining('"event":"outgoing_response"'),
      );
    });

    it('includes method and path in logged JSON', async () => {
      const ctx = makeMockContext({
        method: 'POST',
        path: '/api/v1/auth/login',
        url: '/api/v1/auth/login',
      });
      await lastValueFrom(interceptor.intercept(ctx, makeCallHandler()));

      const incomingCall = logSpy.mock.calls.find((args: string[]) =>
        (args[0] as string).includes('incoming_request'),
      );
      expect(incomingCall).toBeDefined();
      const parsed = JSON.parse(incomingCall![0] as string);
      expect(parsed.method).toBe('POST');
      expect(parsed.path).toBe('/api/v1/auth/login');
    });

    it('includes the same traceId in both start and end log entries', async () => {
      const ctx = makeMockContext();
      await lastValueFrom(interceptor.intercept(ctx, makeCallHandler()));

      const calls = logSpy.mock.calls.map((args: unknown[]) => JSON.parse(args[0] as string));
      const traceIds = calls.map((c: { traceId: string }) => c.traceId);
      expect(traceIds[0]).toBe(traceIds[1]);
      expect(traceIds[0]).toMatch(UUID_RE);
    });

    it('includes durationMs in the outgoing_response log', async () => {
      const ctx = makeMockContext();
      await lastValueFrom(interceptor.intercept(ctx, makeCallHandler()));

      const outgoing = logSpy.mock.calls
        .map((args: unknown[]) => JSON.parse(args[0] as string))
        .find((e: { event: string }) => e.event === 'outgoing_response');

      expect(outgoing).toBeDefined();
      expect(typeof outgoing!.durationMs).toBe('number');
      expect(outgoing!.durationMs).toBeGreaterThanOrEqual(0);
    });

    it('logs errors via logger.error when the handler throws', async () => {
      const ctx = makeMockContext();
      const err = new Error('something blew up');

      await expect(
        lastValueFrom(interceptor.intercept(ctx, makeErrorCallHandler(err))),
      ).rejects.toThrow('something blew up');

      expect(errorSpy).toHaveBeenCalledWith(
        expect.stringContaining('"event":"outgoing_response"'),
      );
      const [errArg] = errorSpy.mock.calls[0] as [string];
      const parsed = JSON.parse(errArg);
      expect(parsed.error).toBe('something blew up');
    });
  });

  // ---- Log sampling -----------------------------------------------------

  describe('log sampling', () => {
    beforeEach(() => {
      jest.restoreAllMocks();
      logSpy = jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
      errorSpy = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    });

    it('skips logging when LOG_SAMPLE_RATE=0', async () => {
      process.env['LOG_SAMPLE_RATE'] = '0';
      interceptor = new RequestTraceInterceptor();
      const ctx = makeMockContext();
      await lastValueFrom(interceptor.intercept(ctx, makeCallHandler()));
      expect(logSpy).not.toHaveBeenCalled();
    });

    it('always logs when LOG_SAMPLE_RATE=1', async () => {
      process.env['LOG_SAMPLE_RATE'] = '1';
      interceptor = new RequestTraceInterceptor();
      const ctx = makeMockContext();
      await lastValueFrom(interceptor.intercept(ctx, makeCallHandler()));
      // Two log calls: incoming_request + outgoing_response
      expect(logSpy).toHaveBeenCalledTimes(2);
    });

    it('clamps LOG_SAMPLE_RATE values above 1 to 1', async () => {
      process.env['LOG_SAMPLE_RATE'] = '99';
      interceptor = new RequestTraceInterceptor();
      const ctx = makeMockContext();
      await lastValueFrom(interceptor.intercept(ctx, makeCallHandler()));
      expect(logSpy).toHaveBeenCalledTimes(2);
    });

    it('clamps LOG_SAMPLE_RATE values below 0 to 0 (no logs)', async () => {
      process.env['LOG_SAMPLE_RATE'] = '-5';
      interceptor = new RequestTraceInterceptor();
      const ctx = makeMockContext();
      await lastValueFrom(interceptor.intercept(ctx, makeCallHandler()));
      expect(logSpy).not.toHaveBeenCalled();
    });

    it('falls back to sampleRate=1 for non-numeric LOG_SAMPLE_RATE', async () => {
      process.env['LOG_SAMPLE_RATE'] = 'invalid';
      interceptor = new RequestTraceInterceptor();
      const ctx = makeMockContext();
      await lastValueFrom(interceptor.intercept(ctx, makeCallHandler()));
      expect(logSpy).toHaveBeenCalledTimes(2);
    });
  });

  // ---- Non-HTTP contexts ------------------------------------------------

  describe('non-HTTP contexts', () => {
    it('passes through non-HTTP contexts without modification', async () => {
      const wsCtx = {
        getType: () => 'ws',
        switchToHttp: () => { throw new Error('should not be called'); },
      } as unknown as ExecutionContext;

      const result = await lastValueFrom(
        interceptor.intercept(wsCtx, makeCallHandler({ ws: true })),
      );
      expect(result).toEqual({ ws: true });
      expect(logSpy).not.toHaveBeenCalled();
    });
  });

  // ---- Response header always set ---------------------------------------

  describe('response header', () => {
    it('still sets X-Trace-Id header even when sampling rate is 0', async () => {
      process.env['LOG_SAMPLE_RATE'] = '0';
      interceptor = new RequestTraceInterceptor();
      const ctx = makeMockContext();
      const res = ctx.switchToHttp().getResponse<MockResponse>();
      await lastValueFrom(interceptor.intercept(ctx, makeCallHandler()));
      expect(res.setHeader).toHaveBeenCalledWith(
        TRACE_ID_HEADER,
        expect.stringMatching(UUID_RE),
      );
    });
  });

  // ---- IP extraction ---------------------------------------------------

  describe('IP address extraction', () => {
    it('uses x-forwarded-for header when present', async () => {
      const ctx = makeMockContext({
        headers: { 'x-forwarded-for': '203.0.113.1, 10.0.0.1' },
      });
      await lastValueFrom(interceptor.intercept(ctx, makeCallHandler()));

      const incomingCall = logSpy.mock.calls.find((args: unknown[]) =>
        (args[0] as string).includes('incoming_request'),
      );
      const parsed = JSON.parse(incomingCall![0] as string);
      expect(parsed.ip).toBe('203.0.113.1');
    });

    it('falls back to socket.remoteAddress when x-forwarded-for is absent', async () => {
      const ctx = makeMockContext({
        socket: { remoteAddress: '192.168.1.42' },
      });
      await lastValueFrom(interceptor.intercept(ctx, makeCallHandler()));

      const incomingCall = logSpy.mock.calls.find((args: unknown[]) =>
        (args[0] as string).includes('incoming_request'),
      );
      const parsed = JSON.parse(incomingCall![0] as string);
      expect(parsed.ip).toBe('192.168.1.42');
    });
  });
});
