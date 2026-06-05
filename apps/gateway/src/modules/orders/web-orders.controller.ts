import { Controller, Post, Body, Logger } from '@nestjs/common';
import { OrdersService } from './orders.service';
import { IsString, IsArray, IsOptional, IsNumber, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

class OrderItemDto {
  @IsString()
  productId: string;

  @IsString()
  productName: string;

  @IsNumber()
  quantity: number;

  @IsNumber()
  price: number;
}

class CreateOrderDto {
  @IsString()
  clientId: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => OrderItemDto)
  items: OrderItemDto[];

  @IsOptional()
  @IsNumber()
  deliveryFee?: number;
}

@Controller('api/orders')
export class WebOrdersController {
  private readonly logger = new Logger(WebOrdersController.name);

  constructor(private readonly ordersService: OrdersService) {}

  @Post()
  async createOrder(@Body() createOrderDto: CreateOrderDto) {
    this.logger.log(`🌐 Received web order for client: ${createOrderDto.clientId}`);
    
    // Generar un ID provisional o delegar al servicio
    const orderId = `WEB-${Date.now()}`;
    
    try {
      const order = await this.ordersService.createOrder({
        orderId,
        clientId: createOrderDto.clientId,
        items: createOrderDto.items,
        deliveryFee: createOrderDto.deliveryFee,
      });

      return {
        success: true,
        orderId: order.id,
        message: 'Pedido creado exitosamente desde la web',
      };
    } catch (error: any) {
      this.logger.error(`❌ Error creating web order: ${error.message}`);
      return {
        success: false,
        message: error.message,
      };
    }
  }
}
