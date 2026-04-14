import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsArray, IsOptional } from 'class-validator';

export class CreateAgentDto {
  @ApiProperty({ example: 'Ventas Bot' })
  @IsString()
  name: string;

  @ApiProperty({ example: 'Eres un asistente de ventas...' })
  @IsString()
  systemPrompt: string;

  @ApiProperty({ example: ['google_sheets', 'gmail'], isArray: true })
  @IsArray()
  @IsString({ each: true })
  tools: string[];

  @ApiProperty({ required: false })
  @IsOptional()
  config?: Record<string, any>;
}
