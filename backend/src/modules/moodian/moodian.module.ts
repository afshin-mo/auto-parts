import { Module } from '@nestjs/common';
import { MoodianService } from './moodian.service';
import { MoodianController } from './moodian.controller';

@Module({ controllers: [MoodianController], providers: [MoodianService], exports: [MoodianService] })
export class MoodianModule { }
