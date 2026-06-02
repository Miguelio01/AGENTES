import { Controller, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';

@Controller('sessions')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
export class SessionsController {
}
