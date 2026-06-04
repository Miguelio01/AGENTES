import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  Render,
  UseGuards,
  Query,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { ClientsService } from './clients.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { LOGO_BASE64 } from '../metrics/logo-base64';

@Controller('admin/clients')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
export class ClientsAdminController {
  private readonly logger = new Logger(ClientsAdminController.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly clientsService: ClientsService,
  ) {}

  @Get()
  @Render('clients')
  async getClientsPage(@Query('search') search?: string) {
    // ... (keep search logic)
    const whereClause = search
      ? {
          OR: [
            { name: { contains: search } },
            { fullName: { contains: search } },
            { phone: { contains: search } },
            { documentNumber: { contains: search } },
          ],
        }
      : {};

    const clients = await this.prisma.client.findMany({
      where: whereClause,
      orderBy: { updatedAt: 'desc' },
      include: {
        _count: {
          select: { orders: true },
        },
      },
    });

    return {
      title: 'Gestión de Clientes - Frescoh!',
      clients,
      logo: LOGO_BASE64,
      search,
    };
  }

  @Patch('api/:id')
  async updateClient(@Param('id') id: string, @Body() data: any) {
    try {
      // 1. Actualizar en SQLite (Prisma) para el dashboard
      const updated = await this.prisma.client.update({
        where: { id },
        data: {
          fullName: data.fullName,
          email: data.email,
          address: data.address,
          city: data.city,
          documentType: data.documentType,
          documentNumber: data.documentNumber,
          registrationSource: data.registrationSource,
        },
      });

      // 2. Sincronizar con MongoDB (ClientsService) para el Orquestador
      const mongoClient = await this.clientsService.findByPhone(updated.phone);
      if (mongoClient) {
        mongoClient.updateProfile({
          fullName: data.fullName,
          email: data.email,
          address: data.address,
          city: data.city,
          documentType: data.documentType,
          documentNumber: data.documentNumber,
        });
        await this.clientsService.save(mongoClient);
        this.logger.log(`✅ Cliente sincronizado en MongoDB: ${updated.phone}`);
      }

      return { status: 'SUCCESS', client: updated };
    } catch (e) {
      this.logger.error(`❌ Error actualizando cliente: ${e.message}`);
      return { status: 'ERROR', message: e.message };
    }
  }
}
