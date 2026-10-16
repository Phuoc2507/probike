/// <reference lib="webworker" />
// Worker chạy code xe. Chỉ là lớp vỏ quanh ControllerCore.

import { ControllerCore } from './core';
import { hardenGlobalScope } from './harden';
import type { FromWorker, SerializedError, ToWorker } from './protocol';
import { ControllerError } from './errors';

const scope = self as unknown as DedicatedWorkerGlobalScope;
const post = scope.postMessage.bind(scope);
hardenGlobalScope(scope);

let core = new ControllerCore();

function serialize(e: unknown): SerializedError {
  if (e instanceof ControllerError) return { message: e.message, detail: e.detail, line: e.line };
  const msg = e instanceof Error ? e.message : String(e);
  return { message: msg, detail: msg };
}

scope.addEventListener('message', (ev: MessageEvent<ToWorker>) => {
  const msg = ev.data;
  if (msg.type === 'load') {
    core = new ControllerCore(msg.options);
    const res = core.load(msg.source);
    const out: FromWorker = {
      type: 'loaded', id: msg.id, ok: res.ok,
      error: res.ok ? undefined : { message: res.error, detail: res.error, line: res.line },
      logs: core.drainLogs(), plots: core.drainPlots(),
    };
    post(out);
  } else if (msg.type === 'tick') {
    let out: FromWorker;
    try {
      const cmd = core.tick(msg.frame);
      out = { type: 'ticked', id: msg.id, cmd, logs: core.drainLogs(), plots: core.drainPlots() };
    } catch (e) {
      out = { type: 'ticked', id: msg.id, error: serialize(e), logs: core.drainLogs(), plots: core.drainPlots() };
    }
    post(out);
  } else if (msg.type === 'params') {
    core.setParams(msg.params);
  }
});
