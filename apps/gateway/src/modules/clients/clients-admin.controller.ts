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
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { LOGO_BASE64 } from '../metrics/logo-base64';

@Controller('admin/clients')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
export class ClientsAdminController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  @Render('clients')
  async getClientsPage(@Query('search') search?: string) {
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
  async updateClient(
    @Param('id') id: string,
    @Body() data: any,
  ) {
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
    return { status: 'SUCCESS', client: updated };
  }
}
