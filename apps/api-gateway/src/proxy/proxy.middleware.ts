/**
 * @file Path-based HTTP reverse proxy routing requests to backend microservices.
 * @module @ghostless/api-gateway
 */

import { Injectable, NestMiddleware } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Request, Response, NextFunction } from 'express';
import { createProxyMiddleware } from 'http-proxy-middleware';

/** Route prefix paired with its pre-built proxy handler. */
type ProxyRoute = {
  prefix: string;
  middleware: ReturnType<typeof createProxyMiddleware>;
};

/**
 * Dispatches incoming HTTP requests to auth, user, chat, or matching services
 * based on path prefix and method-specific rules.
 */
@Injectable()
export class ProxyMiddleware implements NestMiddleware {
  private readonly proxies: ProxyRoute[];

  constructor(config: ConfigService) {
    const routes: Array<{ prefix: string; target: string }> = [
      { prefix: '/auth', target: config.get('AUTH_SERVICE_URL', 'http://localhost:3001') },
      { prefix: '/users', target: config.get('USER_SERVICE_URL', 'http://localhost:3002') },
      { prefix: '/internal/users', target: config.get('USER_SERVICE_URL', 'http://localhost:3002') },
      { prefix: '/matches', target: config.get('CHAT_SERVICE_URL', 'http://localhost:3003') },
      { prefix: '/discovery', target: config.get('MATCHING_SERVICE_URL', 'http://localhost:3005') },
    ];

    // Default prefix routes; matching also owns some /matches paths (see use())
    this.proxies = routes.map(({ prefix, target }) => ({
      prefix,
      middleware: createProxyMiddleware({
        target,
        changeOrigin: true,
        pathRewrite: (path) => path,
      }),
    }));
  }

  /**
   * Resolves the target service for `req.path` and forwards the request.
   *
   * @param req - Incoming Express request
   * @param res - Express response
   * @param next - Continues to gateway handlers when no proxy matches
   */
  use(req: Request, res: Response, next: NextFunction): void {
    const path = req.path;

    // Gateway-local routes
    if (path === '/health' || path.startsWith('/docs')) {
      next();
      return;
    }

    // GET /matches (list) and POST /matches/interest → matching-service
    if (
      (path === '/matches' && req.method === 'GET') ||
      path.startsWith('/discovery') ||
      (path.startsWith('/matches/') && path.includes('/interest'))
    ) {
      const target = process.env.MATCHING_SERVICE_URL ?? 'http://localhost:3005';
      void createProxyMiddleware({ target, changeOrigin: true })(req, res, next);
      return;
    }

    // /matches/:id/messages → chat-service
    if (path.includes('/messages')) {
      const target = process.env.CHAT_SERVICE_URL ?? 'http://localhost:3003';
      void createProxyMiddleware({ target, changeOrigin: true })(req, res, next);
      return;
    }

    const match = this.proxies.find((p) => path.startsWith(p.prefix));
    if (match) {
      void match.middleware(req, res, next);
      return;
    }
    next();
  }
}
