/// <reference lib="webworker" />
// Worker chạy code xe: bind postMessage cho riêng runtime, chặn API nguy hiểm, rồi chuyển tin cho handler.

import { hardenGlobalScope, hardenRealm } from './harden';
import type { ToWorker } from './protocol';
import { createWorkerHandler } from './worker-handler';

const scope = self as unknown as DedicatedWorkerGlobalScope;
const handle = createWorkerHandler(scope.postMessage.bind(scope));
hardenGlobalScope(scope);
hardenRealm(scope as unknown as Parameters<typeof hardenRealm>[0]);

scope.addEventListener('message', (ev: MessageEvent<ToWorker>) => handle(ev.data));
