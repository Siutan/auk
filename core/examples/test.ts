// calc-proxy.ts
type FuncMap = Record<string, (...args: any[]) => any>;

class Calc<F extends FuncMap = {}> {
  private readonly _functions: F;

  constructor(functions: F = {} as F) {
    this._functions = functions;
  }

  registerFunction<
    Name extends string,
    Fn extends (...args: any[]) => any
  >(
    name: Name,
    fn: Fn
  ): Calc<F & { [K in Name]: Fn }> {
    return new Calc({
      ...this._functions,
      [name]: fn,
    }) as any;
  }

  asMethods(): F {
    return this._functions;
  }
}

// Usage
function add(a: number, b: number): number {
  return a + b;
}
function mul(a: number, b: number): number {
  return a * b;
}

const calc = new Calc()
  .registerFunction('add', add)
  .registerFunction('mul', mul);

const methods = calc.asMethods();
const sum = methods.add(1, 2); // type-checked
const product = methods.mul(3, 4); // type-checked
