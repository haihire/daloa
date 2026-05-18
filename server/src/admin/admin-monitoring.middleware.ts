import { Injectable, NestMiddleware } from '@nestjs/common';
import { NextFunction, Request, Response } from 'express';
import { AdminMonitoringService } from './admin-monitoring.service';

@Injectable()
export class AdminMonitoringMiddleware implements NestMiddleware {
  constructor(private readonly monitoring: AdminMonitoringService) {}

  use(req: Request, res: Response, next: NextFunction) {
    const started = process.hrtime.bigint();
    res.on('finish', () => {
      const ended = process.hrtime.bigint();
      void this.monitoring
        .recordRequest({
          scope: 'route',
          name: req.path,
          method: req.method,
          path: req.path,
          statusCode: res.statusCode,
          durationMs: Number(ended - started) / 1_000_000,
        })
        .catch(() => undefined);
    });
    next();
  }
}
