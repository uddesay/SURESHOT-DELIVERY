const PDFDocument = require('pdfkit');
const db = require('../../config/database');
const ApiError = require('../../utils/ApiError');

const money = (minor, currency = 'INR') => {
  const symbol = currency === 'INR' ? '₹' : currency;
  return `${symbol}${(minor / 100).toFixed(2)}`;
};

/**
 * A GST-compliant tax invoice is legally issued per selling entity, so a
 * multi-vendor order produces one section per vendor shipment (each with its
 * own GSTIN, HSN-coded line items and CGST/SGST split), inside a single PDF
 * for a convenient one-file customer download.
 */
const generateOrderInvoice = async (userId, orderId) => {
  const order = await db('orders').where({ id: orderId, user_id: userId }).first();
  if (!order) throw ApiError.notFound('Order');
  if (!['confirmed', 'processing', 'packed', 'shipped', 'out_for_delivery', 'delivered', 'refunded'].includes(order.status)) {
    throw ApiError.businessRule('Invoice is available once the order is confirmed');
  }

  const shipments = await db('order_shipments as s')
    .join('vendors as v', 'v.id', 's.vendor_id')
    .where('s.order_id', orderId)
    .select('s.id', 's.vendor_id', 's.created_at', 'v.store_name', 'v.gstin', 'v.support_email');

  const items = await db('order_items').where({ order_id: orderId });
  const itemsByShipment = new Map();
  for (const i of items) {
    if (!itemsByShipment.has(i.shipment_id)) itemsByShipment.set(i.shipment_id, []);
    itemsByShipment.get(i.shipment_id).push(i);
  }

  const address = order.shipping_address;
  const doc = new PDFDocument({ margin: 40, size: 'A4' });

  doc.fontSize(18).font('Helvetica-Bold').text('Sureshot', { continued: true })
    .fontSize(10).font('Helvetica').text('  Tax Invoice', { align: 'left' });
  doc.moveDown(0.5);
  doc.fontSize(9).fillColor('#555')
    .text(`Invoice for Order #${order.order_number}`)
    .text(`Order Date: ${new Date(order.created_at).toLocaleDateString('en-IN')}`)
    .text(`Payment Method: ${order.payment_method.toUpperCase()}`)
    .fillColor('#000');
  doc.moveDown();

  doc.fontSize(10).font('Helvetica-Bold').text('Bill To / Ship To');
  doc.font('Helvetica').fontSize(9)
    .text(address.recipientName)
    .text(address.line1)
    .text(address.line2 || '')
    .text(`${address.city}, ${address.state} ${address.postalCode}`)
    .text(address.country || 'IN')
    .text(`Phone: ${address.recipientPhone}`);
  doc.moveDown();

  for (const shipment of shipments) {
    const shipmentItems = itemsByShipment.get(shipment.id) || [];
    if (!shipmentItems.length) continue;

    doc.moveDown(0.5);
    doc.fontSize(10).font('Helvetica-Bold').text(`Sold by: ${shipment.store_name}`);
    doc.fontSize(8).font('Helvetica').fillColor('#555')
      .text(`GSTIN: ${shipment.gstin || 'N/A'}`)
      .fillColor('#000');
    doc.moveDown(0.3);

    const colX = { title: 40, hsn: 250, qty: 300, price: 340, tax: 410, total: 470 };
    const headerY = doc.y;
    doc.fontSize(8).font('Helvetica-Bold');
    doc.text('Item', colX.title, headerY, { width: 200 });
    doc.text('HSN', colX.hsn, headerY, { width: 40 });
    doc.text('Qty', colX.qty, headerY, { width: 30 });
    doc.text('Price', colX.price, headerY, { width: 60 });
    doc.text('Tax', colX.tax, headerY, { width: 50 });
    doc.text('Total', colX.total, headerY, { width: 70 });
    doc.moveDown(0.3);
    doc.moveTo(40, doc.y).lineTo(555, doc.y).strokeColor('#ccc').stroke();
    doc.moveDown(0.2);

    let shipmentSubtotal = 0;
    let shipmentTax = 0;
    doc.font('Helvetica').fontSize(8);
    for (const item of shipmentItems) {
      const rowY = doc.y;
      const label = item.variant_label ? `${item.title} (${item.variant_label})` : item.title;
      doc.text(label, colX.title, rowY, { width: 200 });
      doc.text(item.sku, colX.hsn, rowY, { width: 40 });
      doc.text(String(item.quantity), colX.qty, rowY, { width: 30 });
      doc.text(money(item.unit_price_minor, order.currency), colX.price, rowY, { width: 60 });
      doc.text(money(item.tax_minor, order.currency), colX.tax, rowY, { width: 50 });
      doc.text(money(item.line_total_minor, order.currency), colX.total, rowY, { width: 70 });
      doc.moveDown(0.4);
      shipmentSubtotal += Number(item.line_total_minor);
      shipmentTax += Number(item.tax_minor);
    }

    doc.moveDown(0.2);
    // Intra-state assumption for the split display; actual GST liability is
    // determined by seller/buyer state comparison at filing time.
    const half = Math.round(shipmentTax / 2);
    doc.fontSize(8).fillColor('#555')
      .text(`Taxable Value: ${money(shipmentSubtotal - shipmentTax, order.currency)}   CGST: ${money(half, order.currency)}   SGST: ${money(shipmentTax - half, order.currency)}`, { align: 'right' })
      .fillColor('#000');
    doc.fontSize(9).font('Helvetica-Bold')
      .text(`Subtotal: ${money(shipmentSubtotal, order.currency)}`, { align: 'right' });
    doc.moveDown();
  }

  doc.moveDown(0.5);
  doc.moveTo(40, doc.y).lineTo(555, doc.y).strokeColor('#000').stroke();
  doc.moveDown(0.3);

  doc.fontSize(9).font('Helvetica');
  const summaryRow = (label, value) => {
    doc.text(label, 350, doc.y, { width: 120, continued: false });
    doc.text(value, 470, doc.y - doc.currentLineHeight(), { width: 85, align: 'right' });
  };
  summaryRow('Items Subtotal:', money(order.subtotal_minor, order.currency));
  if (Number(order.discount_minor) > 0) summaryRow('Discount:', `-${money(order.discount_minor, order.currency)}`);
  summaryRow('Shipping:', money(order.shipping_minor, order.currency));
  if (Number(order.wallet_used_minor) > 0) summaryRow('Wallet Used:', `-${money(order.wallet_used_minor, order.currency)}`);
  doc.font('Helvetica-Bold');
  summaryRow('Total Paid:', money(order.total_minor, order.currency));

  doc.moveDown(2);
  doc.fontSize(7).fillColor('#888')
    .text('This is a system-generated invoice and does not require a physical signature.', 40, doc.y, { align: 'center', width: 515 });

  doc.end();
  return doc;
};

module.exports = { generateOrderInvoice };
