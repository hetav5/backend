import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { BullModule } from '@nestjs/bullmq';
import { PrismaModule } from './prisma/prisma.module';
import { SegmentsModule } from './segments/segments.module';
import { CustomersModule } from './customers/customers.module';
import { CampaignsModule } from './campaigns/campaigns.module';
import { CommsModule } from './comms/comms.module';
import { ReceiptsModule } from './receipts/receipts.module';
import { AgentModule } from './agent/agent.module';
import { DashboardModule } from './dashboard/dashboard.module';
import { OrdersModule } from './orders/orders.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    BullModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        // Prefer a single REDIS_URL (Railway/Upstash give one, with auth).
        // Parse it into plain ioredis options. BullMQ requires
        // maxRetriesPerRequest: null; family: 0 enables IPv6 (Railway's private
        // network). Fall back to host/port for local dev.
        const url = config.get<string>('REDIS_URL');
        if (url) {
          const u = new URL(url);
          return {
            connection: {
              host: u.hostname,
              port: Number(u.port || 6379),
              username: u.username || undefined,
              password: u.password || undefined,
              family: 0,
              maxRetriesPerRequest: null,
              ...(u.protocol === 'rediss:' ? { tls: {} } : {}),
            },
          };
        }
        return {
          connection: {
            host: config.get<string>('REDIS_HOST', 'localhost'),
            port: Number(config.get<string>('REDIS_PORT', '6379')),
            maxRetriesPerRequest: null,
          },
        };
      },
    }),
    PrismaModule,
    SegmentsModule,
    CustomersModule,
    CampaignsModule,
    CommsModule,
    ReceiptsModule,
    AgentModule,
    DashboardModule,
    OrdersModule,
  ],
})
export class AppModule {}
