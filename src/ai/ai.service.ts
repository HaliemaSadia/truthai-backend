import { Inject, Injectable, InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GoogleGenAI } from '@google/genai';

@Injectable()
export class AiService {
  private readonly client: GoogleGenAI;

  constructor(@Inject(ConfigService) private readonly configService: ConfigService) {
    const apiKey = this.configService.get<string>('GEMINI_API_KEY');

    if (!apiKey) {
      throw new Error('GEMINI_API_KEY is missing. Add it to your .env file.');
    }

    this.client = new GoogleGenAI({ apiKey });
  }

  async chat(prompt: string): Promise<string> {
    try {
      const result = await this.client.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: prompt,
      });

      return result.text ?? '';
    } catch (error) {
      throw new InternalServerErrorException(
        'Failed to generate a response from Gemini.',
      );
    }
  }
}
