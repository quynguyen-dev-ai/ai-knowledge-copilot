import { Body, Controller, Get, Module, Post, Res, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiProperty, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { IsString, MaxLength, MinLength } from 'class-validator';
import type { Response } from 'express';
import { JwtPayload } from '../auth/auth.service';
import { CurrentUser, JwtGuard } from '../auth/jwt.guard';
import { AiClient } from '../common/ai-client.service';
import { ChatService } from './chat.service';

class AskDto {
  @ApiProperty({ example: 'How many vacation days do we get?' })
  @IsString()
  @MinLength(1)
  @MaxLength(4000)
  question: string;
}

@ApiTags('chat')
@ApiBearerAuth()
@UseGuards(JwtGuard)
@Controller('chat')
export class ChatController {
  constructor(private readonly chat: ChatService) {}

  @Get('history')
  history(@CurrentUser() user: JwtPayload) {
    return this.chat.history(user.workspaceId);
  }

  /** Answers a question as a Server-Sent Events stream (sources → tokens → done). */
  @Post('ask')
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  async ask(@CurrentUser() user: JwtPayload, @Body() dto: AskDto, @Res() res: Response) {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('X-Accel-Buffering', 'no');
    try {
      for await (const chunk of this.chat.ask(user.workspaceId, dto.question)) {
        res.write(chunk);
      }
    } catch (err) {
      res.write(`event: error\ndata: ${JSON.stringify(String((err as Error).message ?? err))}\n\n`);
    } finally {
      res.end();
    }
  }
}

@Module({
  controllers: [ChatController],
  providers: [ChatService, AiClient],
})
export class ChatModule {}
