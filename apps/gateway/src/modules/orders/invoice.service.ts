import { Injectable } from '@nestjs/common';
const PDFDocument = require('pdfkit');
import { Response } from 'express';
import { Order, OrderItem, Client } from '@prisma/client';

@Injectable()
export class InvoiceService {
  async generateInvoice(
    res: Response,
    order: Order & { items: OrderItem[]; client: Client },
    logoBase64?: string,
  ) {
    const doc = new PDFDocument({ margin: 50, size: 'A4' });

    // Configurar encabezados de respuesta para el PDF
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename=Factura_${order.id}.pdf`,
    );

    doc.pipe(res);

    // --- ENCABEZADO ---
    if (logoBase64) {
      try {
        const logoBuffer = Buffer.from(logoBase64, 'base64');
        doc.image(logoBuffer, 50, 45, { width: 60 });
      } catch (e) {
        console.error('Error cargando logo en PDF:', e.message);
      }
    }

    doc
      .fillColor('#444444')
      .fontSize(20)
      .text('FRESCOH! AGENTES', 120, 50, { align: 'left' })
      .fontSize(10)
      .text('FRESCOH! PRODUCTOS DEL CAMPO', 120, 75)
      .text('frescoh.col@gmail.com', 120, 90)
      .moveDown();

    doc
      .fontSize(12)
      .text(`Factura / Soporte #: ${order.id.slice(0, 8).toUpperCase()}`, 400, 50, { align: 'right' })
      .fontSize(10)
      .text(`Fecha: ${new Date(order.createdAt).toLocaleDateString()}`, 400, 65, { align: 'right' })
      .text(`Estado: ${order.status.toUpperCase()}`, 400, 80, { align: 'right' });

    doc.moveTo(50, 115).lineTo(550, 115).stroke();

    // --- INFORMACIÓN DEL CLIENTE ---
    doc
      .fontSize(12)
      .font('Helvetica-Bold')
      .text('CLIENTE', 50, 130)
      .font('Helvetica')
      .fontSize(10)
      .text(`Nombre: ${order.client.fullName || order.client.name}`, 50, 150)
      .text(`Teléfono: ${order.client.phone}`, 50, 165)
      .text(`Documento: ${order.client.documentType || 'CC'} ${order.client.documentNumber || '---'}`, 50, 180)
      .text(`Dirección: ${order.client.address || 'Pendiente'}`, 50, 195)
      .text(`Email: ${order.client.email || '---'}`, 50, 210);

    // --- TABLA DE PRODUCTOS ---
    let tableTop = 250;

    doc
      .font('Helvetica-Bold')
      .fontSize(10)
      .text('Producto', 50, tableTop)
      .text('Cant.', 280, tableTop, { width: 50, align: 'center' })
      .text('Precio Unit.', 330, tableTop, { width: 90, align: 'right' })
      .text('Total', 420, tableTop, { width: 100, align: 'right' });

    doc.moveTo(50, tableTop + 15).lineTo(550, tableTop + 15).stroke();

    let i = 0;
    order.items.forEach((item) => {
      const y = tableTop + 30 + i * 25;
      doc
        .font('Helvetica')
        .fontSize(10)
        .text(item.name, 50, y)
        .text(item.quantity.toString(), 280, y, { width: 50, align: 'center' })
        .text(this.formatCurrency(item.price), 330, y, { width: 90, align: 'right' })
        .text(this.formatCurrency(item.price * item.quantity), 420, y, { width: 100, align: 'right' });
      i++;
    });

    // --- TOTALES ---
    const subtotal = order.total - order.deliveryFee;
    const totalsY = tableTop + 50 + i * 25;

    doc.moveTo(330, totalsY).lineTo(550, totalsY).stroke();

    doc
      .font('Helvetica-Bold')
      .text('Subtotal:', 330, totalsY + 10, { width: 90, align: 'right' })
      .font('Helvetica')
      .text(this.formatCurrency(subtotal), 420, totalsY + 10, { width: 100, align: 'right' })
      
      .font('Helvetica-Bold')
      .text('Domicilio:', 330, totalsY + 25, { width: 90, align: 'right' })
      .font('Helvetica')
      .text(this.formatCurrency(order.deliveryFee), 420, totalsY + 25, { width: 100, align: 'right' })
      
      .fontSize(14)
      .fillColor('#005035')
      .font('Helvetica-Bold')
      .text('TOTAL A PAGAR:', 330, totalsY + 45, { width: 90, align: 'right' })
      .text(this.formatCurrency(order.total), 420, totalsY + 45, { width: 100, align: 'right' });

    // --- PIE DE PÁGINA ---
    doc
      .fillColor('#999999')
      .fontSize(8)
      .text(
        'Este documento es un soporte de venta generado automáticamente por el sistema de AGENTES de FRESCOH!. No constituye una factura electrónica de venta según normatividad DIAN a menos que se indique lo contrario.',
        50,
        750,
        { align: 'center', width: 500 },
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
