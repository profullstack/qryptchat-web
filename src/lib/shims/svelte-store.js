// Svelte store shim for Next.js/React compatibility

const UNSET = Symbol('UNSET');

export function writable(initialValue) {
  let value = initialValue;
  const subscribers = new Set();

  function set(newValue) {
    value = newValue;
    subscribers.forEach((fn) => fn(value));
  }

  function update(fn) {
    set(fn(value));
  }

  function subscribe(fn) {
    subscribers.add(fn);
    fn(value); // emit current value immediately
    return () => subscribers.delete(fn);
  }

  return { subscribe, set, update };
}

export function derived(stores, fn, initialValue) {
  const storeArray = Array.isArray(stores) ? stores : [stores];
  const values = storeArray.map(() => UNSET);
  let initialized = false;

  const result = writable(initialValue);
  let pendingSet = null;

  function compute() {
    // Only compute if all source stores have emitted at least once
    if (values.some((v) => v === UNSET)) return;

    const currentValues = Array.isArray(stores) ? values.slice() : values[0];
    const newValue = fn(currentValues, (v) => result.set(v));
    if (newValue !== undefined) {
      result.set(newValue);
    }
    initialized = true;
  }

  storeArray.forEach((s, i) => {
    s.subscribe((v) => {
      values[i] = v;
      compute();
    });
  });

  return { subscribe: result.subscribe };
}

export function get(store) {
  let value;
  const unsub = store.subscribe((v) => { value = v; });
  unsub();
  return value;
}

export function readable(initialValue, start) {
  const store = writable(initialValue);
  if (start) start(store.set, store.update);
  return { subscribe: store.subscribe };
}
