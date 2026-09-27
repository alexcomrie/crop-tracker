/**
 * Value — scalar autograd node, TS port of karpathy/microgpt.py: Value
 * Dependency-free, mirrors Python semantics for parity.
 */
export class Value {
  data: number;
  grad: number;
  _children: Value[];
  _localGrads: number[];

  constructor(data: number, children: Value[] = [], localGrads: number[] = []) {
    this.data = data;
    this.grad = 0;
    this._children = children;
    this._localGrads = localGrads;
  }

  add(other: Value | number): Value {
    const o = other instanceof Value ? other : new Value(other);
    return new Value(this.data + o.data, [this, o], [1, 1]);
  }
  mul(other: Value | number): Value {
    const o = other instanceof Value ? other : new Value(other);
    return new Value(this.data * o.data, [this, o], [o.data, this.data]);
  }
  pow(exp: number): Value {
    return new Value(Math.pow(this.data, exp), [this], [exp * Math.pow(this.data, exp - 1)]);
  }
  log(): Value {
    return new Value(Math.log(this.data), [this], [1 / this.data]);
  }
  exp(): Value {
    const e = Math.exp(this.data);
    return new Value(e, [this], [e]);
  }
  relu(): Value {
    return new Value(Math.max(0, this.data), [this], [this.data > 0 ? 1 : 0]);
  }
  neg(): Value { return this.mul(-1); }
  sub(other: Value | number): Value {
    const o = other instanceof Value ? other : new Value(other);
    return this.add(o.neg());
  }
  div(other: Value | number): Value {
    const o = other instanceof Value ? other : new Value(other);
    return this.mul(o.pow(-1));
  }

  backward(): void {
    const topo: Value[] = [];
    const visited = new Set<Value>();
    const build = (v: Value) => {
      if (!visited.has(v)) {
        visited.add(v);
        for (const c of v._children) build(c);
        topo.push(v);
      }
    };
    build(this);
    this.grad = 1;
    for (let i = topo.length - 1; i >= 0; i--) {
      const v = topo[i];
      for (let j = 0; j < v._children.length; j++) {
        v._children[j].grad += v._localGrads[j] * v.grad;
      }
    }
  }

  // helpers for numeric ops on arrays
  static sum(vals: Value[]): Value {
    let out = new Value(0);
    for (const v of vals) out = out.add(v);
    return out;
  }
}
