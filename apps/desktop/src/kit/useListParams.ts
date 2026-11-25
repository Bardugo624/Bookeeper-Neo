import { useCallback, useMemo, useRef } from 'react';
import { useSearchParams } from 'react-router';

export interface ParamSpec<T> {
  default: T;
  /** Reads the raw text; `undefined` means "not valid", which falls back to the default. */
  parse(raw: string): T | undefined;
  serialize(value: T): string;
}

export type ParamSchema<V> = { [K in keyof V]: ParamSpec<V[K]> };

export const stringParam = (def = ''): ParamSpec<string> => ({ default: def, parse: (raw) => raw, serialize: (v) => v });

export function oneOfParam<V extends string>(allowed: readonly V[], def: V): ParamSpec<V> {
  return { default: def, parse: (raw) => allowed.find((a) => a === raw), serialize: (v) => v };
}

export function intParam(def: number, min = 0): ParamSpec<number> {
  return {
    default: def,
    parse: (raw) => (/^\d+$/.test(raw) && Number(raw) >= min ? Number(raw) : undefined),
    serialize: (v) => String(v),
  };
}

export interface ListParams<V> {
  values: V;
  /** Changes some values; the history entry is replaced, not added. */
  set(patch: Partial<V>): void;
  /** Back to every default. */
  reset(): void;
  /** `?…` to hand to a link back to this list. */
  search: string;
}

/** Search, filter and sort of a list, kept in the address. Values equal to their default are left out. */
export function useListParams<V>(schema: ParamSchema<V>): ListParams<V> {
  const [params, setParams] = useSearchParams();
  // Address as last written: react-router's functional form does not see a write made earlier in the same handler.
  const latest = useRef('');
  latest.current = params.toString();
  const keys = Object.keys(schema) as Array<keyof V & string>;

  const values = {} as V;
  for (const k of keys) {
    const raw = params.get(k);
    const parsed = raw === null ? undefined : schema[k].parse(raw);
    values[k] = parsed === undefined ? schema[k].default : parsed;
  }
  const signature = keys.map((k) => schema[k].serialize(values[k])).join('\u0000');

  const write = useCallback(
    (patch: Partial<V>) => {
      const out = new URLSearchParams(latest.current);
      for (const k of Object.keys(patch) as Array<keyof V & string>) {
        const text = schema[k].serialize(patch[k] as V[typeof k]);
        if (text === schema[k].serialize(schema[k].default)) out.delete(k);
        else out.set(k, text);
      }
      latest.current = out.toString();
      setParams(out, { replace: true });
    },
    // `schema` is usually a module constant; `keys` derives from it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [setParams, schema],
  );

  const search = params.toString() ? `?${params.toString()}` : '';
  return useMemo<ListParams<V>>(
    () => ({
      values,
      set: (patch) => write(patch),
      reset: () => write(Object.fromEntries(keys.map((k) => [k, schema[k].default])) as Partial<V>),
      search,
    }),
    // `values` is fully determined by `signature`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [signature, search, write],
  );
}
