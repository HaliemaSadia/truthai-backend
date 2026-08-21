import { Body, Controller, Inject, Post, ValidationPipe } from '@nestjs/common';
import { AiService } from './ai.service';
import { ChatDto } from './dto/chat.dto';

@Controller('ai')
export class AiController {
  constructor(@Inject(AiService) private readonly aiService: AiService) {}

  @Post('chat')
  async chat(
    @Body(
      new ValidationPipe({
        expectedType: ChatDto,
        forbidNonWhitelisted: true,
        transform: true,
        whitelist: true,
      }),
    )
    chatDto: ChatDto,
  ): Promise<{ response: string }> {
    const response = await this.aiService.chat(chatDto.prompt);

    return { response };
  }
}
