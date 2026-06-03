import { Injectable } from '@nestjs/common';
const PDFDocument = require('pdfkit');
import { Response } from 'express';
import { Order, OrderItem, Client } from '@prisma/client';

@Injectable()
export class InvoiceService {
  private readonly colors = {
    dark: '#005035',
    lime: '#B5F543',
    gray: '#4B5563',
    lightGray: '#F3F4F6',
    border: '#E5E7EB',
  };

  async generateInvoice(
    res: Response,
    order: Order & { items: OrderItem[]; client: Client },
    logoBase64?: string,
  ) {
    // Media Carta (5.5" x 8.5") = 396 x 612 puntos
    const doc = new PDFDocument({ margin: 0, size: [396, 612] });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename=Recibo_Frescoh_${order.id.slice(-6)}.pdf`,
    );

    doc.pipe(res);

    // --- FONDO Y CABECERA ---
    // Barra lateral de acento (más delgada para media carta)
    doc.rect(0, 0, 10, 612).fill(this.colors.dark);

    // Bloque de cabecera derecho (ajustado para 396px de ancho)
    doc.rect(260, 0, 136, 100).fill(this.colors.dark);

    // Logo (escalado para media carta)
    if (logoBase64) {
      try {
        const logoBuffer = Buffer.from(logoBase64, 'base64');
        doc.image(logoBuffer, 30, 30, { width: 50 });
      } catch (e) {
        console.error('Error cargando logo en PDF:', e.message);
      }
    }

    // Nombre Empresa
    doc
      .fillColor(this.colors.dark)
      .font('Helvetica-Bold')
      .fontSize(18)
      .text('FRESCOH!', 95, 35)
      .fontSize(8)
      .font('Helvetica')
      .text('PRODUCTOS DEL CAMPO', 95, 55)
      .text('frescoh.col@gmail.com', 95, 65);

    // Datos Factura (en el bloque oscuro, sin superposición)
    doc
      .fillColor('#FFFFFF')
      .font('Helvetica-Bold')
      .fontSize(9)
      .text('RECIBO DE VENTA', 275, 30)
      .fontSize(16)
      .text(`#${order.id.slice(-6).toUpperCase()}`, 275, 45)
      .fontSize(8)
      .font('Helvetica')
      .text(`FECHA: ${new Date(order.createdAt).toLocaleDateString('es-CO')}`, 275, 75);

    // --- SECCIÓN CLIENTE (SIMPLIFICADA) ---
    const clientY = 125;
    doc
      .fillColor(this.colors.gray)
      .font('Helvetica-Bold')
      .fontSize(8)
      .text('CLIENTE:', 30, clientY)
      .fillColor('#000000')
      .fontSize(11)
      .text(order.client.fullName || order.client.name, 30, clientY + 12);
    
    let currentY = clientY + 28;
    
    doc
      .fillColor(this.colors.gray)
      .font('Helvetica')
      .fontSize(9)
      .text(`TELÉFONO: ${order.client.phone}`, 30, currentY);
    
    currentY += 12;

    if (order.client.documentNumber) {
      doc.text(`DOC: ${order.client.documentType || 'CC'} ${order.client.documentNumber}`, 30, currentY);
      currentY += 12;
    }

    // Estado del Pedido (Badge compacto)
    const statusColor = order.status === 'delivered' ? '#10B981' : '#F59E0B';
    doc
      .rect(275, clientY + 5, 100, 20)
      .fill(statusColor);
    
    doc
      .fillColor('#FFFFFF')
      .font('Helvetica-Bold')
      .fontSize(8)
      .text(order.status.toUpperCase(), 275, clientY + 11, { width: 100, align: 'center' });

    // --- TABLA DE PRODUCTOS (AJUSTADA) ---
    const tableTop = 200;
    
    // Encabezado Tabla
    doc.rect(30, tableTop, 336, 20).fill(this.colors.lightGray);
    doc
      .fillColor(this.colors.dark)
      .font('Helvetica-Bold')
      .fontSize(8)
      .text('DESCRIPCIÓN', 40, tableTop + 6)
      .text('CANT', 190, tableTop + 6, { width: 30, align: 'center' })
      .text('UNITARIO', 230, tableTop + 6, { width: 60, align: 'right' })
      .text('TOTAL', 300, tableTop + 6, { width: 60, align: 'right' });

    let y = tableTop + 20;
    order.items.forEach((item) => {
      doc.moveTo(30, y).lineTo(366, y).strokeColor(this.colors.border).lineWidth(0.5).stroke();
      
      doc
        .fillColor('#000000')
        .font('Helvetica')
        .fontSize(9)
        .text(item.name, 40, y + 8, { width: 140, height: 20, ellipsis: true })
        .text(item.quantity.toString(), 190, y + 8, { width: 30, align: 'center' })
        .text(this.formatCurrency(item.price), 230, y + 8, { width: 60, align: 'right' })
        .text(this.formatCurrency(item.price * item.quantity), 300, y + 8, { width: 60, align: 'right' });
      
      y += 25;
    });

    // --- SECCIÓN TOTALES (COMPACTA) ---
    const totalsY = Math.max(y + 15, 480);
    const subtotal = order.total - order.deliveryFee;

    doc.rect(230, totalsY, 136, 80).fill(this.colors.lightGray);

    doc
      .fillColor(this.colors.gray)
      .font('Helvetica')
      .fontSize(9)
      .text('SUBTOTAL', 240, totalsY + 12)
      .text(this.formatCurrency(subtotal), 300, totalsY + 12, { width: 60, align: 'right' })
      
      .text('DOMICILIO', 240, totalsY + 28)
      .text(this.formatCurrency(order.deliveryFee), 300, totalsY + 28, { width: 60, align: 'right' });

    doc
      .rect(230, totalsY + 45, 136, 35)
      .fill(this.colors.dark);

    doc
      .fillColor(this.colors.lime)
      .font('Helvetica-Bold')
      .fontSize(10)
      .text('TOTAL', 240, totalsY + 58)
      .fontSize(11)
      .text(this.formatCurrency(order.total), 300, totalsY + 57, { width: 60, align: 'right' });

    // --- NOTAS Y PIE ---
    doc
      .fillColor(this.colors.gray)
      .font('Helvetica-Bold')
      .fontSize(8)
      .text('GRACIAS POR TU COMPRA', 30, totalsY + 12)
      .font('Helvetica')
      .fontSize(7)
      .text('Tu apoyo fortalece el campo.', 30, totalsY + 22, { width: 180 })
      .text('FRESCOH! - AGENTES', 30, totalsY + 45);

    doc
      .fillColor('#999999')
      .fontSize(6)
      .text(
        'Soporte digital generado por J.A.R.V.I.S. para FRESCOH!',
        0,
        590,
        { align: 'center', width: 396 },
      );

    doc.end();
  }

  private formatCurrency(value: number) {
    return new Intl.NumberFormat('es-CO', {
      style: 'currency',
      currency: 'COP',
      minimumFractionDigits: 0,
    }).format(value);
  }
}
