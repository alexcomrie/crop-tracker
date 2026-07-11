import React, { useState } from 'react';
import { CalcSection } from '../ResultCard';

type Op = '+' | '-' | '×' | '÷' | null;
type CalcMode = 'basic' | 'converter';

// All conversion factors relative to base unit (mL for volume, g for weight)
const VOLUME_UNITS = [
  { label: 'Milliliters (mL)', factor: 1 },
  { label: 'Liters (L)', factor: 1000 },
  { label: 'Gallons (gal)', factor: 3785.41 },
  { label: 'Fluid ounces (fl oz)', factor: 29.5735 },
  { label: 'Teaspoons (tsp)', factor: 5 },
  { label: 'Tablespoons (Tbsp)', factor: 15 },
  { label: 'Cups (cup)', factor: 237 },
  { label: '¼ Cups (¼ cup)', factor: 59.25 },
  { label: '½ Cups (½ cup)', factor: 118.5 },
];

const WEIGHT_UNITS = [
  { label: 'Grams (g)', factor: 1 },
  { label: 'Kilograms (kg)', factor: 1000 },
  { label: 'Ounces (oz)', factor: 28.35 },
  { label: 'Pounds (lb)', factor: 453.592 },
];

const LENGTH_UNITS = [
  { label: 'Inches (in)', factor: 0.0254 },
  { label: 'Feet (ft)', factor: 0.3048 },
  { label: 'Centimeters (cm)', factor: 0.01 },
  { label: 'Meters (m)', factor: 1 },
];

const AREA_UNITS = [
  { label: 'Sq Feet (sq ft)', factor: 0.092903 },
  { label: 'Sq Meters (sq m)', factor: 1 },
  { label: 'Acres (ac)', factor: 4046.86 },
  { label: 'Hectares (ha)', factor: 10000 },
];

type Cat = 'length' | 'area' | 'weight' | 'volume';

const ALL_UNITS: Record<Cat, { label: string; factor: number }[]> = {
  length: LENGTH_UNITS,
  area: AREA_UNITS,
  weight: WEIGHT_UNITS,
  volume: VOLUME_UNITS,
};

const CAT_NAMES: Record<Cat, string> = {
  length: 'Length',
  area: 'Area',
  weight: 'Weight',
  volume: 'Volume',
};

export default function RegularCalc() {
  const [mode, setMode] = useState<CalcMode>('basic');

  return (
    <CalcSection title="Regular Calculator">
      <p className="text-sm text-gray-500 mb-3">Basic arithmetic and unit converter for farm math.</p>
      <div className="flex gap-2 mb-3">
        <button onClick={() => setMode('basic')}
          className={`flex-1 py-1.5 rounded-lg text-sm font-medium ${mode === 'basic' ? 'bg-green-700 text-white' : 'bg-gray-100 text-gray-700'}`}>
          Calculator
        </button>
        <button onClick={() => setMode('converter')}
          className={`flex-1 py-1.5 rounded-lg text-sm font-medium ${mode === 'converter' ? 'bg-green-700 text-white' : 'bg-gray-100 text-gray-700'}`}>
          Unit Converter
        </button>
      </div>
      {mode === 'basic' ? <BasicCalc /> : <UnitConverter />}
    </CalcSection>
  );
}

function BasicCalc() {
  const [display, setDisplay] = useState('0');
  const [prevValue, setPrevValue] = useState<number | null>(null);
  const [op, setOp] = useState<Op>(null);
  const [waitingForOperand, setWaiting] = useState(false);

  const inputDigit = (digit: string) => {
    if (waitingForOperand) {
      setDisplay(digit);
      setWaiting(false);
    } else {
      setDisplay(display === '0' ? digit : display + digit);
    }
  };

  const inputDecimal = () => {
    if (waitingForOperand) {
      setDisplay('0.');
      setWaiting(false);
      return;
    }
    if (!display.includes('.')) {
      setDisplay(display + '.');
    }
  };

  const clear = () => {
    setDisplay('0');
    setPrevValue(null);
    setOp(null);
    setWaiting(false);
  };

  const performOp = (nextOp: Op) => {
    const current = parseFloat(display);
    if (prevValue !== null && op && !waitingForOperand) {
      const result = calculate(prevValue, current, op);
      setDisplay(String(result));
      setPrevValue(result);
    } else {
      setPrevValue(current);
    }
    setOp(nextOp);
    setWaiting(true);
  };

  const calculate = (a: number, b: number, operation: Op): number => {
    switch (operation) {
      case '+': return a + b;
      case '-': return a - b;
      case '×': return a * b;
      case '÷': return b !== 0 ? a / b : 0;
      default: return b;
    }
  };

  const equals = () => {
    const current = parseFloat(display);
    if (prevValue !== null && op) {
      const result = calculate(prevValue, current, op);
      setDisplay(String(result));
      setPrevValue(null);
      setOp(null);
      setWaiting(true);
    }
  };

  const btnClass = 'h-14 rounded-xl text-lg font-semibold active:scale-95 transition-all';
  const numBtn = `${btnClass} bg-gray-100 text-gray-900 hover:bg-gray-200`;
  const opBtn = `${btnClass} bg-green-100 text-green-700 hover:bg-green-200`;
  const eqBtn = `${btnClass} bg-green-600 text-white hover:bg-green-700`;
  const clrBtn = `${btnClass} bg-red-50 text-red-600 hover:bg-red-100`;

  const expression = prevValue !== null && op ? `${prevValue} ${op}` : '';

  return (
    <div className="bg-white rounded-xl border p-4">
      <div className="bg-gray-50 rounded-xl px-4 py-2 mb-1 text-right min-h-[2rem]">
        <span className="text-sm font-mono text-gray-400">{expression}</span>
      </div>
      <div className="bg-gray-50 rounded-xl px-4 pb-3 text-right">
        <span className="text-3xl font-mono font-bold text-gray-900">{display}</span>
      </div>
      <div className="grid grid-cols-4 gap-2">
        <button className={clrBtn} onClick={clear}>AC</button>
        <button className={opBtn} onClick={() => performOp('÷')}>÷</button>
        <button className={opBtn} onClick={() => performOp('×')}>×</button>
        <button className={opBtn} onClick={() => performOp('-')}>−</button>

        <button className={numBtn} onClick={() => inputDigit('7')}>7</button>
        <button className={numBtn} onClick={() => inputDigit('8')}>8</button>
        <button className={numBtn} onClick={() => inputDigit('9')}>9</button>
        <button className={opBtn} onClick={() => performOp('+')}>+</button>

        <button className={numBtn} onClick={() => inputDigit('4')}>4</button>
        <button className={numBtn} onClick={() => inputDigit('5')}>5</button>
        <button className={numBtn} onClick={() => inputDigit('6')}>6</button>
        <button className={eqBtn} onClick={equals}>=</button>

        <button className={numBtn} onClick={() => inputDigit('1')}>1</button>
        <button className={numBtn} onClick={() => inputDigit('2')}>2</button>
        <button className={numBtn} onClick={() => inputDigit('3')}>3</button>
        <div />

        <button className={`${numBtn} col-span-2`} onClick={() => inputDigit('0')}>0</button>
        <button className={numBtn} onClick={inputDecimal}>.</button>
        <div />
      </div>
    </div>
  );
}

function UnitConverter() {
  const [category, setCategory] = useState<Cat>('length');
  const [fromUnit, setFromUnit] = useState(0);
  const [toUnit, setToUnit] = useState(1);
  const [inputVal, setInputVal] = useState('1');
  const [result, setResult] = useState('');

  const units = ALL_UNITS[category];

  const convert = () => {
    const val = parseFloat(inputVal);
    if (isNaN(val)) return;
    const base = val * units[fromUnit].factor;
    const converted = base / units[toUnit].factor;
    const labelFrom = units[fromUnit].label.split(' (')[0];
    const labelTo = units[toUnit].label.split(' (')[0];
    const display = converted < 0.001 ? converted.toExponential(3) : converted >= 10000 ? converted.toLocaleString(undefined, { maximumFractionDigits: 1 }) : converted.toFixed(converted < 1 ? 4 : converted < 100 ? 2 : 1);
    setResult(`${val} ${labelFrom} = ${display} ${labelTo}`);
  };

  const swap = () => {
    const tmp = fromUnit;
    setFromUnit(toUnit);
    setToUnit(tmp);
    if (result) setTimeout(convert, 0);
  };

  return (
    <div className="bg-white rounded-xl border p-4 space-y-3">
      <div className="flex gap-2">
        {(Object.keys(CAT_NAMES) as Cat[]).map(c => (
          <button key={c} onClick={() => { setCategory(c); setFromUnit(0); setToUnit(Math.min(1, ALL_UNITS[c].length - 1)); setResult(''); }}
            className={`flex-1 py-1.5 rounded-lg text-xs font-medium ${category === c ? 'bg-green-700 text-white' : 'bg-gray-100 text-gray-700'}`}>
            {CAT_NAMES[c]}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-5 gap-2 items-center">
        <div className="col-span-2">
          <label className="text-[10px] text-gray-400 block mb-0.5">From</label>
          <select className="w-full border rounded-lg p-2 text-sm bg-white" value={fromUnit} onChange={e => { setFromUnit(Number(e.target.value)); setResult(''); }}>
            {units.map((u, i) => <option key={i} value={i}>{u.label}</option>)}
          </select>
        </div>

        <button onClick={swap} className="mt-4 flex justify-center">
          <svg className="w-5 h-5 text-green-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
          </svg>
        </button>

        <div className="col-span-2">
          <label className="text-[10px] text-gray-400 block mb-0.5">To</label>
          <select className="w-full border rounded-lg p-2 text-sm bg-white" value={toUnit} onChange={e => { setToUnit(Number(e.target.value)); setResult(''); }}>
            {units.map((u, i) => <option key={i} value={i}>{u.label}</option>)}
          </select>
        </div>
      </div>

      <div className="flex gap-2">
        <input type="number" className="flex-1 border rounded-lg p-2 text-sm" value={inputVal} onChange={e => { setInputVal(e.target.value); setResult(''); }} placeholder="Value" />
        <button onClick={convert} className="px-4 py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700">Convert</button>
      </div>

      {result && (
        <div className="bg-green-50 rounded-lg p-3 text-center">
          <p className="text-sm font-semibold text-green-800">{result}</p>
        </div>
      )}
    </div>
  );
}
