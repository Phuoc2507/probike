// Logic xử lý tin trong Worker (tách khỏi controller.worker.ts để test được trong Node bằng worker giả).

import { ControllerCore } from './core';
import { ControllerError } from './errors';
import type { FromWorker, SerializedError, ToWorker } from './protocol';

function serialize(e: unknown): SerializedError {
  if (e instanceof ControllerError) return { message: e.message, detail: e.detail, line: e.line };
  const msg = e instanceof Error ? e.message : String(e);
  return { message: msg, detail: msg };
}

/** Tạo hàm xử lý tin. `post` phải là postMessage đã bind sẵn TRƯỚC khi chặn postMessage toàn cục. */
export function createWorkerHandler(post: (msg: FromWorker) => void): (msg: ToWorker) => void {
  let core = new ControllerCore();
  let nonce = '';
  return (msg) => {
    if (msg.type === 'load') {
      nonce = msg.nonce;
      core = new ControllerCore(msg.options);
      const res = core.load(msg.source);
      post({
        type: 'loaded', id: msg.id, nonce, ok: res.ok,
        error: res.ok ? undefined : { message: res.error, detail: res.error, line: res.line },
        logs: core.drainLogs(), plots: core.drainPlots(),
      });
    } else if (msg.type === 'tick') {
      let out: FromWorker;
      try {
        const cmd = core.tick(msg.frame);
        out = { type: 'ticked', id: msg.id, nonce, cmd, logs: core.drainLogs(), plots: core.drainPlots() };
      } catch (e) {
        out = { type: 'ticked', id: msg.id, nonce, error: serialize(e), logs: core.drainLogs(), plots: core.drainPlots() };
      }
      post(out);
    } else if (msg.type === 'params') {
      core.setParams(msg.params);
    }
  };
}
