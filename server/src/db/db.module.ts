import { Module, Global } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as mysql from 'mysql2/promise';

export const DB_POOL = 'DB_POOL';

@Global()
@Module({
  providers: [
    {
      provide: DB_POOL,
      inject: [ConfigService],
      useFactory: (config: ConfigService) =>
        mysql.createPool({
          host: config.get<string>('DB_HOST', '127.0.0.1'),
          port: config.get<number>('DB_PORT', 3306),
          database: config.get<string>('DB_NAME', 'lost_ark'),
          user: config.get<string>('DB_USER', 'root'),
          password: config.get<string>('DB_PASS', ''),
          charset: 'utf8mb4',
          waitForConnections: true,
          connectionLimit: 10,
          timezone: '+09:00',
        }),
    },
  ],
  exports: [DB_POOL],
})
export class DbModule {}
