import React, { useState, useRef, useEffect } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import db from '../../db/db';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { ChevronLeft, Save, Upload, Trash2, Coins, Bug } from 'lucide-react';
import { toast } from 'sonner';
import type { PosSettings } from '../../types';

interface Props {
  onBack: () => void;
}

export function PrintLayoutEditor({ onBack }: Props) {
  const settingsData = useLiveQuery(() => db.posSettings.toArray(), []);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const existing = settingsData && settingsData.length > 0 ? settingsData[0] : null;

  const [businessName, setBusinessName] = useState(existing?.businessName || 'My Farm');
  const [businessAddress, setBusinessAddress] = useState(existing?.businessAddress || '');
  const [businessPhone, setBusinessPhone] = useState(existing?.businessPhone || '');
  const [businessEmail, setBusinessEmail] = useState(existing?.businessEmail || '');
  const [taxLabel, setTaxLabel] = useState(existing?.taxLabel || 'Tax');
  const [taxRate, setTaxRate] = useState(existing?.taxRate || 0);
  const [receiptFooter, setReceiptFooter] = useState(existing?.receiptFooter || 'Thank you for your support!');
  const [logoDataUrl, setLogoDataUrl] = useState(existing?.logoDataUrl || '');
  const [showLogo, setShowLogo] = useState(existing?.showLogo ?? true);
  const [showTax, setShowTax] = useState(existing?.showTax ?? true);
  const [showCustomer, setShowCustomer] = useState(existing?.showCustomer ?? true);
  const [printCharPerLine, setPrintCharPerLine] = useState(existing?.printCharPerLine || 32);
  const [pointsRate, setPointsRate] = useState(existing?.pointsRate ?? 1);
  const [pointsRedemptionRate, setPointsRedemptionRate] = useState(existing?.pointsRedemptionRate ?? 100);
  const [testMode, setTestMode] = useState(existing?.testMode ?? false);

  useEffect(() => {
    if (!existing) return;
    setBusinessName(existing.businessName || 'My Farm');
    setBusinessAddress(existing.businessAddress || '');
    setBusinessPhone(existing.businessPhone || '');
    setBusinessEmail(existing.businessEmail || '');
    setTaxLabel(existing.taxLabel || 'Tax');
    setTaxRate(existing.taxRate || 0);
    setReceiptFooter(existing.receiptFooter || 'Thank you for your support!');
    setLogoDataUrl(existing.logoDataUrl || '');
    setShowLogo(existing.showLogo ?? true);
    setShowTax(existing.showTax ?? true);
    setShowCustomer(existing.showCustomer ?? true);
    setPrintCharPerLine(existing.printCharPerLine || 32);
    setPointsRate(existing.pointsRate ?? 1);
    setPointsRedemptionRate(existing.pointsRedemptionRate ?? 100);
    setTestMode(existing.testMode ?? false);
  }, [existing]);

  async function handleSave() {
    const data: PosSettings = {
      id: 'default',
      businessName,
      businessAddress,
      businessPhone,
      businessEmail,
      taxLabel,
      taxRate,
      currency: '$',
      receiptFooter,
      logoDataUrl,
      printWidth: 384,
      printCharPerLine,
      showLogo,
      showTax,
      showCustomer,
      defaultPaymentMethod: 'cash',
      pointsRate,
      pointsRedemptionRate,
      testMode,
    };
    await db.posSettings.put(data);
    toast.success('Print settings saved');
  }

  function handleLogoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      setLogoDataUrl(reader.result as string);
    };
    reader.readAsDataURL(file);
  }

  return (
    <div className="flex flex-col">
      <div className="bg-white border-b px-4 py-3 flex items-center gap-3">
        <button onClick={onBack} className="p-1 rounded-lg hover:bg-gray-100"><ChevronLeft className="w-5 h-5 text-gray-600" /></button>
        <h1 className="font-bold text-lg flex-1">Print Settings</h1>
        <Button size="sm" onClick={handleSave} className="bg-green-600"><Save className="w-4 h-4 mr-1" /> Save</Button>
      </div>
      <div className="flex-1 overflow-y-auto p-4 grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Settings form */}
        <div className="space-y-4">
          <div>
            <h3 className="font-semibold text-sm mb-3">Business Info</h3>
            <div className="space-y-3">
              <div className="flex flex-col gap-1">
                <Label>Business Name</Label>
                <Input value={businessName} onChange={e => setBusinessName(e.target.value)} />
              </div>
              <div className="flex flex-col gap-1">
                <Label>Address</Label>
                <Input value={businessAddress} onChange={e => setBusinessAddress(e.target.value)} />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="flex flex-col gap-1">
                  <Label>Phone</Label>
                  <Input value={businessPhone} onChange={e => setBusinessPhone(e.target.value)} />
                </div>
                <div className="flex flex-col gap-1">
                  <Label>Email</Label>
                  <Input value={businessEmail} onChange={e => setBusinessEmail(e.target.value)} />
                </div>
              </div>
            </div>
          </div>
          <div>
            <h3 className="font-semibold text-sm mb-3">Logo</h3>
            <div className="space-y-3">
              <input ref={fileInputRef} type="file" accept="image/*" onChange={handleLogoUpload} className="hidden" />
              <div className="flex items-center gap-3">
                <Button variant="outline" onClick={() => fileInputRef.current?.click()}><Upload className="w-4 h-4 mr-1" /> Upload Logo</Button>
                {logoDataUrl && (
                  <Button variant="ghost" size="sm" className="text-red-500" onClick={() => setLogoDataUrl('')}>
                    <Trash2 className="w-4 h-4" />
                  </Button>
                )}
              </div>
              {logoDataUrl && (
                <div className="border rounded-xl p-2 inline-block">
                  <img src={logoDataUrl} alt="Logo preview" className="h-12 object-contain" />
                </div>
              )}
            </div>
          </div>
          <div>
            <h3 className="font-semibold text-sm mb-3">Tax & Receipt</h3>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-2">
                <div className="flex flex-col gap-1">
                  <Label>Tax Label</Label>
                  <Input value={taxLabel} onChange={e => setTaxLabel(e.target.value)} />
                </div>
                <div className="flex flex-col gap-1">
                  <Label>Tax Rate (%)</Label>
                  <Input type="number" value={taxRate} onChange={e => setTaxRate(Number(e.target.value))} min={0} max={100} step={0.5} />
                </div>
              </div>
              <div className="flex flex-col gap-1">
                <Label>Receipt Footer</Label>
                <Input value={receiptFooter} onChange={e => setReceiptFooter(e.target.value)} />
              </div>
              <div className="flex flex-col gap-1">
                <Label>Characters per Line</Label>
                <Input type="number" value={printCharPerLine} onChange={e => setPrintCharPerLine(Number(e.target.value))} min={16} max={48} />
              </div>
            </div>
          </div>
          <div>
            <h3 className="font-semibold text-sm mb-3">Display Options</h3>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label>Show Logo on Receipt</Label>
                <Switch checked={showLogo} onCheckedChange={setShowLogo} />
              </div>
              <div className="flex items-center justify-between">
                <Label>Show Tax Line</Label>
                <Switch checked={showTax} onCheckedChange={setShowTax} />
              </div>
              <div className="flex items-center justify-between">
                <Label>Show Customer Name</Label>
                <Switch checked={showCustomer} onCheckedChange={setShowCustomer} />
              </div>
            </div>
          </div>
          <div>
            <h3 className="font-semibold text-sm mb-3 flex items-center gap-1"><Coins className="w-4 h-4 text-amber-600" /> Loyalty Points</h3>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-2">
                <div className="flex flex-col gap-1">
                  <Label>Points per $1</Label>
                  <Input type="number" value={pointsRate} onChange={e => setPointsRate(Number(e.target.value))} min={0} max={100} step={0.5} />
                </div>
                <div className="flex flex-col gap-1">
                  <Label>Points per $1 discount</Label>
                  <Input type="number" value={pointsRedemptionRate} onChange={e => setPointsRedemptionRate(Number(e.target.value))} min={1} step={1} />
                </div>
              </div>
              <p className="text-xs text-gray-400">e.g. {pointsRate} pt(s) per $1 spent, {pointsRedemptionRate} pts = ${(pointsRedemptionRate / (pointsRedemptionRate || 1)).toFixed(2)} discount</p>
            </div>
          </div>
          <div>
            <h3 className="font-semibold text-sm mb-3 flex items-center gap-1"><Bug className="w-4 h-4 text-orange-500" /> Testing</h3>
            <div className="flex items-center justify-between">
              <div>
                <Label>Test Mode</Label>
                <p className="text-xs text-gray-400">When on, sales are NOT recorded to diary or farm ledger</p>
              </div>
              <Switch checked={testMode} onCheckedChange={setTestMode} />
            </div>
          </div>
        </div>

        {/* Preview */}
        <div>
          <h3 className="font-semibold text-sm mb-3">Receipt Preview</h3>
          <div className="bg-white border rounded-xl p-4 font-mono text-xs leading-relaxed" style={{ maxWidth: `${printCharPerLine * 8}px` }}>
            {businessName && <p className="font-bold text-sm text-center mb-1">{businessName}</p>}
            {logoDataUrl && showLogo && <div className="text-center mb-1"><img src={logoDataUrl} alt="Logo" className="h-8 mx-auto object-contain" /></div>}
            {businessAddress && <p className="text-center text-gray-500">{businessAddress}</p>}
            {businessPhone && <p className="text-center text-gray-500">Tel: {businessPhone}</p>}
            {businessEmail && <p className="text-center text-gray-500">{businessEmail}</p>}
            <p className="text-center text-gray-400">{'─'.repeat(printCharPerLine)}</p>
            <p className="text-center font-bold">Receipt #000001</p>
            <p className="text-center text-gray-400">{'─'.repeat(printCharPerLine)}</p>
            <p className="text-gray-500">Item{' '.repeat(14)}Qty{' '.repeat(4)}Price{' '.repeat(3)}Total</p>
            <p className="text-gray-400">{'─'.repeat(printCharPerLine)}</p>
            <p>{'Tomato'.padEnd(16)}{'1'.padEnd(6)}{'3.00'.padEnd(6)}{'3.00'}</p>
            <p>{'Lettuce'.padEnd(16)}{'2'.padEnd(6)}{'2.50'.padEnd(6)}{'5.00'}</p>
            <p className="text-gray-400">{'─'.repeat(printCharPerLine)}</p>
            <p className="flex justify-between"><span>Subtotal:</span><span>{'$8.00'.padStart(10)}</span></p>
            {showTax && taxRate > 0 && <p className="flex justify-between"><span>{taxLabel} ({taxRate}%):</span><span>{'$0.00'.padStart(10)}</span></p>}
            <p className="text-gray-400">{'─'.repeat(printCharPerLine)}</p>
            <p className="flex justify-between font-bold"><span>TOTAL:</span><span className="text-green-700">{'$8.00'.padStart(10)}</span></p>
            <p className="text-gray-400">{'─'.repeat(printCharPerLine)}</p>
            <p className="text-center text-gray-500">{receiptFooter}</p>
          </div>
        </div>
      </div>
    </div>
  );
}
