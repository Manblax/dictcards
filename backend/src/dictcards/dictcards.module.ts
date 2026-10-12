import { Module } from '@nestjs/common';
import { DictcardsService } from './dictcards.service';
import { DictcardsController } from './dictcards.controller';

@Module({
  controllers: [DictcardsController],
  providers: [DictcardsService],
})
export class DictcardsModule {}
