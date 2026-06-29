export interface ReceiptLine {
  text?: string;
  bold?: boolean;
  center?: boolean;
  double?: boolean;
  divider?: boolean;
}

export interface PrintSettings {
  businessName: string;
  businessAddress: string;
  businessPhone: string;
  businessEmail: string;
  taxLabel: string;
  taxRate: number;
  receiptFooter: string;
  logoDataUrl: string;
  showLogo: boolean;
  showTax: boolean;
  showCustomer: boolean;
  printWidth: number;
  printCharPerLine: number;
}

export const DEFAULT_PRINT_SETTINGS: PrintSettings = {
  businessName: 'My Farm',
  businessAddress: '',
  businessPhone: '',
  businessEmail: '',
  taxLabel: 'Tax',
  taxRate: 0,
  receiptFooter: 'Thank you for your support!',
  logoDataUrl: '',
  showLogo: true,
  showTax: true,
  showCustomer: true,
  printWidth: 384,
  printCharPerLine: 32,
};

const ESC = '\x1b';
const GS = '\x1d';

function textCommand(text: string): Uint8Array {
  return new TextEncoder().encode(text + '\n');
}

function boldOn(): Uint8Array {
  return new Uint8Array([0x1b, 0x45, 0x01]);
}

function boldOff(): Uint8Array {
  return new Uint8Array([0x1b, 0x45, 0x00]);
}

function centerOn(): Uint8Array {
  return new Uint8Array([0x1b, 0x61, 0x01]);
}

function leftOn(): Uint8Array {
  return new Uint8Array([0x1b, 0x61, 0x00]);
}

function doubleOn(): Uint8Array {
  return new Uint8Array([0x1b, 0x21, 0x30]);
}

function doubleOff(): Uint8Array {
  return new Uint8Array([0x1b, 0x21, 0x00]);
}

function feed(n: number): Uint8Array {
  return new Uint8Array([0x1b, 0x64, n]);
}

function cut(): Uint8Array {
  return new Uint8Array([0x1b, 0x6d]);
}

function beep(): Uint8Array {
  return new Uint8Array([0x1b, 0x42, 0x03, 0x03]);
}

export function buildReceipt(lines: ReceiptLine[], settings: PrintSettings): Uint8Array {
  const parts: Uint8Array[] = [];

  // Initialize printer
  parts.push(new Uint8Array([0x1b, 0x40]));

  // Logo
  if (settings.showLogo && settings.logoDataUrl) {
    parts.push(centerOn());
    parts.push(textCommand('[LOGO]'));
    parts.push(leftOn());
  }

  for (const line of lines) {
    if (line.divider) {
      parts.push(textCommand('-'.repeat(settings.printCharPerLine)));
      continue;
    }
    if (line.center) parts.push(centerOn());
    if (line.bold) parts.push(boldOn());
    if (line.double) parts.push(doubleOn());

    parts.push(textCommand(line.text ?? ''));

    if (line.double) parts.push(doubleOff());
    if (line.bold) parts.push(boldOff());
    if (line.center) parts.push(leftOn());
  }

  parts.push(feed(3));
  parts.push(cut());
  parts.push(beep());

  const totalLen = parts.reduce((sum, p) => sum + p.length, 0);
  const result = new Uint8Array(totalLen);
  let offset = 0;
  for (const p of parts) {
    result.set(p, offset);
    offset += p.length;
  }
  return result;
}

export function buildSaleReceipt(
  sale: { receiptNumber: number; date: string; items: { productName: string; quantity: number; unit: string; unitPrice: number; total: number }[]; subtotal: number; discount: number; tax: number; total: number; amountPaid: number; change: number; paymentMethod: string; customerName?: string },
  settings: PrintSettings
): Uint8Array {
  const lines: ReceiptLine[] = [];

  lines.push({ text: settings.businessName, center: true, bold: true, double: true });
  if (settings.businessAddress) lines.push({ text: settings.businessAddress, center: true });
  if (settings.businessPhone) lines.push({ text: `Tel: ${settings.businessPhone}`, center: true });
  if (settings.businessEmail) lines.push({ text: settings.businessEmail, center: true });
  lines.push({ divider: true });
  lines.push({ text: `Receipt #${String(sale.receiptNumber).padStart(6, '0')}`, center: true, bold: true });
  lines.push({ text: sale.date, center: true });
  if (settings.showCustomer && sale.customerName) {
    lines.push({ text: `Customer: ${sale.customerName}`, center: true });
  }
  lines.push({ divider: true });
  lines.push({ text: 'Item'.padEnd(16) + 'Qty'.padEnd(6) + 'Price'.padEnd(6) + 'Total' });
  lines.push({ divider: true });
  for (const item of sale.items) {
    const name = item.productName.length > 14 ? item.productName.slice(0, 13) + '.' : item.productName;
    const qty = `${item.quantity} ${item.unit}`;
    const price = `$${item.unitPrice.toFixed(2)}`;
    const total = `$${item.total.toFixed(2)}`;
    lines.push({ text: `${name.padEnd(16)}${qty.padEnd(6)}${price.padEnd(6)}${total}` });
  }
  lines.push({ divider: true });
  lines.push({ text: `Subtotal:`.padEnd(22) + `$${sale.subtotal.toFixed(2)}`.padStart(10), bold: true });
  if (sale.discount > 0) {
    lines.push({ text: `Discount:`.padEnd(22) + `-$${sale.discount.toFixed(2)}`.padStart(10), bold: true });
  }
  if (settings.showTax && settings.taxRate > 0) {
    lines.push({ text: `${settings.taxLabel} (${settings.taxRate}%):`.padEnd(22) + `$${sale.tax.toFixed(2)}`.padStart(10) });
  }
  lines.push({ divider: true });
  lines.push({ text: `TOTAL`.padEnd(22) + `$${sale.total.toFixed(2)}`.padStart(10), bold: true, double: true });
  lines.push({ divider: true });
  lines.push({ text: `Paid: $${sale.amountPaid.toFixed(2)} (${sale.paymentMethod})`, center: true });
  if (sale.change > 0) {
    lines.push({ text: `Change: $${sale.change.toFixed(2)}`, center: true });
  }
  lines.push({ divider: true });
  lines.push({ text: settings.receiptFooter, center: true });
  return buildReceipt(lines, settings);
}

export function buildSaleReceiptText(
  sale: {
    receiptNumber: number;
    date?: string;
    customerName?: string;
    items: { productName: string; quantity: number; unit: string; unitPrice: number; total: number }[];
    subtotal: number;
    discount: number;
    tax: number;
    total: number;
    paymentMethod: string;
    businessName: string;
    pointsEarned?: number;
    pointsRedeemed?: number;
  },
  charPerLine: number = 32
): string {
  const sep = '─'.repeat(charPerLine);
  const lines: string[] = [];
  lines.push(sale.businessName);
  lines.push(sep);
  lines.push(`Receipt #${String(sale.receiptNumber).padStart(6, '0')}`);
  if (sale.date) lines.push(sale.date);
  if (sale.customerName) lines.push(`Customer: ${sale.customerName}`);
  lines.push(sep);
  lines.push('Item'.padEnd(14) + 'Qty'.padEnd(6) + 'Price'.padEnd(6) + 'Total');
  lines.push(sep);
  for (const item of sale.items) {
    const name = item.productName.length > 13 ? item.productName.slice(0, 12) + '.' : item.productName;
    const qty = `${item.quantity} ${item.unit}`;
    const price = `$${item.unitPrice.toFixed(2)}`;
    const total = `$${item.total.toFixed(2)}`;
    lines.push(`${name.padEnd(14)}${qty.padEnd(10)}${price.padEnd(6)}${total}`);
  }
  lines.push(sep);
  lines.push(`Subtotal: $${sale.subtotal.toFixed(2)}`);
  if (sale.discount > 0) lines.push(`Discount: -$${sale.discount.toFixed(2)}`);
  if (sale.tax > 0) lines.push(`Tax: $${sale.tax.toFixed(2)}`);
  lines.push(sep);
  lines.push(`TOTAL: $${sale.total.toFixed(2)}`);
  lines.push(sep);
  lines.push(`Payment: ${sale.paymentMethod.toUpperCase()}`);
  if (sale.pointsEarned) lines.push(`Points earned: ${sale.pointsEarned}`);
  if (sale.pointsRedeemed) lines.push(`Points redeemed: ${sale.pointsRedeemed}`);
  lines.push('');
  lines.push('Thank you for your support!');
  return lines.join('\n');
}

export async function connectBluetoothPrinter(): Promise<BluetoothDevice | null> {
  if (!navigator.bluetooth) {
    throw new Error('Bluetooth not available. Please use a compatible browser (Chrome/Edge on desktop or Android).');
  }
  const device = await navigator.bluetooth.requestDevice({
    acceptAllDevices: true,
    optionalServices: ['000018f0-0000-1000-8000-00805f9b34fb'],
  });
  return device;
}

export async function printViaBluetooth(device: BluetoothDevice, data: Uint8Array): Promise<void> {
  const server = await device.gatt?.connect();
  if (!server) throw new Error('Failed to connect to printer');
  const services = await server.getPrimaryServices();
  if (services.length === 0) throw new Error('No services found on printer');
  const service = services[0];
  const characteristics = await service.getCharacteristics();
  const writeChar = characteristics.find(c => c.properties.write || c.properties.writeWithoutResponse);
  if (!writeChar) throw new Error('No writable characteristic found');
  const chunkSize = 100;
  for (let i = 0; i < data.length; i += chunkSize) {
    const chunk = data.slice(i, i + chunkSize);
    await writeChar.writeValue(chunk);
  }
}
