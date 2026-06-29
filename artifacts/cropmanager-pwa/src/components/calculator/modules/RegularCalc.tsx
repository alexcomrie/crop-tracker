import React, { useState } from 'react';
import { CalcSection } from '../ResultCard';

type Op = '+' | '-' | '×' | '÷' | null;

export default function RegularCalc() {
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

  return (
    <CalcSection title="Regular Calculator">
      <p className="text-sm text-gray-500">Basic arithmetic calculator for quick farm math.</p>
      <div className="bg-white rounded-xl border p-4">
        <div className="bg-gray-50 rounded-xl px-4 py-3 mb-3 text-right">
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
    </CalcSection>
  );
}
