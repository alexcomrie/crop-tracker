import React, { useState, useRef, useEffect } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import db from '../../db/db';
import { generateId } from '../../lib/ids';
import { addDiaryEntry } from '../../lib/diary';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { ClipboardList, Plus, Pencil, Trash2, X, Search, Save, User, Package, FileText, ChevronLeft, CheckCircle, XCircle } from 'lucide-react';
import type { PosOrder, PosOrderItem, PosCustomer } from '../../types';
import { formatDateShort, formatDateTime, today } from '../../lib/dates';
import { toPng } from 'html-to-image';

const UNITS = ['each', 'lb', 'kg', 'oz', 'dozen', 'half-dozen', 'bunch', 'box', 'crate', 'bag', 'tray', 'per plant', 'per head', 'liter', 'gallon', 'bottle'];

interface Props {
  onBack: () => void;
  onFulfillOrder?: (order: PosOrder) => void;
}

export function OrderBook({ onBack, onFulfillOrder }: Props) {
  const [tab, setTab] = useState<'pending' | 'delivered'>('pending');
  const [search, setSearch] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editOrderId, setEditOrderId] = useState<string | null>(null);
  const [customerName, setCustomerName] = useState('');
  const [customerId, setCustomerId] = useState<string | null>(null);
  const [selectedCustomer, setSelectedCustomer] = useState<PosCustomer | null>(null);
  const [showCustomers, setShowCustomers] = useState(false);
  const [orderItems, setOrderItems] = useState<{ id: string; name: string; unit: string; qty: number; price: number; total: number; isCustom: boolean }[]>([]);
  const [itemFormOpen, setItemFormOpen] = useState(false);
  const [itemName, setItemName] = useState('');
  const [itemUnit, setItemUnit] = useState('each');
  const [itemQty, setItemQty] = useState(1);
  const [itemPrice, setItemPrice] = useState(0);
  const [editItemIdx, setEditItemIdx] = useState<number | null>(null);
  const [notes, setNotes] = useState('');
  const [quoteTarget, setQuoteTarget] = useState<PosOrder | null>(null);
  const [invoiceTarget, setInvoiceTarget] = useState<PosOrder | null>(null);
  const quoteRef = useRef<HTMLDivElement>(null);
  const invoiceRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!invoiceTarget || !invoiceRef.current) return;
    const capture = async () => {
      await new Promise(r => setTimeout(r, 100));
      try {
        const dataUrl = await toPng(invoiceRef.current!, { quality: 0.95, pixelRatio: 2 });
        const blob = await (await fetch(dataUrl)).blob();
        const file = new File([blob], `invoice_${invoiceTarget.customerName.replace(/\s+/g, '_')}.png`, { type: 'image/png' });
        if (navigator.share && navigator.canShare?.({ files: [file] })) {
          await navigator.share({ files: [file], title: `Invoice - ${invoiceTarget.customerName}` });
        } else {
          const a = document.createElement('a');
          a.href = dataUrl;
          a.download = `invoice_${invoiceTarget.customerName}.png`;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
        }
      } catch {
        toast.error('Could not generate invoice image');
      }
      setInvoiceTarget(null);
    };
    capture();
  }, [invoiceTarget]);

  useEffect(() => {
    if (!quoteTarget || !quoteRef.current) return;
    const capture = async () => {
      await new Promise(r => setTimeout(r, 100));
      try {
        const dataUrl = await toPng(quoteRef.current!, { quality: 0.95, pixelRatio: 2 });
        const blob = await (await fetch(dataUrl)).blob();
        const file = new File([blob], `quote_${quoteTarget.customerName.replace(/\s+/g, '_')}.png`, { type: 'image/png' });
        if (navigator.share && navigator.canShare?.({ files: [file] })) {
          await navigator.share({ files: [file], title: `Quote - ${quoteTarget.customerName}` });
        } else {
          const a = document.createElement('a');
          a.href = dataUrl;
          a.download = `quote_${quoteTarget.customerName}.png`;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
        }
      } catch {
        toast.error('Could not generate quote image');
      }
      setQuoteTarget(null);
    };
    capture();
  }, [quoteTarget]);

  const orders = useLiveQuery(() => db.posOrders.toArray(), []) ?? [];
  const inventoryItems = useLiveQuery(() => db.posInventory.filter(i => i.isActive).toArray(), []) ?? [];
  const customers = useLiveQuery(() => db.posCustomers.toArray(), []) ?? [];

  const filteredOrders = orders
    .filter(o => tab === 'pending' ? o.status === 'pending' : o.status === 'delivered')
    .filter(o => !search || o.customerName.toLowerCase().includes(search.toLowerCase()));

  const orderTotal = React.useMemo(() => orderItems.reduce((s, i) => s + i.total, 0), [orderItems]);

  function resetForm() {
    setCustomerName('');
    setCustomerId(null);
    setSelectedCustomer(null);
    setOrderItems([]);
    setNotes('');
    setEditOrderId(null);
    setShowForm(false);
    setItemFormOpen(false);
    resetItemForm();
  }

  function resetItemForm() {
    setItemName('');
    setItemUnit('each');
    setItemQty(1);
    setItemPrice(0);
    setEditItemIdx(null);
  }

  function addItemToForm(name: string, unit: string, qty: number, price: number) {
    const total = qty * price;
    setOrderItems(prev => [...prev, { id: generateId('INV'), name, unit, qty, price, total, isCustom: true }]);
  }

  function handleAddItem() {
    if (!itemName) { toast.error('Item name is required'); return; }
    if (editItemIdx !== null) {
      setOrderItems(prev => prev.map((it, i) => i === editItemIdx ? { ...it, name: itemName, unit: itemUnit, qty: itemQty, price: itemPrice, total: itemQty * itemPrice } : it));
    } else {
      addItemToForm(itemName, itemUnit, itemQty, itemPrice);
    }
    resetItemForm();
    setItemFormOpen(false);
  }

  function handleAddInventoryItem(inv: typeof inventoryItems[0]) {
    const existing = orderItems.find(i => i.name === inv.name && !i.isCustom);
    if (existing) {
      setOrderItems(prev => prev.map(i => i.id === existing.id ? { ...i, qty: i.qty + 1, total: (i.qty + 1) * i.price } : i));
    } else {
      setOrderItems(prev => [...prev, { id: inv.id, name: inv.name, unit: inv.unit, qty: 1, price: inv.unitPrice, total: inv.unitPrice, isCustom: false }]);
    }
  }

  function removeOrderItem(idx: number) {
    setOrderItems(prev => prev.filter((_, i) => i !== idx));
  }

  function updateItemQty(idx: number, qty: number) {
    if (qty <= 0) { removeOrderItem(idx); return; }
    setOrderItems(prev => prev.map((it, i) => i === idx ? { ...it, qty, total: qty * it.price } : it));
  }

  async function handleSaveOrder() {
    if (!customerName && !selectedCustomer) { toast.error('Customer name is required'); return; }
    if (orderItems.length === 0) { toast.error('At least one item is required'); return; }
    const now = Date.now();
    const items: PosOrderItem[] = orderItems.map(i => ({ productName: i.name, quantity: i.qty, unit: i.unit, unitPrice: i.price, total: i.total }));
    const total = orderTotal;
    if (editOrderId) {
      await db.posOrders.update(editOrderId, { customerName: customerName || selectedCustomer!.name, customerId: customerId, items, total, notes, updatedAt: now });
      toast.success('Order updated');
    } else {
      await db.posOrders.add({ id: generateId('INV'), customerName: customerName || selectedCustomer!.name, customerId, items, total, notes, status: 'pending', createdAt: now, updatedAt: now });
      await addDiaryEntry({ entryType: 'pos_sale', description: `Order created: ${customerName || selectedCustomer!.name}`, details: `${items.length} item(s), $${total.toFixed(2)}`, date: formatDateShort(today()) });
      toast.success('Order saved');
    }
    resetForm();
  }

  async function handleCancelOrder(order: PosOrder) {
    if (!window.confirm(`Cancel order for ${order.customerName}?`)) return;
    await db.posOrders.update(order.id, { status: 'canceled', canceledAt: Date.now(), updatedAt: Date.now() });
    await addDiaryEntry({ entryType: 'pos_sale', description: `Order CANCELED: ${order.customerName}`, details: `$${order.total.toFixed(2)}`, date: formatDateShort(today()) });
    toast.success('Order canceled');
  }

  function openEditOrder(order: PosOrder) {
    setEditOrderId(order.id);
    setCustomerName(order.customerName);
    setCustomerId(order.customerId);
    if (order.customerId) {
      const c = customers.find(cc => cc.id === order.customerId);
      if (c) setSelectedCustomer(c);
    }
    setOrderItems(order.items.map(i => ({ id: i.productName, name: i.productName, unit: i.unit, qty: i.quantity, price: i.unitPrice, total: i.total, isCustom: true })));
    setNotes(order.notes);
    setShowForm(true);
  }

  function handleQuoteImage(order: PosOrder) {
    setQuoteTarget(order);
  }

  async function handleDownloadQuote(order: PosOrder) {
    setQuoteTarget(order);
  }

  return (
    <div className="flex flex-col h-full">
      <div className="bg-white border-b px-4 py-3 flex items-center gap-3">
        <button onClick={onBack} className="p-1 rounded-lg hover:bg-gray-100"><ChevronLeft className="w-5 h-5 text-gray-600" /></button>
        <h1 className="font-bold text-lg flex-1 flex items-center gap-2"><ClipboardList className="w-5 h-5 text-orange-600" /> Order Book</h1>
        <Button size="sm" onClick={() => { resetForm(); setShowForm(true); }} className="bg-orange-600"><Plus className="w-4 h-4 mr-1" /> New Order</Button>
      </div>

      <div className="flex border-b bg-white">
        <button onClick={() => setTab('pending')} className={`flex-1 py-2 text-sm font-semibold text-center ${tab === 'pending' ? 'text-orange-600 border-b-2 border-orange-600' : 'text-gray-500'}`}>Pending</button>
        <button onClick={() => setTab('delivered')} className={`flex-1 py-2 text-sm font-semibold text-center ${tab === 'delivered' ? 'text-green-600 border-b-2 border-green-600' : 'text-gray-500'}`}>Delivered</button>
      </div>

      {showForm ? (
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          <h2 className="font-bold">{editOrderId ? 'Edit Order' : 'New Order'}</h2>

          {/* Customer */}
          <div className="space-y-2">
            <Label>Customer</Label>
            {selectedCustomer ? (
              <div className="flex items-center gap-2 bg-blue-50 rounded-xl px-3 py-2">
                <User className="w-4 h-4 text-blue-600" />
                <span className="flex-1 text-sm font-medium">{selectedCustomer.name}</span>
                <button onClick={() => { setSelectedCustomer(null); setCustomerId(null); setCustomerName(''); }} className="text-xs text-red-500">Change</button>
              </div>
            ) : (
              <div className="flex gap-2">
                <Input value={customerName} onChange={e => setCustomerName(e.target.value)} placeholder="Customer name..." className="flex-1" />
                <Button size="sm" variant="outline" onClick={() => setShowCustomers(!showCustomers)}><User className="w-4 h-4" /></Button>
              </div>
            )}
            {showCustomers && (
              <div className="max-h-32 overflow-y-auto border rounded-xl p-2 space-y-1 bg-white">
                {customers.map(c => (
                  <button key={c.id} onClick={() => { setSelectedCustomer(c); setCustomerId(c.id); setCustomerName(c.name); setShowCustomers(false); }} className="w-full text-left px-2 py-1.5 text-sm hover:bg-blue-50 rounded-lg">{c.name}</button>
                ))}
              </div>
            )}
          </div>

          {/* Items */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Items</Label>
              <Button size="sm" variant="outline" onClick={() => { resetItemForm(); setItemFormOpen(true); }}><Plus className="w-4 h-4 mr-1" /> Add Item</Button>
            </div>

            {/* Quick add from inventory */}
            <div className="flex gap-1 flex-wrap">
              {inventoryItems.slice(0, 8).map(inv => (
                <button key={inv.id} onClick={() => handleAddInventoryItem(inv)} className="text-xs bg-gray-50 border rounded-lg px-2 py-1 hover:bg-orange-50 hover:border-orange-200">{inv.name}</button>
              ))}
            </div>

            {/* Item form */}
            {itemFormOpen && (
              <div className="bg-orange-50 border border-orange-200 rounded-xl p-3 space-y-2">
                <div className="flex flex-col gap-1">
                  <Label>Item Name</Label>
                  <Input value={itemName} onChange={e => setItemName(e.target.value)} placeholder="e.g. Roma Tomatoes" className="text-sm" />
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <div className="flex flex-col gap-1">
                    <Label>Unit</Label>
                    <Select value={itemUnit} onValueChange={setItemUnit}>
                      <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {UNITS.map(u => <SelectItem key={u} value={u}>{u}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex flex-col gap-1">
                    <Label>Qty</Label>
                    <Input type="number" value={itemQty} onChange={e => setItemQty(Number(e.target.value))} min={0} step={0.5} className="h-8 text-sm" />
                  </div>
                  <div className="flex flex-col gap-1">
                    <Label>Price</Label>
                    <Input type="number" value={itemPrice} onChange={e => setItemPrice(Number(e.target.value))} min={0} step={0.01} className="h-8 text-sm" />
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" className="flex-1" onClick={() => { resetItemForm(); setItemFormOpen(false); }}>Cancel</Button>
                  <Button size="sm" className="flex-1 bg-orange-600" onClick={handleAddItem}>{editItemIdx !== null ? 'Update' : 'Add'} Item</Button>
                </div>
              </div>
            )}

            {/* Items list */}
            <div className="space-y-1">
              {orderItems.map((item, idx) => (
                <div key={idx} className="flex items-center gap-2 bg-white border rounded-xl px-3 py-2">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{item.name}</p>
                    <p className="text-xs text-gray-500">${item.price.toFixed(2)} / {item.unit}</p>
                  </div>
                  <div className="flex items-center gap-1">
                    <button onClick={() => updateItemQty(idx, item.qty - 1)} className="w-5 h-5 rounded bg-gray-100 flex items-center justify-center text-xs">-</button>
                    <span className="text-sm font-semibold w-6 text-center">{item.qty}</span>
                    <button onClick={() => updateItemQty(idx, item.qty + 1)} className="w-5 h-5 rounded bg-gray-100 flex items-center justify-center text-xs">+</button>
                  </div>
                  <p className="text-sm font-semibold w-16 text-right">${item.total.toFixed(2)}</p>
                  <button onClick={() => { setItemFormOpen(true); setEditItemIdx(idx); setItemName(item.name); setItemUnit(item.unit); setItemQty(item.qty); setItemPrice(item.price); }} className="p-1 text-blue-400"><Pencil className="w-3 h-3" /></button>
                  <button onClick={() => removeOrderItem(idx)} className="p-1 text-red-400"><Trash2 className="w-3 h-3" /></button>
                </div>
              ))}
              {orderItems.length === 0 && <p className="text-xs text-gray-400 text-center py-4">No items added yet</p>}
            </div>

            {orderItems.length > 0 && (
              <div className="text-right font-bold text-lg">Total: ${orderTotal.toFixed(2)}</div>
            )}
          </div>

          {/* Notes */}
          <div className="flex flex-col gap-1">
            <Label>Notes</Label>
            <Input value={notes} onChange={e => setNotes(e.target.value)} placeholder="Order notes..." />
          </div>

          <div className="flex gap-2">
            <Button variant="outline" className="flex-1" onClick={resetForm}>Cancel</Button>
            <Button className="flex-1 bg-orange-600 hover:bg-orange-700" onClick={handleSaveOrder}><Save className="w-4 h-4 mr-1" /> {editOrderId ? 'Update Order' : 'Save Order'}</Button>
          </div>
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <Input placeholder="Search orders..." value={search} onChange={e => setSearch(e.target.value)} className="pl-9" />
          </div>
          {filteredOrders.length === 0 && (
            <div className="text-center py-12 text-gray-400">
              <ClipboardList className="w-10 h-10 mx-auto mb-2 opacity-40" />
              <p className="text-sm">{tab === 'pending' ? 'No pending orders' : 'No delivered orders'}</p>
            </div>
          )}
          {filteredOrders.map(order => (
            <div key={order.id} className="bg-white border rounded-xl p-4 space-y-2">
              <div className="flex items-start justify-between">
                <div>
                  <p className="font-semibold">{order.customerName}</p>
                  <p className="text-xs text-gray-500">{formatDateShort(new Date(order.createdAt))} · {order.items.length} item(s)</p>
                </div>
                <p className="font-bold text-green-700">${order.total.toFixed(2)}</p>
              </div>
              <div className="text-xs text-gray-500 space-y-0.5">
                {order.items.map((item, i) => (
                  <p key={i}>{item.productName} × {item.quantity} {item.unit} — ${item.total.toFixed(2)}</p>
                ))}
              </div>
              {order.notes && <p className="text-xs text-gray-400 italic">📝 {order.notes}</p>}
              <div className="flex gap-2 pt-1">
                {tab === 'pending' && (
                  <>
                    <Button size="sm" variant="outline" onClick={() => openEditOrder(order)} className="text-xs"><Pencil className="w-3 h-3 mr-1" /> Edit</Button>
                    <Button size="sm" variant="outline" className="text-xs text-green-600 border-green-200" onClick={() => onFulfillOrder?.(order)}><CheckCircle className="w-3 h-3 mr-1" /> Invoice</Button>
                    <Button size="sm" variant="outline" className="text-xs text-red-500 border-red-200" onClick={() => handleCancelOrder(order)}><XCircle className="w-3 h-3 mr-1" /> Cancel</Button>
                    <Button size="sm" variant="outline" className="text-xs text-purple-600 border-purple-200" onClick={() => handleQuoteImage(order)}><FileText className="w-3 h-3 mr-1" /> Quote</Button>
                    <Button size="sm" variant="outline" className="text-xs text-blue-600 border-blue-200" onClick={() => setInvoiceTarget(order)}><FileText className="w-3 h-3 mr-1" /> Invoice</Button>
                  </>
                )}
                {tab === 'delivered' && (
                  <>
                    <Button size="sm" variant="outline" className="text-xs text-purple-600 border-purple-200" onClick={() => handleQuoteImage(order)}><FileText className="w-3 h-3 mr-1" /> Quote</Button>
                    <Button size="sm" variant="outline" className="text-xs text-blue-600 border-blue-200" onClick={() => setInvoiceTarget(order)}><FileText className="w-3 h-3 mr-1" /> Invoice</Button>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Quote capture element */}
      <div className="fixed -left-[9999px] top-0">
        {quoteTarget && (
          <div ref={quoteRef} className="bg-white p-8 font-mono text-sm" style={{ width: '400px' }}>
            <p className="text-center font-bold text-lg mb-1">QUOTATION</p>
            <p className="text-center text-xs text-gray-500 mb-1">{formatDateTime(new Date())}</p>
            <p className="text-xs mb-4">Customer: {quoteTarget.customerName}</p>
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="border-b border-gray-300">
                  <th className="text-left py-1">Item</th>
                  <th className="text-right py-1">Qty</th>
                  <th className="text-right py-1">Unit</th>
                  <th className="text-right py-1">Price</th>
                  <th className="text-right py-1">Total</th>
                </tr>
              </thead>
              <tbody>
                {quoteTarget.items.map((item, i) => (
                  <tr key={i} className="border-b border-gray-100">
                    <td className="py-1">{item.productName}</td>
                    <td className="text-right py-1">{item.quantity}</td>
                    <td className="text-right py-1">{item.unit}</td>
                    <td className="text-right py-1">${item.unitPrice.toFixed(2)}</td>
                    <td className="text-right py-1">${item.total.toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="text-right font-bold text-sm mt-3">TOTAL: ${quoteTarget.total.toFixed(2)}</p>
            {quoteTarget.notes && <p className="text-xs text-gray-500 mt-2">Notes: {quoteTarget.notes}</p>}
            <p className="text-center text-xs text-gray-400 mt-6">Thank you for your business!</p>
          </div>
        )}
        {invoiceTarget && (
          <div ref={invoiceRef} className="bg-white p-8 font-mono text-sm" style={{ width: '400px' }}>
            <p className="text-center font-bold text-lg mb-1">INVOICE</p>
            <p className="text-center text-xs text-gray-500 mb-1">#{invoiceTarget.id.slice(-8).toUpperCase()}</p>
            <p className="text-center text-xs text-gray-500 mb-1">{formatDateTime(new Date())}</p>
            <p className="text-xs mb-4">Customer: {invoiceTarget.customerName}</p>
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="border-b border-gray-300">
                  <th className="text-left py-1">Item</th>
                  <th className="text-right py-1">Qty</th>
                  <th className="text-right py-1">Unit</th>
                  <th className="text-right py-1">Price</th>
                  <th className="text-right py-1">Total</th>
                </tr>
              </thead>
              <tbody>
                {invoiceTarget.items.map((item, i) => (
                  <tr key={i} className="border-b border-gray-100">
                    <td className="py-1">{item.productName}</td>
                    <td className="text-right py-1">{item.quantity}</td>
                    <td className="text-right py-1">{item.unit}</td>
                    <td className="text-right py-1">${item.unitPrice.toFixed(2)}</td>
                    <td className="text-right py-1">${item.total.toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="text-right font-bold text-sm mt-3">TOTAL: ${invoiceTarget.total.toFixed(2)}</p>
            {invoiceTarget.notes && <p className="text-xs text-gray-500 mt-2">Notes: {invoiceTarget.notes}</p>}
            <p className="text-center text-xs text-gray-400 mt-6">Thank you for your business!</p>
          </div>
        )}
      </div>
    </div>
  );
}
