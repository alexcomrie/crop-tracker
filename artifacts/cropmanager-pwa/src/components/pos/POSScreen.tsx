import React, { useState, useMemo, useRef, useEffect } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import db from '../../db/db';
import { generateId } from '../../lib/ids';
import { addDiaryEntry } from '../../lib/diary';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { ShoppingCart, Trash2, Bluetooth, Search, History, Settings, X, Receipt, User, Package, Smartphone, Gift, Coins, Clock, ClipboardList, Printer, Share2 } from 'lucide-react';
import type { PosSale, PosSaleItem, PosCustomer, PosSettings, PosHeldReceipt, PosOrder } from '../../types';
import { formatDateShort, formatDateTime, today } from '../../lib/dates';
import { SalesHistory } from './SalesHistory';
import { PrintLayoutEditor } from './PrintLayoutEditor';
import { InventoryManager } from './InventoryManager';
import { CustomerManager } from './CustomerManager';
import { OrderBook } from './OrderBook';
import { HeldReceipts } from './HeldReceipts';
import { buildSaleReceipt, connectBluetoothPrinter, printViaBluetooth, buildSaleReceiptText } from '../../lib/receiptPrinter';
import type { PrintSettings } from '../../lib/receiptPrinter';
import { toPng } from 'html-to-image';

const PAYMENT_METHODS = [
  { id: 'cash', label: 'Cash', emoji: '💵' },
  { id: 'card', label: 'Card', emoji: '💳' },
  { id: 'transfer', label: 'Transfer', emoji: '🏦' },
  { id: 'other', label: 'Other', emoji: '🔄' },
];

export default function POSScreen() {
  const [tab, setTab] = useState<'pos' | 'history' | 'settings' | 'inventory' | 'customers' | 'orders' | 'held'>('pos');
  const [cart, setCart] = useState<Map<string, { item: PosSaleItem; inventoryId: string }>>(new Map());
  const [search, setSearch] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<'cash' | 'card' | 'transfer' | 'other'>('cash');
  const [amountPaid, setAmountPaid] = useState(0);
  const [customerName, setCustomerName] = useState('');
  const [customerId, setCustomerId] = useState<string | null>(null);
  const [selectedCustomer, setSelectedCustomer] = useState<PosCustomer | null>(null);
  const [showCheckout, setShowCheckout] = useState(false);
  const [discount, setDiscount] = useState(0);
  const [discountType, setDiscountType] = useState<'percentage' | 'fixed'>('fixed');
  const [notes, setNotes] = useState('');
  const [bluetoothDevice, setBluetoothDevice] = useState<BluetoothDevice | null>(null);
  const [printerConnected, setPrinterConnected] = useState(false);
  const [saving, setSaving] = useState(false);
  
  const [deliveryMethod, setDeliveryMethod] = useState<'print' | 'whatsapp' | 'both' | 'none'>('print');
  const [whatsappPhone, setWhatsappPhone] = useState('');
  const [showWhatsAppInput, setShowWhatsAppInput] = useState(false);
  const [redeemPoints, setRedeemPoints] = useState(false);
  const [pointsToRedeem, setPointsToRedeem] = useState(0);
  const [receiptImage, setReceiptImage] = useState<string | null>(null);
  const [holdName, setHoldName] = useState('');
  const [fulfillOrder, setFulfillOrder] = useState<PosOrder | null>(null);
  const [showHoldDialog, setShowHoldDialog] = useState(false);
  const receiptCaptureRef = useRef<HTMLDivElement>(null);
  const [receiptCaptureTarget, setReceiptCaptureTarget] = useState<{ phone: string; resolve: () => void } | null>(null);

  useEffect(() => {
    if (!receiptCaptureTarget || !receiptCaptureRef.current) return;
    const capture = async () => {
      await new Promise(r => setTimeout(r, 150));
      try {
        const dataUrl = await toPng(receiptCaptureRef.current!, { quality: 0.95, pixelRatio: 2 });
        const blob = await (await fetch(dataUrl)).blob();
        const file = new File([blob], 'receipt.png', { type: 'image/png' });
        const cleanPhone = receiptCaptureTarget.phone.replace(/[^0-9]/g, '');
        try {
          if (navigator.share && navigator.canShare?.({ files: [file] })) {
            await navigator.share({ files: [file], title: 'Receipt' });
            receiptCaptureTarget.resolve();
            setReceiptCaptureTarget(null);
            return;
          }
        } catch {}
        const text = buildSaleReceiptText({
          receiptNumber: nextReceiptNumber,
          date: formatDateTime(new Date()),
          customerName: customerName || selectedCustomer?.name || '',
          items: cartItems.map(({ item }) => item),
          subtotal, discount: discountAmount, tax: taxAmount, total, paymentMethod,
          businessName: settings.businessName,
        });
        const url = `https://wa.me/${cleanPhone}?text=${encodeURIComponent(text)}`;
        window.open(url, '_blank');
      } catch {
        toast.error('Could not generate receipt image');
      }
      receiptCaptureTarget.resolve();
      setReceiptCaptureTarget(null);
    };
    capture();
  }, [receiptCaptureTarget]);

  const inventoryItems = useLiveQuery(() => db.posInventory.filter(i => i.isActive).toArray(), []) ?? [];
  const customers = useLiveQuery(() => db.posCustomers.toArray(), []) ?? [];
  const posSettingsData = useLiveQuery(() => db.posSettings.toArray(), []);
  const lastSale = useLiveQuery(() => db.posSales.orderBy('receiptNumber').last(), []);

  const settings: PosSettings = (posSettingsData && posSettingsData.length > 0 && posSettingsData[0])
    ? posSettingsData[0]
    : {
        id: 'default', businessName: 'My Farm', businessAddress: '', businessPhone: '', businessEmail: '',
        taxRate: 0, taxLabel: 'Tax', currency: '$', receiptFooter: 'Thank you!', logoDataUrl: '',
        printWidth: 384, printCharPerLine: 32, showLogo: true, showTax: true, showCustomer: true,
        defaultPaymentMethod: 'cash', pointsRate: 1, pointsRedemptionRate: 100, testMode: false,
      };

  const printSettings: PrintSettings = {
    businessName: settings.businessName,
    businessAddress: settings.businessAddress,
    businessPhone: settings.businessPhone,
    businessEmail: settings.businessEmail,
    taxLabel: settings.taxLabel,
    taxRate: settings.taxRate,
    receiptFooter: settings.receiptFooter,
    logoDataUrl: settings.logoDataUrl,
    showLogo: settings.showLogo,
    showTax: settings.showTax,
    showCustomer: settings.showCustomer,
    printWidth: settings.printWidth,
    printCharPerLine: settings.printCharPerLine,
  };

  const nextReceiptNumber = (lastSale?.receiptNumber ?? 0) + 1;

  const filteredItems = useMemo(() => {
    if (!search) return inventoryItems;
    const q = search.toLowerCase();
    return inventoryItems.filter(i => i.name.toLowerCase().includes(q) || (i.category?.toLowerCase() || '').includes(q));
  }, [inventoryItems, search]);

  const cartItems = useMemo(() => Array.from(cart.values()), [cart]);

  const subtotal = useMemo(() =>
    cartItems.reduce((sum, { item }) => sum + item.total, 0),
    [cartItems]
  );

  const pointsDiscountAmount = useMemo(() => {
    if (!redeemPoints || !selectedCustomer || pointsToRedeem <= 0) return 0;
    const maxRedeemable = selectedCustomer.pointsBalance;
    const actualPoints = Math.min(pointsToRedeem, maxRedeemable);
    return actualPoints / settings.pointsRedemptionRate;
  }, [redeemPoints, pointsToRedeem, selectedCustomer, settings.pointsRedemptionRate]);

  const discountAmount = useMemo(() => {
    let d = 0;
    if (discountType === 'percentage') d = subtotal * (discount / 100);
    else d = discount;
    return d + pointsDiscountAmount;
  }, [subtotal, discount, discountType, pointsDiscountAmount]);

  const taxAmount = useMemo(() => (subtotal - discountAmount) * (settings.taxRate / 100), [subtotal, discountAmount, settings.taxRate]);
  const total = useMemo(() => subtotal - discountAmount + taxAmount, [subtotal, discountAmount, taxAmount]);
  const change = useMemo(() => Math.max(0, amountPaid - total), [amountPaid, total]);

  function addToCart(invItem: typeof inventoryItems[0]) {
    setCart(prev => {
      const next = new Map(prev);
      const key = invItem.id;
      const existing = next.get(key);
      if (existing) {
        const qty = +(existing.item.quantity + 0.5).toFixed(1);
        next.set(key, { ...existing, item: { ...existing.item, quantity: qty, total: qty * existing.item.unitPrice } });
      } else {
        next.set(key, {
          inventoryId: invItem.id,
          item: {
            productId: invItem.id,
            productName: invItem.name,
            quantity: 1,
            unit: invItem.unit,
            unitPrice: invItem.unitPrice,
            total: invItem.unitPrice,
          },
        });
      }
      return next;
    });
  }

  function updateCartItem(inventoryId: string, qty: number, price: number) {
    setCart(prev => {
      const next = new Map(prev);
      const existing = next.get(inventoryId);
      if (!existing) return prev;
      if (qty <= 0) {
        next.delete(inventoryId);
      } else {
        next.set(inventoryId, { ...existing, item: { ...existing.item, quantity: qty, unitPrice: price, total: qty * price } });
      }
      return next;
    });
  }

  function removeFromCart(inventoryId: string) {
    setCart(prev => { const next = new Map(prev); next.delete(inventoryId); return next; });
  }

  function clearCart() {
    setCart(new Map());
    setDiscount(0);
    setNotes('');
    setAmountPaid(0);
    setCustomerName('');
    setCustomerId(null);
    setSelectedCustomer(null);
    setFulfillOrder(null);
    setRedeemPoints(false);
    setPointsToRedeem(0);
    setWhatsappPhone('');
    setShowWhatsAppInput(false);
    setReceiptImage(null);
  }

  function getWhatsAppPhone(): string {
    if (whatsappPhone) return whatsappPhone;
    if (selectedCustomer?.phone) return selectedCustomer.phone;
    return customerName || '';
  }

  async function sendWhatsAppReceipt(phone: string): Promise<void> {
    if (!phone) { toast.error('Enter a phone number for WhatsApp'); return; }
    const cleanPhone = phone.replace(/[^0-9]/g, '');
    if (cleanPhone.length < 6) { toast.error('Invalid phone number'); return; }
    return new Promise<void>(resolve => {
      setReceiptCaptureTarget({ phone, resolve });
    });
  }

  async function handleCheckout() {
    if (cartItems.length === 0) return;

    const useWhatsApp = deliveryMethod === 'whatsapp' || deliveryMethod === 'both';
    const usePrint = deliveryMethod === 'print' || deliveryMethod === 'both';

    if (useWhatsApp) {
      const phone = getWhatsAppPhone();
      if (!phone) { toast.error('Enter a phone number for WhatsApp receipt'); return; }
    }
    if (!useWhatsApp && !usePrint && !printerConnected) {
      // Allow checkout without any delivery
    }
    if (usePrint && !printerConnected && deliveryMethod === 'print') {
      toast.error('No printer connected. Select WhatsApp or connect a printer.');
      return;
    }
    if (amountPaid <= 0) { toast.error('Enter amount paid'); return; }
    if (amountPaid < total) { toast.error('Amount paid is less than total'); return; }
    if (redeemPoints && selectedCustomer && pointsToRedeem > selectedCustomer.pointsBalance) {
      toast.error('Not enough points'); return;
    }

    setSaving(true);
    try {
      const sale: PosSale = {
        id: generateId('SL'),
        date: formatDateTime(new Date()),
        items: cartItems.map(({ item }) => item),
        subtotal,
        tax: taxAmount,
        taxRate: settings.taxRate,
        discount: discountAmount,
        discountType: discount ? discountType : 'fixed',
        total,
        amountPaid,
        change,
        paymentMethod,
        customerId,
        customerName: customerName || selectedCustomer?.name || '',
        notes,
        receiptNumber: nextReceiptNumber,
        createdAt: Date.now(),
      };
      await db.posSales.add(sale);

      // Update customer
      if (selectedCustomer) {
        const pointsEarned = Math.floor(total * (settings.pointsRate || 1));
        const pointsUsed = redeemPoints ? Math.min(pointsToRedeem, selectedCustomer.pointsBalance) : 0;
        await db.posCustomers.update(selectedCustomer.id, {
          totalPurchases: (selectedCustomer.totalPurchases || 0) + total,
          pointsBalance: (selectedCustomer.pointsBalance || 0) - pointsUsed + pointsEarned,
          pointsLifetime: (selectedCustomer.pointsLifetime || 0) + pointsEarned,
          lastPurchaseDate: formatDateShort(today()),
          updatedAt: Date.now(),
        });
      }

      // Mark order as delivered if fulfilling
      if (fulfillOrder) {
        await db.posOrders.update(fulfillOrder.id, {
          status: 'delivered',
          deliveredAt: Date.now(),
          updatedAt: Date.now(),
        });
        setFulfillOrder(null);
      }

      // Record to diary and ledger (unless test mode)
      if (!settings.testMode) {
        const entryDesc = fulfillOrder
          ? `Order DELIVERED: ${customerName || selectedCustomer?.name || ''}`
          : `Sale: ${customerName || selectedCustomer?.name || 'Walk-in'}`;
        await addDiaryEntry({
          entryType: 'pos_sale',
          description: entryDesc,
          details: `${cartItems.length} item(s), $${total.toFixed(2)} (Payment: ${paymentMethod})`,
          date: sale.date,
        });
        await db.ledgerEntries.add({
          id: generateId('LED'),
          type: 'sale',
          date: sale.date,
          category: fulfillOrder ? 'POS Order' : 'POS Sale',
          amount: total,
          quantity: cartItems.length,
          unit: 'items',
          description: `${fulfillOrder ? 'Invoice' : 'POS Sale'} #${String(nextReceiptNumber).padStart(6, '0')}${customerName || selectedCustomer?.name ? ` - ${customerName || selectedCustomer?.name}` : ''}`,
          buyer: customerName || selectedCustomer?.name || '',
          paymentStatus: 'paid',
          expiryDate: '',
          batch: '',
          cropName: '',
          purchaseLocation: '',
          notes: `Payment: ${paymentMethod}`,
          updatedAt: Date.now(),
        });
      }

      // Print receipt
      if (usePrint && printerConnected && bluetoothDevice) {
        try {
          const receiptData = buildSaleReceipt({ ...sale, items: cartItems.map(({ item }) => item) }, printSettings);
          await printViaBluetooth(bluetoothDevice, receiptData);
        } catch (e) {
          toast.error('Print failed: ' + (e instanceof Error ? e.message : ''));
        }
      }

      // WhatsApp receipt
      if (useWhatsApp) {
        const phone = getWhatsAppPhone();
        if (phone) {
          await sendWhatsAppReceipt(phone);
        }
      }

      toast.success(`Sale #${String(nextReceiptNumber).padStart(6, '0')} saved`);
      clearCart();
      setShowCheckout(false);
    } catch (e) {
      toast.error('Checkout failed: ' + (e instanceof Error ? e.message : ''));
    }
    setSaving(false);
  }

  async function handleBluetoothConnect() {
    try {
      const device = await connectBluetoothPrinter();
      if (device) {
        setBluetoothDevice(device);
        setPrinterConnected(true);
        device.addEventListener('gattserverdisconnected', () => {
          setPrinterConnected(false);
          setBluetoothDevice(null);
        });
        toast.success(`Connected to ${device.name || 'printer'}`);
      }
    } catch (e) {
      toast.error('Bluetooth: ' + (e instanceof Error ? e.message : ''));
    }
  }

  function handleSelectCustomer(c: PosCustomer) {
    setCustomerId(c.id);
    setCustomerName(c.name);
    setSelectedCustomer(c);
    setWhatsappPhone(c.phone || '');
  }

  function handleFulfillOrder(order: PosOrder) {
    const newCart = new Map<string, { item: PosSaleItem; inventoryId: string }>();
    for (const item of order.items) {
      newCart.set(item.productName, {
        inventoryId: item.productName,
        item: { productId: item.productName, productName: item.productName, quantity: item.quantity, unit: item.unit, unitPrice: item.unitPrice, total: item.total },
      });
    }
    setCart(newCart);
    setCustomerName(order.customerName);
    setCustomerId(order.customerId);
    setFulfillOrder(order);
    if (order.customerId) {
      const c = customers.find(cc => cc.id === order.customerId);
      if (c) setSelectedCustomer(c);
    }
    setNotes(order.notes || '');
    setTab('pos');
    toast.info(`Fulfilling order for ${order.customerName} — ${order.items.length} item(s)`);
  }

  function handleLoadReceipt(r: PosHeldReceipt) {
    const newCart = new Map<string, { item: PosSaleItem; inventoryId: string }>();
    for (const entry of r.cart) {
      newCart.set(entry.inventoryId, entry);
    }
    setCart(newCart);
    setCustomerId(r.customerId);
    setCustomerName(r.customerName);
    if (r.customerId) {
      const c = customers.find(cc => cc.id === r.customerId);
      if (c) setSelectedCustomer(c);
    }
    setDiscount(r.discount);
    setDiscountType(r.discountType);
    setTab('pos');
    toast.success(`Loaded "${r.name}"`);
  }

  async function handleHoldReceipt() {
    if (cartItems.length === 0) { toast.error('Cart is empty'); return; }
    const name = holdName || `Receipt #${nextReceiptNumber}`;
    const held: PosHeldReceipt = {
      id: generateId('INV'),
      name,
      cart: cartItems,
      customerId,
      customerName: customerName || selectedCustomer?.name || '',
      subtotal,
      total,
      discount,
      discountType,
      createdAt: Date.now(),
    };
    await db.posHeldReceipts.add(held);
    toast.success(`"${name}" held`);
    clearCart();
    setShowHoldDialog(false);
    setHoldName('');
  }

  if (tab === 'history') return <SalesHistory onBack={() => setTab('pos')} />;
  if (tab === 'settings') return <PrintLayoutEditor onBack={() => setTab('pos')} />;
  if (tab === 'inventory') return <InventoryManager onClose={() => setTab('pos')} />;
  if (tab === 'customers') return <CustomerManager onClose={() => setTab('pos')} onSelect={handleSelectCustomer} />;
  if (tab === 'orders') return <OrderBook onBack={() => setTab('pos')} onFulfillOrder={handleFulfillOrder} />;
  if (tab === 'held') return <HeldReceipts onBack={() => setTab('pos')} onLoadReceipt={handleLoadReceipt} />;

  return (
    <div className="flex flex-col pb-24" id="pos-screen">
      {/* Header */}
      <div className="bg-white border-b px-4 py-3 flex items-center gap-2">
        <div className="flex-1">
          <h1 className="font-bold text-lg flex items-center gap-2"><Receipt className="w-5 h-5 text-green-600" />{fulfillOrder ? 'Invoice' : 'POS'}</h1>
          <p className="text-[10px] text-gray-500 font-semibold uppercase">{settings.businessName}</p>
        </div>
        <button onClick={() => setTab('customers')} className="p-2 rounded-lg hover:bg-gray-100 text-gray-500" title="Customers"><User className="w-5 h-5" /></button>
        <button onClick={handleBluetoothConnect} className={`p-2 rounded-lg ${printerConnected ? 'bg-green-100 text-green-700' : 'hover:bg-gray-100 text-gray-500'}`} title="Bluetooth Printer"><Bluetooth className="w-5 h-5" /></button>
        <button onClick={() => setTab('inventory')} className="p-2 rounded-lg hover:bg-gray-100 text-gray-500" title="Inventory"><Package className="w-5 h-5" /></button>
        <button onClick={() => setTab('settings')} className="p-2 rounded-lg hover:bg-gray-100 text-gray-500" title="Print Settings"><Settings className="w-5 h-5" /></button>
        <button onClick={() => setTab('orders')} className="p-2 rounded-lg hover:bg-gray-100 text-gray-500" title="Order Book"><ClipboardList className="w-5 h-5" /></button>
        <button onClick={() => setTab('history')} className="p-2 rounded-lg hover:bg-gray-100 text-gray-500" title="Sales History"><History className="w-5 h-5" /></button>
        <button onClick={() => setTab('held')} className="p-2 rounded-lg hover:bg-gray-100 text-gray-500" title="Held Receipts"><Clock className="w-5 h-5" /></button>
      </div>

      {/* Customer selection bar */}
      <div className="bg-white border-b px-4 py-2 flex items-center gap-2">
        <User className="w-4 h-4 text-gray-400 flex-shrink-0" />
        {selectedCustomer ? (
          <div className="flex-1 flex items-center gap-2">
            <span className="text-sm font-medium">{selectedCustomer.name}</span>
            {selectedCustomer.phone && <span className="text-xs text-gray-400">· {selectedCustomer.phone}</span>}
            {selectedCustomer.pointsBalance > 0 && (
              <span className="text-[10px] bg-amber-50 text-amber-700 px-1.5 py-0.5 rounded-full font-medium">{selectedCustomer.pointsBalance} pts</span>
            )}
            <button onClick={() => { setCustomerId(null); setCustomerName(''); setSelectedCustomer(null); setWhatsappPhone(''); }} className="ml-auto text-xs text-red-500 font-medium">Remove</button>
          </div>
        ) : customerName ? (
          <div className="flex-1 flex items-center gap-2">
            <span className="text-sm italic text-gray-500">{customerName}</span>
            <button onClick={() => setCustomerName('')} className="ml-auto text-xs text-red-500 font-medium">Clear</button>
          </div>
        ) : (
          <span className="text-sm text-gray-400 flex-1">Walk-in customer</span>
        )}
        <div className="flex gap-1">
          <select
            value=""
            onChange={e => {
              if (e.target.value === '__manage__') { setTab('customers'); return; }
              if (e.target.value === '__walkin__') { setCustomerId(null); setCustomerName(''); setSelectedCustomer(null); return; }
              const c = customers.find(c => c.id === e.target.value);
              if (c) handleSelectCustomer(c);
              e.target.value = '';
            }}
            className="text-xs border rounded-lg px-2 py-1.5 bg-white text-gray-600 max-w-[120px]"
          >
            <option value="">Quick select...</option>
            {customers.slice(0, 10).map(c => (
              <option key={c.id} value={c.id}>{c.name}{c.phone ? ` (${c.phone})` : ''}</option>
            ))}
            <option value="__manage__">Manage customers...</option>
          </select>
          <Button size="sm" variant="outline" onClick={() => setTab('customers')} className="text-xs px-2"><User className="w-3.5 h-3.5" /></Button>
        </div>
      </div>
      {!selectedCustomer && !customerId && (
        <div className="bg-white border-b px-4 pb-2">
          <Input placeholder="Walk-in customer name (optional)" value={customerName} onChange={e => setCustomerName(e.target.value)} className="text-sm" />
        </div>
      )}

      {/* Product catalog + Cart */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* Product search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <Input placeholder="Search inventory..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9" />
        </div>

        {/* Product grid */}
        <div className="grid grid-cols-2 gap-2">
          {filteredItems.map(item => (
            <button key={item.id} onClick={() => addToCart(item)} className="bg-white border rounded-xl p-3 text-left hover:border-green-300 active:scale-[0.98] transition-all">
              <p className="font-semibold text-sm truncate">{item.name}</p>
              <p className="text-xs text-gray-500 mt-0.5">
                {item.category && <span>{item.category} · </span>}
                <span className="font-medium text-green-700">${item.unitPrice.toFixed(2)}</span> / {item.unit}
              </p>
            </button>
          ))}
          {filteredItems.length === 0 && (
            <div className="col-span-2 text-center py-8 text-gray-400">
              <Package className="w-8 h-8 mx-auto mb-2 opacity-40" />
              <p className="text-sm">No items available</p>
              <button onClick={() => setTab('inventory')} className="text-xs text-green-600 underline mt-1">Add items to inventory</button>
            </div>
          )}
        </div>

        {/* Customer points banner */}
        {selectedCustomer && selectedCustomer.pointsBalance > 0 && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 flex items-center gap-3">
            <Gift className="w-5 h-5 text-amber-600" />
            <div className="flex-1">
              <p className="text-sm font-semibold text-amber-800">{selectedCustomer.pointsBalance} points available</p>
              <p className="text-xs text-amber-600">{settings.pointsRedemptionRate} pts = ${(1 / settings.pointsRedemptionRate).toFixed(2)} discount</p>
            </div>
            {!redeemPoints && (
              <Button size="sm" variant="outline" className="border-amber-300 text-amber-700" onClick={() => setRedeemPoints(true)}>Redeem</Button>
            )}
          </div>
        )}

        {/* Points redemption input */}
        {redeemPoints && selectedCustomer && (
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold text-amber-800">Redeem Points</span>
              <button onClick={() => { setRedeemPoints(false); setPointsToRedeem(0); }} className="text-xs text-amber-600"><X className="w-4 h-4" /></button>
            </div>
            <div className="flex gap-2 items-center">
              <Input type="number" value={pointsToRedeem} onChange={e => setPointsToRedeem(Number(e.target.value))} min={0} max={selectedCustomer.pointsBalance} className="text-sm" placeholder="Points" />
              <Button size="sm" variant="outline" onClick={() => setPointsToRedeem(selectedCustomer.pointsBalance)} className="whitespace-nowrap text-xs">Max ({selectedCustomer.pointsBalance})</Button>
            </div>
            {pointsToRedeem > 0 && (
              <p className="text-xs text-amber-700">Discount: -${(pointsToRedeem / settings.pointsRedemptionRate).toFixed(2)}</p>
            )}
          </div>
        )}

        {/* Cart */}
        {cartItems.length > 0 && (
          <div className="bg-white rounded-xl border p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="font-bold flex items-center gap-2"><ShoppingCart className="w-4 h-4" /> Cart ({cartItems.length})</h3>
              <button onClick={clearCart} className="text-xs text-red-500 font-medium">Clear</button>
            </div>
            {cartItems.map(({ inventoryId, item }) => (
              <div key={inventoryId} className="flex items-center gap-2 py-2 border-b last:border-0">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{item.productName}</p>
                  <p className="text-[10px] text-gray-400">{item.unit}</p>
                  <div className="flex items-center gap-1 mt-1">
                    <Input type="number" value={item.quantity} onChange={e => updateCartItem(inventoryId, Number(e.target.value) || 0, item.unitPrice)} className="w-16 h-7 text-sm text-center" min={0} step={0.5} />
                  </div>
                </div>
                <div className="text-right">
                  <div className="flex items-center gap-1">
                    <span className="text-[10px] text-gray-400">$</span>
                    <Input type="number" value={item.unitPrice || ''} onChange={e => updateCartItem(inventoryId, item.quantity, Number(e.target.value))} className="w-20 h-7 text-sm text-right" min={0} step={0.01} placeholder="Price" />
                  </div>
                  <p className="text-xs font-semibold mt-0.5">${item.total.toFixed(2)}</p>
                </div>
                <button onClick={() => removeFromCart(inventoryId)} className="p-1 text-red-400 hover:text-red-600"><Trash2 className="w-4 h-4" /></button>
              </div>
            ))}
            <div className="border-t pt-3 space-y-2">
              {settings.taxRate > 0 && (
                <div className="flex justify-between text-sm"><span>Subtotal</span><span className="font-semibold">${subtotal.toFixed(2)}</span></div>
              )}
              <div className="flex items-center gap-2">
                <span className="text-sm">Discount</span>
                <Select value={discountType} onValueChange={(v: 'percentage' | 'fixed') => setDiscountType(v)}>
                  <SelectTrigger className="h-7 w-24 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="fixed">$</SelectItem>
                    <SelectItem value="percentage">%</SelectItem>
                  </SelectContent>
                </Select>
                <Input type="number" value={discount} onChange={e => setDiscount(Number(e.target.value))} className="w-20 h-7 text-sm" min={0} />
                {discountAmount > 0 && <span className="text-xs text-red-500">-${discountAmount.toFixed(2)}</span>}
              </div>
              {pointsDiscountAmount > 0 && (
                <div className="flex justify-between text-xs text-amber-600"><span>Points discount ({pointsToRedeem} pts)</span><span>-${pointsDiscountAmount.toFixed(2)}</span></div>
              )}
              {settings.taxRate > 0 && (
                <div className="flex justify-between text-sm"><span>{settings.taxLabel} ({settings.taxRate}%)</span><span className="font-semibold">${taxAmount.toFixed(2)}</span></div>
              )}
              <div className="flex justify-between text-base font-bold border-t pt-2">
                <span>Total</span>
                <span className="text-green-700">${total.toFixed(2)}</span>
              </div>
              {selectedCustomer && settings.pointsRate > 0 && (
                <div className="flex items-center gap-1 text-xs text-gray-400">
                  <Coins className="w-3 h-3" /> Earns ~{Math.floor(total * settings.pointsRate)} points
                </div>
              )}
              <div className="flex gap-2">
                <Button onClick={() => setShowHoldDialog(true)} variant="outline" className="flex-1 h-12 text-sm">
                  <Clock className="w-4 h-4 mr-1" /> Hold
                </Button>
                <Button onClick={() => { setShowCheckout(true); setAmountPaid(total); }} className="flex-1 bg-green-600 hover:bg-green-700 h-12 text-base font-bold">
                  Checkout ${total.toFixed(2)}
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Checkout Modal */}
      {showCheckout && (
        <div className="fixed inset-0 bg-black/30 z-50 flex items-end sm:items-center justify-center p-4" onClick={() => !saving && setShowCheckout(false)}>
          <div className="bg-white rounded-2xl w-full max-w-sm p-5 space-y-4" onClick={e => e.stopPropagation()}>
            <h2 className="font-bold text-lg">Checkout</h2>
            <div className="space-y-3">
              <div className="text-center">
                <p className="text-3xl font-bold text-green-700">${total.toFixed(2)}</p>
                <p className="text-xs text-gray-500">{fulfillOrder ? 'Invoice' : 'Receipt'} #{String(nextReceiptNumber).padStart(6, '0')}</p>
              </div>
              <div className="flex gap-2">
                {PAYMENT_METHODS.map(m => (
                  <button key={m.id} onClick={() => setPaymentMethod(m.id as typeof paymentMethod)} className={`flex-1 py-3 rounded-xl text-sm font-semibold transition-all ${paymentMethod === m.id ? 'bg-green-600 text-white' : 'bg-gray-100 text-gray-600'}`}>
                    {m.emoji} {m.label}
                  </button>
                ))}
              </div>
              <div className="flex flex-col gap-1">
                <Label>Amount Paid ($)</Label>
                <Input type="number" value={amountPaid} onChange={e => setAmountPaid(Number(e.target.value))} min={0} step={0.01} />
              </div>
              {change > 0 && <p className="text-sm text-green-600 font-semibold text-center">Change: ${change.toFixed(2)}</p>}

              {/* Delivery method */}
              <div>
                <Label className="mb-1 block">Receipt Delivery</Label>
                <div className="flex gap-2">
                  <button onClick={() => setDeliveryMethod('print')} className={`flex-1 py-2 px-3 rounded-xl text-xs font-semibold transition-all ${deliveryMethod === 'print' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600'}`}>
                    <Printer className="w-4 h-4 mx-auto mb-0.5" /> Print
                  </button>
                  <button onClick={() => { setDeliveryMethod('whatsapp'); setShowWhatsAppInput(true); }} className={`flex-1 py-2 px-3 rounded-xl text-xs font-semibold transition-all ${deliveryMethod === 'whatsapp' ? 'bg-green-600 text-white' : 'bg-gray-100 text-gray-600'}`}>
                    <Smartphone className="w-4 h-4 mx-auto mb-0.5" /> WhatsApp
                  </button>
                  <button onClick={() => { setDeliveryMethod('both'); setShowWhatsAppInput(true); }} className={`flex-1 py-2 px-3 rounded-xl text-xs font-semibold transition-all ${deliveryMethod === 'both' ? 'bg-purple-600 text-white' : 'bg-gray-100 text-gray-600'}`}>
                    <Share2 className="w-4 h-4 mx-auto mb-0.5" /> Both
                  </button>
                  <button onClick={() => setDeliveryMethod('none')} className={`flex-1 py-2 px-3 rounded-xl text-xs font-semibold transition-all ${deliveryMethod === 'none' ? 'bg-gray-600 text-white' : 'bg-gray-100 text-gray-600'}`}>
                    <X className="w-4 h-4 mx-auto mb-0.5" /> None
                  </button>
                </div>
              </div>

              {/* WhatsApp phone input */}
              {(deliveryMethod === 'whatsapp' || deliveryMethod === 'both') && (
                <div className="flex flex-col gap-1">
                  <Label>WhatsApp Phone Number</Label>
                  <Input
                    type="tel"
                    value={whatsappPhone}
                    onChange={e => setWhatsappPhone(e.target.value)}
                    placeholder={selectedCustomer?.phone ? selectedCustomer.phone : '+1 (555) 000-0000'}
                    className="text-sm"
                  />
                  {selectedCustomer?.phone && !whatsappPhone && (
                    <p className="text-xs text-gray-400">Using customer's saved number: {selectedCustomer.phone}</p>
                  )}
                  {!selectedCustomer && <p className="text-xs text-gray-400">Enter phone for walk-in customer</p>}
                </div>
              )}

              <div className="flex flex-col gap-1">
                <Label>Notes (optional)</Label>
                <Input value={notes} onChange={e => setNotes(e.target.value)} placeholder="Sale notes..." />
              </div>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" onClick={() => setShowCheckout(false)} disabled={saving}>Cancel</Button>
              <Button className="flex-1 bg-green-600 hover:bg-green-700" onClick={handleCheckout} disabled={saving}>
                {saving ? 'Saving...' : `Complete $${total.toFixed(2)}`}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Hold Receipt Dialog */}
      {showHoldDialog && (
        <div className="fixed inset-0 bg-black/30 z-50 flex items-end sm:items-center justify-center p-4" onClick={() => !saving && setShowHoldDialog(false)}>
          <div className="bg-white rounded-2xl w-full max-w-sm p-5 space-y-4" onClick={e => e.stopPropagation()}>
            <h2 className="font-bold text-lg flex items-center gap-2"><Clock className="w-5 h-5" /> Hold Receipt</h2>
            <p className="text-sm text-gray-500">Park this sale and resume it later.</p>
            <div className="flex flex-col gap-1">
              <Label>Receipt Name</Label>
              <Input value={holdName} onChange={e => setHoldName(e.target.value)} placeholder={`${fulfillOrder ? 'Invoice' : 'Receipt'} #${nextReceiptNumber}`} className="text-sm" />
              <p className="text-xs text-gray-400">Leave blank for auto-name</p>
            </div>
            <div className="bg-gray-50 rounded-xl p-3 text-sm">
              <p className="font-semibold">{cartItems.length} item(s) · ${total.toFixed(2)}</p>
              {customerName && <p className="text-xs text-gray-500">Customer: {customerName}</p>}
            </div>
            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" onClick={() => setShowHoldDialog(false)}>Cancel</Button>
              <Button className="flex-1 bg-blue-600 hover:bg-blue-700" onClick={handleHoldReceipt}><Clock className="w-4 h-4 mr-1" /> Hold</Button>
            </div>
          </div>
        </div>
      )}

      {/* Receipt capture element */}
      <div className="fixed -left-[9999px] top-0">
        {receiptCaptureTarget && (
          <div ref={receiptCaptureRef} className="bg-white p-6 font-mono text-sm leading-relaxed" style={{ width: `${(settings.printCharPerLine || 32) * 9}px` }}>
            {settings.showLogo && settings.logoDataUrl && <div className="text-center mb-2"><img src={settings.logoDataUrl} alt="Logo" className="h-10 mx-auto object-contain" /></div>}
            <p className="font-bold text-base text-center">{settings.businessName}</p>
            {settings.businessAddress && <p className="text-center text-gray-500 text-xs">{settings.businessAddress}</p>}
            {settings.businessPhone && <p className="text-center text-gray-500 text-xs">Tel: {settings.businessPhone}</p>}
            {settings.businessEmail && <p className="text-center text-gray-500 text-xs">{settings.businessEmail}</p>}
            <p className="text-center text-gray-400 text-xs">{'─'.repeat(settings.printCharPerLine || 32)}</p>
            <p className="text-center font-bold text-sm">{fulfillOrder ? 'INVOICE' : 'Receipt'} #{String(nextReceiptNumber).padStart(6, '0')}</p>
            <p className="text-center text-xs text-gray-500">{formatDateTime(new Date())}</p>
            {(customerName || selectedCustomer?.name) && settings.showCustomer && (
              <p className="text-center text-xs text-gray-500">Customer: {customerName || selectedCustomer?.name}</p>
            )}
            <p className="text-center text-gray-400 text-xs">{'─'.repeat(settings.printCharPerLine || 32)}</p>
            <p className="text-xs text-gray-500">Item{' '.repeat(12)}Qty{' '.repeat(3)}Price{' '.repeat(4)}Total</p>
            <p className="text-gray-400 text-xs">{'─'.repeat(settings.printCharPerLine || 32)}</p>
            {cartItems.map(({ item }) => (
              <p key={item.productId} className="text-xs">
                {item.productName.slice(0, 12).padEnd(14)}
                {(item.quantity + ' ' + item.unit).padEnd(8)}
                {item.unitPrice.toFixed(2).padEnd(8)}
                {item.total.toFixed(2)}
              </p>
            ))}
            <p className="text-gray-400 text-xs">{'─'.repeat(settings.printCharPerLine || 32)}</p>
            <p className="flex justify-between text-xs"><span>Subtotal:</span><span>${subtotal.toFixed(2)}</span></p>
            {discountAmount > 0 && <p className="flex justify-between text-xs text-red-500"><span>Discount:</span><span>-${discountAmount.toFixed(2)}</span></p>}
            {settings.showTax && settings.taxRate > 0 && (
              <p className="flex justify-between text-xs"><span>{settings.taxLabel} ({settings.taxRate}%):</span><span>${taxAmount.toFixed(2)}</span></p>
            )}
            <p className="text-gray-400 text-xs">{'─'.repeat(settings.printCharPerLine || 32)}</p>
            <p className="flex justify-between font-bold text-sm"><span>TOTAL:</span><span className="text-green-700">${total.toFixed(2)}</span></p>
            <p className="text-xs text-gray-400">{'─'.repeat(settings.printCharPerLine || 32)}</p>
            {pointsDiscountAmount > 0 && (
              <p className="text-xs text-amber-600 text-center">Points redeemed: {pointsToRedeem}</p>
            )}
            {selectedCustomer && settings.pointsRate > 0 && (
              <p className="text-xs text-gray-500 text-center">Points earned: {Math.floor(total * settings.pointsRate)}</p>
            )}
            <p className="text-xs text-gray-500 text-center">Payment: {paymentMethod.toUpperCase()}</p>
            <p className="text-center text-xs text-gray-500 mt-1">{settings.receiptFooter}</p>
          </div>
        )}
      </div>
    </div>
  );
}
