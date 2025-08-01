type Numbery = number | bigint;

export function bigIntMin<n extends Numbery>(...args: n[]) {
  return args.reduce((min, current) => (current < min ? current : min));
}

export function bigIntMax<n extends Numbery>(...args: n[]) {
  return args.reduce((max, current) => (current > max ? current : max));
}