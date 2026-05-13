import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  NotFoundException,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { AgentsService } from './agents.service';
import { CreateAgentDto } from './dto/create-agent.dto';

@ApiTags('agentes')
@Controller('agents')
export class AgentsController {
  constructor(private readonly agentsService: AgentsService) {}

  @Post()
  @ApiOperation({ summary: 'Crear un nuevo agente' })
  @ApiResponse({ status: 201, description: 'Agente creado correctamente' })
  create(@Body() createAgentDto: CreateAgentDto) {
    return this.agentsService.create(
      createAgentDto.name,
      createAgentDto.systemPrompt,
      createAgentDto.tools,
    );
  }

  @Get()
  @ApiOperation({ summary: 'Listar todos los agentes' })
  findAll() {
    return this.agentsService.findAll();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Obtener un agente por ID' })
  async findOne(@Param('id') id: string) {
    const agent = await this.agentsService.findOne(id);
    if (!agent) {
      throw new NotFoundException(`Agente con ID ${id} no encontrado`);
    }
    return agent;
  }
}
