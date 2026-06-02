import {
  Controller,
  Get,
  UseGuards,
  Req,
  Res,
  Logger,
  Render,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { AuthService } from './auth.service';
import type { Response } from 'express';

@Controller('auth')
export class AuthController {
  private readonly logger = new Logger(AuthController.name);

  constructor(private readonly authService: AuthService) {}

  @Get('login')
  @Render('login')
  loginPage() {
    return { title: 'Iniciar Sesión - Frescoh!' };
  }

  @Get('google')
  @UseGuards(AuthGuard('google'))
  async googleAuth(@Req() req) {
    // Inicia el flujo de Google
  }

  @Get('google/callback')
  @UseGuards(AuthGuard('google'))
  async googleAuthRedirect(@Req() req, @Res() res: Response) {
    const { access_token } = await this.authService.login(req.user);
    
    // Guardar token en cookie HttpOnly
    res.cookie('jwt', access_token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 días
    });

    // Redirigir según el rol
    if (req.user.role === 'ADMIN') {
      return res.redirect('/admin/inventory');
    } else {
      return res.redirect('/admin/orders/new');
    }
  }

  @Get('logout')
  logout(@Res() res: Response) {
    res.clearCookie('jwt');
    return res.redirect('/auth/login');
  }
}
