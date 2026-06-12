import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { DispatchController } from './dispatch.controller';
import { SimulatorService } from './simulator.service';

@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true })],
  controllers: [DispatchController],
  providers: [SimulatorService],
})
export class AppModule {}
